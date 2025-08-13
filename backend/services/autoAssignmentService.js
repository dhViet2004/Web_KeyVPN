const { executeQuery } = require('../config/database');

console.log('=== AutoAssignmentService file loaded ===');

class AutoAssignmentService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    console.log('AutoAssignmentService constructor called');
  }

  // Start the auto assignment service
  async start() {
    if (this.isRunning) {
      console.log('Auto assignment service is already running');
      return;
    }

    try {
      // Get auto assignment settings
      const settings = await this.getSettings();
      
      if (!settings.enabled) {
        console.log('Auto assignment is disabled');
        return;
      }

      console.log(`🤖 Auto assignment service started - Check every ${settings.checkInterval} minutes, transfer keys within ${settings.beforeExpiry} minutes of expiry if new accounts available`);
      
      this.isRunning = true;

      // Set up interval to check for expired accounts
      this.intervalId = setInterval(async () => {
        try {
          const currentSettings = await this.getSettings();
          if (currentSettings.enabled) {
            await this.processExpiredAccounts(currentSettings);
            await this.cleanupExpiredAccounts(currentSettings);
          } else {
            this.stop();
          }
        } catch (error) {
          console.error('Auto assignment interval error:', error);
        }
      }, settings.checkInterval * 60 * 1000); // Convert minutes to milliseconds

    } catch (error) {
      console.error('Failed to start auto assignment service:', error);
      this.isRunning = false;
    }
  }

  // Stop the auto assignment service
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 Auto assignment service stopped');
  }

  // Get settings from database
  async getSettings() {
    const query = `
      SELECT setting_key, setting_value 
      FROM system_settings 
      WHERE setting_key IN ('auto_assignment_enabled', 'auto_assignment_before_expiry', 'auto_assignment_check_interval', 'auto_assignment_delete_expired')
    `;

    const result = await executeQuery(query);

    const settings = {
      enabled: false,
      beforeExpiry: 60, // minutes (1 hour) - changed from 5 hours to be more responsive
      checkInterval: 30, // minutes
      deleteExpiredAccounts: true
    };

    if (result.success && result.data.length > 0) {
      result.data.forEach(row => {
        switch (row.setting_key) {
          case 'auto_assignment_enabled':
            settings.enabled = row.setting_value === 'true';
            break;
          case 'auto_assignment_before_expiry':
            settings.beforeExpiry = parseInt(row.setting_value) || 300;
            break;
          case 'auto_assignment_check_interval':
            settings.checkInterval = parseInt(row.setting_value) || 30;
            break;
          case 'auto_assignment_delete_expired':
            settings.deleteExpiredAccounts = row.setting_value === 'true';
            break;
        }
      });
    }

    return settings;
  }

  // Process accounts that are expiring soon and transfer keys to new empty accounts
  async processExpiredAccounts(settings) {
    try {
      console.log('🔍 Checking for accounts expiring soon and available new accounts...');
      console.log(`🕐 Looking for accounts expiring within ${settings.beforeExpiry} minutes`);

      // STEP 1: Process keys from expiring/expired accounts
      await this.processKeysFromExpiredAccounts(settings);
      
      // STEP 2: Process orphaned keys (keys in 'chờ' status without any account assignment)
      await this.processOrphanedKeys(settings);

    } catch (error) {
      console.error('Error processing expired accounts:', error);
    }
  }

  // Process keys from expiring/expired accounts
  async processKeysFromExpiredAccounts(settings) {
    try {
      console.log('🔍 Step 1: Checking keys from expiring/expired accounts...');

      // Find accounts that will expire within the specified time (in minutes) and group all keys by account
      // ALSO include accounts that are already expired and still have keys
      const expiringAccountsQuery = `
        SELECT 
          va.id as account_id, 
          va.username, 
          va.expires_at,
          GROUP_CONCAT(ak.key_id) as key_ids,
          GROUP_CONCAT(vk.key_type) as key_types,
          COUNT(ak.key_id) as key_count,
          TIMESTAMPDIFF(MINUTE, NOW(), va.expires_at) as minutes_remaining,
          va.is_active
        FROM vpn_accounts va
        INNER JOIN account_keys ak ON va.id = ak.account_id
        INNER JOIN vpn_keys vk ON ak.key_id = vk.id
        WHERE va.expires_at IS NOT NULL
        AND ak.is_active = 1
        AND (
          -- Accounts expiring within the specified time (including already expired)
          TIMESTAMPDIFF(MINUTE, NOW(), va.expires_at) <= ?
          OR
          -- Already expired accounts that still have keys
          va.expires_at <= NOW()
        )
        GROUP BY va.id, va.username, va.expires_at, va.is_active
        ORDER BY va.expires_at ASC
      `;

      console.log(`🔍 Executing expired accounts query with beforeExpiry: ${settings.beforeExpiry}`);
      const expiringResult = await executeQuery(expiringAccountsQuery, [settings.beforeExpiry]);

      console.log(`📊 Expired accounts query result:`, {
        success: expiringResult.success,
        dataLength: expiringResult.data?.length || 0,
        error: expiringResult.error
      });

      if (expiringResult.success && expiringResult.data.length > 0) {
        console.log('📋 Accounts found with keys to transfer from expired/expiring accounts:');
        expiringResult.data.forEach(acc => {
          const keyIds = acc.key_ids ? acc.key_ids.split(',') : [];
          const keyTypes = acc.key_types ? acc.key_types.split(',') : [];
          const accountStatus = acc.is_active ? 'active' : 'inactive';
          const expiryStatus = acc.minutes_remaining <= 0 ? 'EXPIRED' : 'expiring soon';
          
          console.log(`  - Account: ${acc.username} (${accountStatus}, ${expiryStatus})`);
          console.log(`    Expires: ${acc.expires_at}, minutes remaining: ${acc.minutes_remaining}`);
          console.log(`    Keys: ${acc.key_count} keys - IDs: [${keyIds.join(', ')}], Types: [${keyTypes.join(', ')}]`);
        });

        // Create queue from expired accounts
        const keyQueue = [];
        
        for (const expiredAccount of expiringResult.data) {
          const keyIds = expiredAccount.key_ids ? expiredAccount.key_ids.split(',').map(id => parseInt(id.trim())) : [];
          const keyTypes = expiredAccount.key_types ? expiredAccount.key_types.split(',').map(type => type.trim()) : [];
          
          // Add all keys from this account to the queue
          for (let i = 0; i < keyIds.length; i++) {
            const keyId = keyIds[i];
            const keyType = keyTypes[i] || '2key';
            
            keyQueue.push({
              keyId,
              keyType,
              sourceAccount: {
                account_id: expiredAccount.account_id,
                username: expiredAccount.username,
                expires_at: expiredAccount.expires_at,
                minutes_remaining: expiredAccount.minutes_remaining
              }
            });
          }
        }

        console.log(`📋 Created key transfer queue from expired accounts: ${keyQueue.length} keys`);
        
        if (keyQueue.length > 0) {
          await this.processKeyQueue(keyQueue, settings);
        }
      } else {
        console.log('✅ No expired/expiring accounts with keys found');
      }
    } catch (error) {
      console.error('Error processing keys from expired accounts:', error);
    }
  }

  // Process orphaned keys (keys in 'chờ' status without any account assignment) 
  async processOrphanedKeys(settings) {
    try {
      console.log('🔍 Step 2: Checking orphaned keys (keys in "chờ" status without account assignment)...');

      // Find keys that are in 'chờ' status and not assigned to any account
      const orphanedKeysQuery = `
        SELECT 
          vk.id as key_id,
          vk.code,
          vk.key_type,
          vk.status,
          vk.created_at
        FROM vpn_keys vk
        WHERE vk.status = 'chờ'
        AND vk.id NOT IN (
          SELECT DISTINCT ak.key_id 
          FROM account_keys ak 
          WHERE ak.is_active = 1
        )
        ORDER BY vk.created_at ASC
      `;

      console.log('🔍 Executing orphaned keys query...');
      const orphanedResult = await executeQuery(orphanedKeysQuery);

      console.log(`📊 Orphaned keys query result:`, {
        success: orphanedResult.success,
        dataLength: orphanedResult.data?.length || 0,
        error: orphanedResult.error
      });

      if (orphanedResult.success && orphanedResult.data.length > 0) {
        console.log('📋 Orphaned keys found (not assigned to any account):');
        orphanedResult.data.forEach(key => {
          console.log(`  - Key: ${key.code} (${key.key_type}) - ID: ${key.key_id}, Status: ${key.status}`);
        });

        // Create queue from orphaned keys
        const orphanedQueue = [];
        
        for (const key of orphanedResult.data) {
          orphanedQueue.push({
            keyId: key.key_id,
            keyType: key.key_type,
            sourceAccount: {
              account_id: null,
              username: 'ORPHANED_KEY',
              expires_at: null,
              minutes_remaining: null
            }
          });
        }

        console.log(`📋 Created orphaned key assignment queue: ${orphanedQueue.length} keys`);
        
        if (orphanedQueue.length > 0) {
          await this.processKeyQueue(orphanedQueue, settings);
        }
      } else {
        console.log('✅ No orphaned keys found');
      }
    } catch (error) {
      console.error('Error processing orphaned keys:', error);
    }
  }
  
  // Process the key transfer queue sequentially - one key at a time
  async processKeyQueue(keyQueue, settings) {
    try {
      console.log(`\n🔄 Starting sequential processing of ${keyQueue.length} keys in queue...`);
      
      let totalKeysTransferred = 0;
      let keysNotTransferred = [];
      const processedAccounts = new Set(); // Track which accounts we've processed keys from
      const accountsToDelete = new Set(); // Track accounts that need deletion after all their keys are transferred
      const usedTargetAccounts = new Map(); // Track how many keys we've assigned to each target account

      // Process each key in the queue one by one
      for (let i = 0; i < keyQueue.length; i++) {
        const keyItem = keyQueue[i];
        const { keyId, keyType, sourceAccount } = keyItem;
        
        console.log(`\n🔑 Processing key ${i + 1}/${keyQueue.length}: ${keyId} (${keyType}) from ${sourceAccount.username}`);
        
        // Tìm target account cho key này, loại trừ các account đã được sử dụng quá mức
        let targetAccount = null;
        let attempts = 0;
        const maxAttempts = 5;
        
        while (!targetAccount && attempts < maxAttempts) {
          attempts++;
          console.log(`🔍 Attempt ${attempts}/${maxAttempts} to find target account for key ${keyId}...`);
          
          // Lấy danh sách tất cả accounts phù hợp
          const potentialAccounts = await this.findAllSuitableTargetAccounts(keyType, sourceAccount.account_id);
          
          if (!potentialAccounts || potentialAccounts.length === 0) {
            console.log(`❌ No suitable accounts found for ${keyType} key ${keyId} (attempt ${attempts})`);
            break;
          }
          
          // Tìm account có ít keys nhất và còn slot
          let bestAccount = null;
          let bestScore = Infinity;
          
          for (const account of potentialAccounts) {
            const currentUsage = usedTargetAccounts.get(account.id) || 0;
            const maxSlots = keyType === '1key' ? 1 : keyType === '2key' ? 2 : 3;
            const totalUsed = (account.assigned_keys || 0) + currentUsage;
            
            if (totalUsed < maxSlots) {
              // Score: ưu tiên account có cùng key type và đã có key, sau đó đến account trống
              let score = account.priority * 100 + totalUsed;
              
              if (score < bestScore) {
                bestScore = score;
                bestAccount = account;
              }
            }
          }
          
          if (bestAccount) {
            targetAccount = bestAccount;
            console.log(`✅ Selected target account: ${targetAccount.username} (current: ${(targetAccount.assigned_keys || 0) + (usedTargetAccounts.get(targetAccount.id) || 0)}/${keyType === '1key' ? 1 : keyType === '2key' ? 2 : 3})`);
          } else {
            console.log(`⚠️ All suitable accounts are full, waiting 2 seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        if (!targetAccount) {
          keysNotTransferred.push({ keyId, keyType, sourceAccount: sourceAccount.username, reason: 'No available target account' });
          console.log(`❌ Failed to find target account for key ${keyId} after ${maxAttempts} attempts`);
          continue;
        }
        
        // Transfer this single key
        const transferred = await this.transferSingleKey(keyId, keyType, sourceAccount, targetAccount);
        
        if (transferred) {
          totalKeysTransferred++;
          
          // Cập nhật tracking của target account
          const currentUsage = usedTargetAccounts.get(targetAccount.id) || 0;
          usedTargetAccounts.set(targetAccount.id, currentUsage + 1);
          
          console.log(`✅ Successfully transferred key ${keyId} to ${targetAccount.username} (${i + 1}/${keyQueue.length})`);
          console.log(`📊 Target account ${targetAccount.username} now has: ${(targetAccount.assigned_keys || 0) + usedTargetAccounts.get(targetAccount.id)}/${keyType === '1key' ? 1 : keyType === '2key' ? 2 : 3} keys`);
          
          // Track that this account has had keys transferred
          processedAccounts.add(sourceAccount.account_id);
          
        } else {
          keysNotTransferred.push({ keyId, keyType, sourceAccount: sourceAccount.username, reason: 'Transfer operation failed' });
          console.log(`❌ Failed to transfer key ${keyId} (${i + 1}/${keyQueue.length}) - transfer operation failed`);
        }
        
        // Small delay between key transfers to allow database to stabilize
        if (i < keyQueue.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      // After processing all keys, determine which accounts can be safely deleted
      // Only delete accounts where ALL their keys were successfully transferred
      for (const accountId of processedAccounts) {
        const accountKeysInQueue = keyQueue.filter(item => item.sourceAccount.account_id === accountId);
        const accountKeysTransferred = keyQueue.filter(item => 
          item.sourceAccount.account_id === accountId && 
          !keysNotTransferred.some(failed => failed.keyId === item.keyId)
        );
        
        // Only mark for deletion if ALL keys from this account were transferred
        if (accountKeysTransferred.length === accountKeysInQueue.length && accountKeysTransferred.length > 0) {
          accountsToDelete.add(accountId);
          const accountInfo = keyQueue.find(item => item.sourceAccount.account_id === accountId)?.sourceAccount;
          console.log(`✅ All ${accountKeysInQueue.length}/${accountKeysInQueue.length} keys from ${accountInfo?.username} transferred - marked for cleanup`);
        } else {
          const accountInfo = keyQueue.find(item => item.sourceAccount.account_id === accountId)?.sourceAccount;
          console.log(`⚠️ Only ${accountKeysTransferred.length}/${accountKeysInQueue.length} keys from ${accountInfo?.username} transferred - keeping account`);
        }
      }

      // Summary
      console.log(`\n✅ Queue processing completed:`);
      console.log(`   - Total keys processed: ${keyQueue.length}`);
      console.log(`   - Keys transferred: ${totalKeysTransferred}`);
      console.log(`   - Keys failed: ${keysNotTransferred.length}`);
      console.log(`   - Accounts involved: ${processedAccounts.size}`);
      console.log(`   - Accounts ready for cleanup: ${accountsToDelete.size}`);
      console.log(`   - Target accounts used: ${usedTargetAccounts.size}`);

      // Log target account usage summary
      if (usedTargetAccounts.size > 0) {
        console.log(`\n📊 Target accounts usage summary:`);
        for (const [accountId, keysAssigned] of usedTargetAccounts) {
          console.log(`   - Account ID ${accountId}: ${keysAssigned} keys assigned`);
        }
      }

      if (keysNotTransferred.length > 0) {
        console.log(`\n❌ Failed key transfers:`);
        keysNotTransferred.forEach((key, index) => {
          console.log(`   ${index + 1}. Key ${key.keyId} (${key.keyType}) from ${key.sourceAccount} - ${key.reason}`);
        });
        
        console.log(`\n⚠️ Keys failed to transfer will remain in their source accounts until suitable target accounts become available`);
      }

      // Clean up source accounts that had ALL their keys successfully transferred
      if (settings.deleteExpiredAccounts && accountsToDelete.size > 0) {
        console.log(`\n🗑️ Cleaning up ${accountsToDelete.size} source accounts (only those with ALL keys transferred)...`);
        
        for (const accountId of accountsToDelete) {
          const accountInfo = keyQueue.find(item => item.sourceAccount.account_id === accountId)?.sourceAccount;
          if (accountInfo) {
            console.log(`🗑️ Deleting account ${accountInfo.username} - all keys successfully transferred`);
            await this.deleteExpiredAccountImmediate(accountInfo);
            await new Promise(resolve => setTimeout(resolve, 500)); // Delay between account deletions
          }
        }
        
        console.log(`✅ Completed cleanup of ${accountsToDelete.size} source accounts`);
      } else if (settings.deleteExpiredAccounts && accountsToDelete.size === 0) {
        console.log(`\n⚠️ No accounts marked for cleanup - some keys may not have been transferred successfully`);
      } else {
        console.log(`\n⚠️ Account deletion disabled - keeping all source accounts`);
      }

      return {
        totalKeys: keyQueue.length,
        transferred: totalKeysTransferred,
        failed: keysNotTransferred.length,
        accountsProcessed: processedAccounts.size,
        accountsCleaned: accountsToDelete.size,
        targetAccountsUsed: usedTargetAccounts.size
      };

    } catch (error) {
      console.error('❌ Error processing key queue:', error);
      return {
        totalKeys: keyQueue.length,
        transferred: 0,
        failed: keyQueue.length,
        error: error.message
      };
    }
  }

  // Transfer all keys from expiring account to new available accounts
  async transferAccountKeysToNewAccounts(expiredAccount, settings) {
    try {
      console.log(`🔄 Processing account: ${expiredAccount.username} (expires in ${expiredAccount.minutes_remaining} minutes)`);
      console.log(`📋 Account has ${expiredAccount.key_count} keys to transfer`);
      
      const keyIds = expiredAccount.key_ids ? expiredAccount.key_ids.split(',').map(id => parseInt(id.trim())) : [];
      const keyTypes = expiredAccount.key_types ? expiredAccount.key_types.split(',').map(type => type.trim()) : [];
      
      if (keyIds.length === 0) {
        console.log(`⚠️ No keys found for account ${expiredAccount.username}`);
        return;
      }

      // Group keys by type to optimize assignment
      const keysByType = {};
      for (let i = 0; i < keyIds.length; i++) {
        const keyId = keyIds[i];
        const keyType = keyTypes[i] || '2key'; // default to 2key if type missing
        
        if (!keysByType[keyType]) {
          keysByType[keyType] = [];
        }
        keysByType[keyType].push(keyId);
      }

      console.log('📋 Keys grouped by type:', keysByType);

      let totalKeysTransferred = 0;
      let keysNotTransferred = [];

      // Process each key type group
      for (const [keyType, keysOfType] of Object.entries(keysByType)) {
        console.log(`\n🔑 Processing ${keysOfType.length} keys of type: ${keyType}`);
        
        // Always process keys individually to ensure all keys get assigned
        // This prevents issues where multiple keys can't fit in a single target account
        console.log(`🔄 Processing ${keysOfType.length} ${keyType} keys individually to maximize assignment success...`);
        
        for (let i = 0; i < keysOfType.length; i++) {
          const keyId = keysOfType[i];
          console.log(`📋 Processing key ${i + 1}/${keysOfType.length}: ${keyId} (${keyType})`);
          
          const transferred = await this.transferSingleKey(keyId, keyType, expiredAccount);
          if (transferred) {
            totalKeysTransferred++;
            console.log(`✅ Successfully transferred key ${keyId} (${i + 1}/${keysOfType.length})`);
          } else {
            keysNotTransferred.push({ keyId, keyType });
            console.log(`❌ Failed to transfer key ${keyId} (${i + 1}/${keysOfType.length})`);
          }
          
          // Small delay between key transfers to avoid overwhelming database
          if (i < keysOfType.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }

      console.log(`\n✅ Transfer summary for account ${expiredAccount.username}:`);
      console.log(`   - Keys transferred: ${totalKeysTransferred}/${keyIds.length}`);
      if (keysNotTransferred.length > 0) {
        console.log(`   - Keys not transferred: ${keysNotTransferred.length}`);
        keysNotTransferred.forEach(key => {
          console.log(`     * Key ${key.keyId} (${key.keyType}) - no suitable target account`);
        });
      }

      // Xóa tài khoản cũ ngay sau khi chuyển key thành công (để tránh tràn bộ nhớ)
      if (totalKeysTransferred > 0 && settings.deleteExpiredAccounts) {
        console.log(`🗑️ Auto-deleting source account after successful key transfer...`);
        await this.deleteExpiredAccountImmediate(expiredAccount);
      } else if (totalKeysTransferred === 0) {
        console.log(`⚠️ No keys transferred from ${expiredAccount.username} - keeping account for retry`);
      } else if (!settings.deleteExpiredAccounts) {
        console.log(`ℹ️ Account deletion disabled - keeping ${expiredAccount.username}`);
      }

    } catch (error) {
      console.error(`❌ Failed to transfer keys from account ${expiredAccount.username}:`, error.message);
    }
  }

  // Transfer a single key to a suitable target account
  async transferSingleKey(keyId, keyType, expiredAccount, predefinedTarget = null) {
    try {
      console.log(`🔄 Transferring key ${keyId} (${keyType}) from ${expiredAccount.username}`);

      // Find suitable target account based on key type (or use predefined target)
      const targetAccount = predefinedTarget || await this.findSuitableTargetAccount(keyType);
      
      if (!targetAccount) {
        console.log(`❌ No suitable accounts available for ${keyType} key ${keyId}`);
        return false;
      }

      // IMPORTANT FIX: Don't assign keys to the same account they're coming from
      if (targetAccount.id === expiredAccount.account_id) {
        console.log(`❌ Target account ${targetAccount.username} is the same as source account - finding different target`);
        const alternativeTarget = await this.findSuitableTargetAccount(keyType, 1, expiredAccount.account_id);
        if (!alternativeTarget) {
          console.log(`❌ No alternative target account found for ${keyType} key ${keyId}`);
          return false;
        }
        // Use alternative target
        console.log(`🎯 Using alternative target: ${alternativeTarget.username} (ID: ${alternativeTarget.id})`);
        return await this.transferSingleKey(keyId, keyType, expiredAccount, alternativeTarget);
      }

      console.log(`🎯 Target account: ${targetAccount.username} (ID: ${targetAccount.id}, priority: ${targetAccount.priority || 'N/A'})`);

      try {
        // Step 1: Verify key exists and is available BEFORE doing anything
        const keyCheckQuery = `
          SELECT id, code, key_type, status
          FROM vpn_keys 
          WHERE id = ? AND status IN ('chờ', 'đang hoạt động')
        `;
        
        console.log(`🔄 Step 1: Verifying key ${keyId} exists and is available...`);
        const keyCheckResult = await executeQuery(keyCheckQuery, [keyId]);
        
        if (!keyCheckResult.success || keyCheckResult.data.length === 0) {
          throw new Error(`Key ${keyId} not found or not available`);
        }
        
        const keyInfo = keyCheckResult.data[0];
        console.log(`✅ Step 1 SUCCESS: Key ${keyId} verified - Code: ${keyInfo.code}, Type: ${keyInfo.key_type}, Status: ${keyInfo.status}`);

        // Step 2: Verify target account exists and is active BEFORE doing anything
        const accountCheckQuery = `
          SELECT id, username, expires_at 
          FROM vpn_accounts 
          WHERE id = ? AND is_active = 1 AND expires_at > NOW()
        `;
        
        console.log(`🔄 Step 2: Verifying target account ${targetAccount.id}...`);
        const accountCheckResult = await executeQuery(accountCheckQuery, [targetAccount.id]);
        
        if (!accountCheckResult.success || accountCheckResult.data.length === 0) {
          throw new Error(`Target account ${targetAccount.id} not found or not active`);
        }
        
        console.log(`✅ Step 2 SUCCESS: Target account ${targetAccount.username} verified`);

        // Step 3: COMPLETELY DELETE ALL assignments for this key (including inactive ones)
        // This fixes the issue where is_active=0 records cause "already assigned" errors
        const deleteAllQuery = `
          DELETE FROM account_keys 
          WHERE key_id = ?
        `;
        
        console.log(`🔄 Step 3: Completely deleting ALL assignments for key ${keyId}...`);
        const deleteResult = await executeQuery(deleteAllQuery, [keyId]);
        
        if (!deleteResult.success) {
          throw new Error(`Failed to delete all key assignments: ${deleteResult.error}`);
        }
        
        console.log(`✅ Step 3 SUCCESS: Deleted ${deleteResult.affectedRows || 0} assignments (active + inactive) for key ${keyId}`);

        // Step 4: Create new assignment for the target account
        const createAssignmentQuery = `
          INSERT INTO account_keys (account_id, key_id, assigned_at, is_active)
          VALUES (?, ?, NOW(), 1)
        `;

        console.log(`🔄 Step 4: Creating new assignment for key ${keyId} to account ${targetAccount.username} (ID: ${targetAccount.id})...`);
        const createResult = await executeQuery(createAssignmentQuery, [targetAccount.id, keyId]);

        if (!createResult.success) {
          throw new Error(`Failed to create new key assignment: ${createResult.error}`);
        }

        if (createResult.affectedRows === 0) {
          throw new Error(`No rows affected when creating assignment - possible constraint violation`);
        }

        console.log(`✅ Step 4 SUCCESS: Assignment created with ${createResult.affectedRows} row(s) affected`);

        // Step 5: Verify the assignment was created correctly
        const verifyAssignmentQuery = `
          SELECT ak.id, ak.account_id, ak.key_id, ak.is_active, va.username
          FROM account_keys ak
          INNER JOIN vpn_accounts va ON ak.account_id = va.id
          WHERE ak.key_id = ? AND ak.is_active = 1
        `;

        console.log(`🔄 Step 5: Verifying assignment was created correctly...`);
        const verifyResult = await executeQuery(verifyAssignmentQuery, [keyId]);

        if (!verifyResult.success || verifyResult.data.length === 0) {
          throw new Error(`Assignment verification failed - no active assignment found for key ${keyId}`);
        }

        const assignmentInfo = verifyResult.data[0];
        console.log(`✅ Step 5 SUCCESS: Assignment verified - Key ${keyId} → Account ${assignmentInfo.username} (ID: ${assignmentInfo.account_id})`);

        // Step 6: Log the transfer in key_usage_history
        const historyQuery = `
          INSERT INTO key_usage_history (key_id, account_id, action, notes, created_at) 
          VALUES (?, ?, 'activated', ?, NOW())
        `;

        const notes = `Auto transferred from ${expiredAccount.username} to ${targetAccount.username}`;
        console.log(`🔄 Step 6: Logging transfer in history...`);
        const historyResult = await executeQuery(historyQuery, [keyId, targetAccount.id, notes]);

        if (historyResult.success) {
          console.log(`✅ Step 6 SUCCESS: Transfer logged in history`);
        } else {
          console.log(`⚠️ Step 6 WARNING: Failed to log history (${historyResult.error}) - continuing`);
        }

        console.log(`✅ TRANSFER COMPLETED SUCCESSFULLY: Key ${keyId} transferred from ${expiredAccount.username} to ${targetAccount.username}`);
        return true;

      } catch (error) {
        console.log(`❌ ERROR in key transfer ${keyId}: ${error.message}`);
        throw error;
      }

    } catch (error) {
      console.error(`❌ FAILED to transfer key ${keyId}: ${error.message}`);
      return false;
    }
  }

  // Find ALL suitable target accounts for a specific key type (not just the first one)
  async findAllSuitableTargetAccounts(keyType, excludeAccountId = null) {
    try {
      console.log(`🔍 Finding ALL suitable target accounts for ${keyType} key${excludeAccountId ? ` excluding account ${excludeAccountId}` : ''}...`);
      
      // Sử dụng lại logic từ findSuitableTargetAccount nhưng không LIMIT 1
      let availableAccountsQuery = '';
      
      // Base WHERE clause with optional exclusion
      const baseWhereClause = `
        WHERE va.is_active = 1 
          AND va.expires_at > NOW()
          ${excludeAccountId ? `AND va.id != ${excludeAccountId}` : ''}
      `;

      if (keyType === '1key') {
        // 1key: Only assign to completely empty accounts (1key accounts should only contain 1key)
        availableAccountsQuery = `
          SELECT va.id, va.username, va.expires_at, va.created_at,
                 COUNT(ak.id) as assigned_keys,
                 GROUP_CONCAT(DISTINCT vk.key_type) as existing_key_types,
                 1 as priority
          FROM vpn_accounts va
          LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
          LEFT JOIN vpn_keys vk ON ak.key_id = vk.id
          ${baseWhereClause}
          GROUP BY va.id, va.username, va.expires_at, va.created_at
          HAVING assigned_keys = 0
          ORDER BY va.created_at DESC
        `;
      } else if (keyType === '2key') {
        // 2key: Tìm TẤT CẢ accounts phù hợp với FIXED PRIORITY
        availableAccountsQuery = `
          SELECT va.id, va.username, va.expires_at, va.created_at,
                 COUNT(ak.id) as assigned_keys,
                 GROUP_CONCAT(DISTINCT vk.key_type) as existing_key_types,
                 CASE 
                   WHEN COUNT(ak.id) = 1 AND GROUP_CONCAT(DISTINCT vk.key_type) = '2key' THEN 1
                   WHEN COUNT(ak.id) = 0 THEN 2
                   ELSE 99
                 END as priority,
                 (2 - COUNT(ak.id)) as available_slots
          FROM vpn_accounts va
          LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
          LEFT JOIN vpn_keys vk ON ak.key_id = vk.id
          ${baseWhereClause}
          GROUP BY va.id, va.username, va.expires_at, va.created_at
          HAVING (
            -- PRIORITY 1: Tài khoản có đúng 1 key 2key (còn 1 slot) - UU TIEN TRUOC
            (COUNT(ak.id) = 1 AND GROUP_CONCAT(DISTINCT vk.key_type) = '2key')
            OR 
            -- PRIORITY 2: Tài khoản hoàn toàn trống - SAU DO
            (COUNT(ak.id) = 0)
          )
          ORDER BY priority ASC, va.created_at DESC
        `;
      } else if (keyType === '3key') {
        // 3key: Tìm TẤT CẢ accounts phù hợp với FIXED PRIORITY
        availableAccountsQuery = `
          SELECT va.id, va.username, va.expires_at, va.created_at,
                 COUNT(ak.id) as assigned_keys,
                 GROUP_CONCAT(DISTINCT vk.key_type) as existing_key_types,
                 CASE 
                   WHEN COUNT(ak.id) BETWEEN 1 AND 2 AND GROUP_CONCAT(DISTINCT vk.key_type) = '3key' THEN 1
                   WHEN COUNT(ak.id) = 0 THEN 2
                   ELSE 99
                 END as priority,
                 (3 - COUNT(ak.id)) as available_slots
          FROM vpn_accounts va
          LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
          LEFT JOIN vpn_keys vk ON ak.key_id = vk.id
          ${baseWhereClause}
          GROUP BY va.id, va.username, va.expires_at, va.created_at
          HAVING (
            -- PRIORITY 1: Tài khoản có 1-2 keys 3key (còn slot) - UU TIEN TRUOC
            (COUNT(ak.id) BETWEEN 1 AND 2 AND GROUP_CONCAT(DISTINCT vk.key_type) = '3key')
            OR 
            -- PRIORITY 2: Tài khoản hoàn toàn trống - SAU DO
            (COUNT(ak.id) = 0)
          )
          ORDER BY priority ASC, va.created_at DESC
        `;
      }

      const accountResult = await executeQuery(availableAccountsQuery);
      
      if (accountResult.success && accountResult.data.length > 0) {
        console.log(`✅ Found ${accountResult.data.length} suitable target accounts for ${keyType}`);
        
        // Log summary of found accounts
        const priorityGroups = {};
        accountResult.data.forEach(acc => {
          const priority = acc.priority || 99;
          if (!priorityGroups[priority]) priorityGroups[priority] = [];
          priorityGroups[priority].push(acc);
        });
        
        console.log(`📊 Accounts by priority:`);
        Object.entries(priorityGroups).forEach(([priority, accounts]) => {
          const priorityText = priority === '1' ? 'Có cùng key type + còn slot' : 
                              priority === '2' ? 'Tài khoản trống' : 'Khác';
          console.log(`   Priority ${priority} (${priorityText}): ${accounts.length} accounts`);
          accounts.forEach(acc => {
            console.log(`     - ${acc.username} (ID: ${acc.id}) - ${acc.assigned_keys || 0} keys, ${acc.available_slots || 0} slots`);
          });
        });
        
        return accountResult.data;
      } else {
        console.log(`❌ No suitable target accounts found for ${keyType}`);
        return [];
      }
    } catch (error) {
      console.error(`❌ Error finding suitable target accounts for ${keyType}:`, error);
      return [];
    }
  }

  // Find suitable target account for a specific key type
  async findSuitableTargetAccount(keyType, spaceNeeded = 1, excludeAccountId = null) {
    let availableAccountsQuery = '';
    
    // Base WHERE clause with optional exclusion
    const baseWhereClause = `
      WHERE va.is_active = 1 
        AND va.expires_at > NOW()
        ${excludeAccountId ? `AND va.id != ${excludeAccountId}` : ''}
    `;

    if (keyType === '1key') {
      // 1key: Only assign to completely empty accounts (1key accounts should only contain 1key)
      availableAccountsQuery = `
        SELECT va.id, va.username, va.expires_at, va.created_at,
               COUNT(ak.id) as assigned_keys,
               GROUP_CONCAT(DISTINCT vk.key_type) as existing_key_types,
               1 as priority
        FROM vpn_accounts va
        LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
        LEFT JOIN vpn_keys vk ON ak.key_id = vk.id
        ${baseWhereClause}
        GROUP BY va.id, va.username, va.expires_at, va.created_at
        HAVING assigned_keys = 0
        ORDER BY va.created_at DESC
        LIMIT 10
      `;
    } else if (keyType === '2key') {
      // 2key: FIXED PRIORITY - Ưu tiên tài khoản có sẵn 2key và còn slot trước
      // Priority 1 - Tài khoản có đúng 1 key 2key (còn 1 slot trống) - UU TIEN TRUOC
      // Priority 2 - Tài khoản hoàn toàn trống (có thể chứa 2 keys 2key)
      availableAccountsQuery = `
        SELECT va.id, va.username, va.expires_at, va.created_at,
               COUNT(ak.id) as assigned_keys,
               GROUP_CONCAT(DISTINCT vk.key_type) as existing_key_types,
               CASE 
                 WHEN COUNT(ak.id) = 1 AND GROUP_CONCAT(DISTINCT vk.key_type) = '2key' THEN 1
                 WHEN COUNT(ak.id) = 0 THEN 2
                 ELSE 99
               END as priority,
               (2 - COUNT(ak.id)) as available_slots
        FROM vpn_accounts va
        LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
        LEFT JOIN vpn_keys vk ON ak.key_id = vk.id
        ${baseWhereClause}
        GROUP BY va.id, va.username, va.expires_at, va.created_at
        HAVING (
          -- PRIORITY 1: Tài khoản có đúng 1 key 2key (còn 1 slot) - UU TIEN TRUOC
          (COUNT(ak.id) = 1 AND GROUP_CONCAT(DISTINCT vk.key_type) = '2key')
          OR 
          -- PRIORITY 2: Tài khoản hoàn toàn trống - SAU DO
          (COUNT(ak.id) = 0)
        )
        ORDER BY priority ASC, va.created_at DESC
        LIMIT 1
      `;
    } else if (keyType === '3key') {
      // 3key: FIXED PRIORITY - Ưu tiên tài khoản có sẵn 3key và còn slot trước
      // Priority 1 - Tài khoản có 1-2 keys 3key (còn slot trống) - UU TIEN TRUOC
      // Priority 2 - Tài khoản hoàn toàn trống (có thể chứa 3 keys 3key)
      availableAccountsQuery = `
        SELECT va.id, va.username, va.expires_at, va.created_at,
               COUNT(ak.id) as assigned_keys,
               GROUP_CONCAT(DISTINCT vk.key_type) as existing_key_types,
               CASE 
                 WHEN COUNT(ak.id) BETWEEN 1 AND 2 AND GROUP_CONCAT(DISTINCT vk.key_type) = '3key' THEN 1
                 WHEN COUNT(ak.id) = 0 THEN 2
                 ELSE 99
               END as priority,
               (3 - COUNT(ak.id)) as available_slots
        FROM vpn_accounts va
        LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
        LEFT JOIN vpn_keys vk ON ak.key_id = vk.id
        ${baseWhereClause}
        GROUP BY va.id, va.username, va.expires_at, va.created_at
        HAVING (
          -- PRIORITY 1: Tài khoản có 1-2 keys 3key (còn slot) - UU TIEN TRUOC
          (COUNT(ak.id) BETWEEN 1 AND 2 AND GROUP_CONCAT(DISTINCT vk.key_type) = '3key')
          OR 
          -- PRIORITY 2: Tài khoản hoàn toàn trống - SAU DO
          (COUNT(ak.id) = 0)
        )
        ORDER BY priority ASC, va.created_at DESC
        LIMIT 1
      `;
    }

    console.log(`🔍 Looking for suitable target account for ${keyType} key (space needed: ${spaceNeeded})${excludeAccountId ? ` excluding account ${excludeAccountId}` : ''}...`);
    
    if (keyType === '2key') {
      console.log('🎯 FIXED Priority for 2key: 1) Tài khoản có 1 key 2key (còn slot) → 2) Tài khoản trống');
    } else if (keyType === '3key') {
      console.log('🎯 FIXED Priority for 3key: 1) Tài khoản có 1-2 keys 3key (còn slot) → 2) Tài khoản trống');
    } else if (keyType === '1key') {
      console.log('🎯 Priority for 1key: Chỉ tài khoản hoàn toàn trống (1key/account)');
    }
    
    console.log('🔍 Executing target account query...');
    const accountResult = await executeQuery(availableAccountsQuery);
    
    console.log(`📊 Target account query result for ${keyType}:`, {
      success: accountResult.success,
      dataLength: accountResult.data?.length || 0,
      error: accountResult.error
    });

    if (accountResult.success && accountResult.data.length > 0) {
      // Chọn account đầu tiên có priority cao nhất
      const targetAccount = accountResult.data[0];
      const priorityText = targetAccount.priority === 1 ? 'Tài khoản có cùng loại key + còn slot' : 
                          targetAccount.priority === 2 ? 'Tài khoản hoàn toàn trống' : 'Khác';
      
      console.log(`🎯 Found target account:`, {
        id: targetAccount.id,
        username: targetAccount.username,
        assigned_keys: targetAccount.assigned_keys || 0,
        available_slots: targetAccount.available_slots || 0,
        existing_types: targetAccount.existing_key_types || 'none',
        priority: `${targetAccount.priority || 'N/A'} (${priorityText})`,
        expires_at: targetAccount.expires_at
      });

      // Log all available accounts for debugging
      if (accountResult.data.length > 1) {
        console.log(`📋 All ${accountResult.data.length} available accounts for ${keyType}:`);
        accountResult.data.forEach((acc, index) => {
          const prioText = acc.priority === 1 ? 'Có cùng key type + còn slot' : 
                          acc.priority === 2 ? 'Tài khoản trống' : 'Khác';
          console.log(`  ${index + 1}. ${acc.username} (ID: ${acc.id}) - ${acc.assigned_keys || 0}/${keyType === '1key' ? 1 : keyType === '2key' ? 2 : 3} keys, slots: ${acc.available_slots || 0}, priority: ${acc.priority} (${prioText})`);
        });
      }

      return targetAccount;
    } else {
      // Enhanced debugging when no accounts found
      console.log(`❌ No suitable accounts found for ${keyType}. Running detailed debug...`);
      
      // Debug query to see what accounts are available
      const debugQuery = `
        SELECT va.id, va.username, va.is_active, va.expires_at, 
               COUNT(ak.id) as assigned_keys,
               GROUP_CONCAT(DISTINCT vk.key_type) as existing_key_types,
               TIMESTAMPDIFF(MINUTE, NOW(), va.expires_at) as minutes_remaining
        FROM vpn_accounts va
        LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
        LEFT JOIN vpn_keys vk ON ak.key_id = vk.id
        WHERE va.is_active = 1 ${excludeAccountId ? `AND va.id != ${excludeAccountId}` : ''}
        GROUP BY va.id, va.username, va.is_active, va.expires_at
        ORDER BY assigned_keys ASC, va.expires_at DESC
        LIMIT 10
      `;
      
      const debugResult = await executeQuery(debugQuery);
      
      if (debugResult.success && debugResult.data.length > 0) {
        console.log(`📊 Available accounts debug (first 10):`, debugResult.data.map(acc => ({
          id: acc.id,
          username: acc.username,
          is_active: acc.is_active,
          assigned_keys: acc.assigned_keys || 0,
          existing_types: acc.existing_key_types || 'none',
          minutes_remaining: acc.minutes_remaining,
          expires_valid: acc.minutes_remaining > 0 ? 'YES' : 'NO'
        })));
        
        // Check if there are accounts but they don't match criteria
        const totalActiveAccounts = debugResult.data.filter(acc => acc.minutes_remaining > 0).length;
        console.log(`📈 Summary: ${totalActiveAccounts} active accounts found, but none match ${keyType} assignment criteria`);
      } else {
        console.log(`⚠️ No active accounts found at all!`);
      }
    }

    console.log(`❌ No suitable accounts available for ${keyType} key (space needed: ${spaceNeeded})`);
    return null;
  }

  // Delete expired account immediately after key transfer (prevents memory bloat)
  async deleteExpiredAccountImmediate(expiredAccount) {
    try {
      console.log(`🗑️ Immediately deleting account ${expiredAccount.username} after key transfer...`);

      // Start transaction for safe deletion
      await executeQuery('START TRANSACTION');

      try {
        // First, COMPLETELY DELETE any remaining account_keys records for this account to prevent orphaned data
        const deleteKeysQuery = `
          DELETE FROM account_keys 
          WHERE account_id = ?
        `;
        
        const deleteKeysResult = await executeQuery(deleteKeysQuery, [expiredAccount.account_id]);
        console.log(`�️ Deleted ${deleteKeysResult.affectedRows || 0} account_keys records for account ${expiredAccount.username}`);

        // Check if account has history records that prevent deletion
        const historyCheckQuery = `
          SELECT COUNT(*) as history_count 
          FROM key_usage_history 
          WHERE account_id = ?
        `;
        
        const historyResult = await executeQuery(historyCheckQuery, [expiredAccount.account_id]);
        
        if (historyResult.success && historyResult.data[0].history_count > 0) {
          console.log(`📚 Account ${expiredAccount.username} has ${historyResult.data[0].history_count} history records - setting inactive instead of deleting`);
          
          // Set account as inactive to preserve foreign key relationships
          const inactivateQuery = `
            UPDATE vpn_accounts 
            SET is_active = 0, updated_at = NOW()
            WHERE id = ?
          `;
          
          const inactivateResult = await executeQuery(inactivateQuery, [expiredAccount.account_id]);
          
          if (inactivateResult.success && inactivateResult.affectedRows > 0) {
            console.log(`✅ Successfully set account ${expiredAccount.username} as inactive (preserving history)`);
          } else {
            throw new Error(`Failed to inactivate account: ${inactivateResult.error}`);
          }
        } else {
          // Safe to delete completely if no history records
          console.log(`🗑️ Account ${expiredAccount.username} has no history records - safe to delete completely`);
          
          const deleteAccountQuery = `
            DELETE FROM vpn_accounts 
            WHERE id = ?
          `;

          const deleteResult = await executeQuery(deleteAccountQuery, [expiredAccount.account_id]);

          if (deleteResult.success && deleteResult.affectedRows > 0) {
            console.log(`🗑️ ✅ Successfully deleted account ${expiredAccount.username} completely (memory freed)`);
          } else {
            throw new Error(`Failed to delete account: ${deleteResult.error}`);
          }
        }

        // Commit transaction
        await executeQuery('COMMIT');
        
        return {
          success: true,
          action: historyResult.data[0].history_count > 0 ? 'inactivated' : 'deleted',
          message: `Account ${expiredAccount.username} processed successfully`
        };

      } catch (error) {
        // Rollback on error
        await executeQuery('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error(`❌ Failed to immediately delete account ${expiredAccount.username}: ${error.message}`);
      
      // Fallback: at least try to set as inactive
      try {
        const fallbackQuery = `UPDATE vpn_accounts SET is_active = 0 WHERE id = ?`;
        const fallbackResult = await executeQuery(fallbackQuery, [expiredAccount.account_id]);
        if (fallbackResult.success) {
          console.log(`⚠️ Fallback: Set ${expiredAccount.username} as inactive`);
        }
      } catch (fallbackError) {
        console.error(`❌ Fallback failed too: ${fallbackError.message}`);
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete expired account helper method
  async deleteExpiredAccount(expiredAccount) {
    try {
      // Check if account has any history records
      const historyCheckQuery = `
        SELECT COUNT(*) as history_count 
        FROM key_usage_history 
        WHERE account_id = ?
      `;
      
      const historyResult = await executeQuery(historyCheckQuery, [expiredAccount.account_id]);
      
      if (historyResult.success && historyResult.data[0].history_count > 0) {
        console.log(`🗑️ Account ${expiredAccount.username} has history records, setting as inactive instead of deleting...`);
        
        // Set account as inactive instead of deleting to preserve foreign key relationships
        const inactivateQuery = `
          UPDATE vpn_accounts 
          SET is_active = 0 
          WHERE id = ? AND expires_at <= NOW()
        `;
        
        const inactivateResult = await executeQuery(inactivateQuery, [expiredAccount.account_id]);
        
        if (inactivateResult.success && inactivateResult.affectedRows > 0) {
          console.log(`✅ Successfully set account ${expiredAccount.username} as inactive`);
        } else {
          console.log(`⚠️ Could not inactivate account ${expiredAccount.username}`);
        }
      } else {
        // Safe to delete if no history records
        const deleteExpiredAccountQuery = `
          DELETE FROM vpn_accounts 
          WHERE id = ? AND is_active = 1 AND expires_at <= NOW()
        `;

        console.log(`🗑️ Deleting expired account ${expiredAccount.username} (no history records)...`);
        const deleteResult = await executeQuery(deleteExpiredAccountQuery, [expiredAccount.account_id]);

        if (deleteResult.success && deleteResult.affectedRows > 0) {
          console.log(`🗑️ Successfully deleted expired account ${expiredAccount.username}`);
        } else {
          console.log(`ℹ️ Account ${expiredAccount.username} was not deleted (may not be fully expired yet)`);
        }
      }
    } catch (error) {
      console.error(`⚠️ Warning: Failed to handle expired account ${expiredAccount.username}: ${error.message}`);
    }
  }

  // Clean up expired accounts that don't have keys (to save database space and prevent memory bloat)
  async cleanupExpiredAccounts(settings) {
    try {
      // Only cleanup if deletion is enabled
      if (!settings.deleteExpiredAccounts) {
        console.log('⚠️ Account deletion is disabled in settings - skipping cleanup');
        return;
      }

      console.log('🧹 Starting cleanup of expired accounts without keys...');

      // FIRST: Clean up orphaned account_keys records (is_active = 0)
      console.log('🧽 Cleaning up orphaned account_keys records...');
      const cleanupOrphanedQuery = `
        DELETE FROM account_keys 
        WHERE is_active = 0
      `;
      
      const cleanupResult = await executeQuery(cleanupOrphanedQuery);
      if (cleanupResult.success) {
        console.log(`✅ Cleaned up ${cleanupResult.affectedRows || 0} orphaned account_keys records`);
      } else {
        console.error('❌ Failed to cleanup orphaned records:', cleanupResult.error);
      }

      // Find expired accounts that don't have any active keys (prioritize older expired accounts)
      const expiredAccountsQuery = `
        SELECT va.id, va.username, va.expires_at, 
               TIMESTAMPDIFF(MINUTE, va.expires_at, NOW()) as minutes_expired,
               COALESCE(ak_count.key_count, 0) as active_keys
        FROM vpn_accounts va
        LEFT JOIN (
          SELECT account_id, COUNT(*) as key_count
          FROM account_keys
          WHERE is_active = 1
          GROUP BY account_id
        ) ak_count ON va.id = ak_count.account_id
        WHERE va.expires_at <= NOW()
        AND (ak_count.key_count IS NULL OR ak_count.key_count = 0)
        ORDER BY va.expires_at ASC
        LIMIT 50
      `;

      console.log('🔍 Executing cleanup query for expired accounts without keys...');
      const expiredResult = await executeQuery(expiredAccountsQuery);

      console.log(`📊 Cleanup query result:`, {
        success: expiredResult.success,
        dataLength: expiredResult.data?.length || 0,
        error: expiredResult.error
      });

      if (!expiredResult.success) {
        console.error('❌ Failed to fetch expired accounts for cleanup:', expiredResult.error);
        return;
      }

      if (expiredResult.data.length === 0) {
        console.log('✅ No expired accounts without keys found to cleanup');
        return;
      }

      console.log(`🗑️ Found ${expiredResult.data.length} expired accounts without keys:`);
      expiredResult.data.forEach(acc => {
        console.log(`  - Account: ${acc.username}, expired: ${acc.expires_at} (${acc.minutes_expired} minutes ago)`);
      });

      let deletedCount = 0;
      let inactivatedCount = 0;
      let errorCount = 0;

      // Process accounts in batches to avoid overwhelming the database
      const batchSize = 10;
      for (let i = 0; i < expiredResult.data.length; i += batchSize) {
        const batch = expiredResult.data.slice(i, i + batchSize);
        console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(expiredResult.data.length/batchSize)} (${batch.length} accounts)...`);
        
        for (const account of batch) {
          try {
            console.log(`🗑️ Processing expired account: ${account.username}...`);
            
            // Use immediate deletion method
            const result = await this.deleteExpiredAccountImmediate({
              account_id: account.id,
              username: account.username
            });
            
            if (result.success) {
              if (result.action === 'deleted') {
                deletedCount++;
                console.log(`✅ Deleted: ${account.username}`);
              } else {
                inactivatedCount++;
                console.log(`✅ Inactivated: ${account.username}`);
              }
            } else {
              errorCount++;
              console.log(`❌ Error processing: ${account.username} - ${result.error}`);
            }
            
            // Small delay between accounts to avoid overwhelming database
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } catch (error) {
            errorCount++;
            console.error(`❌ Error processing account ${account.username}:`, error.message);
          }
        }
        
        // Longer delay between batches
        if (i + batchSize < expiredResult.data.length) {
          console.log('⏳ Waiting before next batch...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`✅ Cleanup completed:`);
      console.log(`   - Deleted: ${deletedCount} accounts`);
      console.log(`   - Inactivated: ${inactivatedCount} accounts`);
      console.log(`   - Errors: ${errorCount} accounts`);
      console.log(`   - Total processed: ${deletedCount + inactivatedCount + errorCount}/${expiredResult.data.length}`);

    } catch (error) {
      console.error('❌ Error during expired accounts cleanup:', error);
    }
  }

  // Get service status
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalId: this.intervalId
    };
  }

  // Force cleanup expired accounts immediately (for manual testing)
  async forceCleanupNow() {
    try {
      console.log('🧽 Force cleanup requested...');
      
      // First cleanup orphaned records
      console.log('🧽 Cleaning up orphaned account_keys records...');
      const cleanupOrphanedQuery = `
        DELETE FROM account_keys 
        WHERE is_active = 0
      `;
      
      const cleanupResult = await executeQuery(cleanupOrphanedQuery);
      if (cleanupResult.success) {
        console.log(`✅ Cleaned up ${cleanupResult.affectedRows || 0} orphaned account_keys records`);
      } else {
        console.error('❌ Failed to cleanup orphaned records:', cleanupResult.error);
      }
      
      const settings = await this.getSettings();
      console.log('Current settings:', settings);
      
      await this.cleanupExpiredAccounts(settings);
      console.log('✅ Force cleanup completed');
      
      return {
        success: true,
        message: 'Force cleanup completed'
      };
    } catch (error) {
      console.error('❌ Force cleanup failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

const serviceInstance = new AutoAssignmentService();

console.log('Created AutoAssignmentService singleton instance');
console.log('Service methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(serviceInstance)));
console.log('Service has start method:', typeof serviceInstance.start);
console.log('Service has getStatus method:', typeof serviceInstance.getStatus);
console.log('Service has forceCleanupNow method:', typeof serviceInstance.forceCleanupNow);
console.log('Service has findAllSuitableTargetAccounts method:', typeof serviceInstance.findAllSuitableTargetAccounts);
console.log('Service has processKeyQueue method:', typeof serviceInstance.processKeyQueue);

module.exports = serviceInstance;
