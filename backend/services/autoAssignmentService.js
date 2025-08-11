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
      beforeExpiry: 300, // minutes (5 hours)
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

      // Find accounts that will expire within the specified time (in minutes) and group all keys by account
      const expiringAccountsQuery = `
        SELECT 
          va.id as account_id, 
          va.username, 
          va.expires_at,
          GROUP_CONCAT(ak.key_id) as key_ids,
          GROUP_CONCAT(vk.key_type) as key_types,
          COUNT(ak.key_id) as key_count,
          TIMESTAMPDIFF(MINUTE, NOW(), va.expires_at) as minutes_remaining
        FROM vpn_accounts va
        INNER JOIN account_keys ak ON va.id = ak.account_id
        INNER JOIN vpn_keys vk ON ak.key_id = vk.id
        WHERE va.is_active = 1 
        AND va.expires_at IS NOT NULL
        AND ak.is_active = 1
        AND TIMESTAMPDIFF(MINUTE, NOW(), va.expires_at) <= ?
        AND TIMESTAMPDIFF(MINUTE, NOW(), va.expires_at) > 0
        GROUP BY va.id, va.username, va.expires_at
        ORDER BY va.expires_at ASC
      `;

      console.log(`🔍 Executing query with beforeExpiry: ${settings.beforeExpiry}`);
      const expiringResult = await executeQuery(expiringAccountsQuery, [settings.beforeExpiry]);

      console.log(`📊 Query result:`, {
        success: expiringResult.success,
        dataLength: expiringResult.data?.length || 0,
        error: expiringResult.error
      });

      if (expiringResult.success && expiringResult.data.length > 0) {
        console.log('📋 Expiring accounts found:');
        expiringResult.data.forEach(acc => {
          const keyIds = acc.key_ids ? acc.key_ids.split(',') : [];
          const keyTypes = acc.key_types ? acc.key_types.split(',') : [];
          console.log(`  - Account: ${acc.username}, expires: ${acc.expires_at}, minutes remaining: ${acc.minutes_remaining}`);
          console.log(`    Keys: ${acc.key_count} keys - IDs: [${keyIds.join(', ')}], Types: [${keyTypes.join(', ')}]`);
        });
      }

      if (!expiringResult.success || expiringResult.data.length === 0) {
        console.log('✅ No accounts expiring soon');
        return;
      }

      console.log(`⚠️ Found ${expiringResult.data.length} accounts expiring soon`);

      // Process each expiring account (with all its keys)
      for (const expiredAccount of expiringResult.data) {
        await this.transferAccountKeysToNewAccounts(expiredAccount, settings);
      }

    } catch (error) {
      console.error('Error processing expired accounts:', error);
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
        
        // For same type keys, try to place them together when beneficial
        if (keysOfType.length === 2) {
          console.log(`🔍 Attempting to place ${keysOfType.length} ${keyType} keys together...`);
          
          // Try to find an account that can fit both keys of the same type
          const targetAccount = await this.findSuitableTargetAccount(keyType, keysOfType.length);
          
          if (targetAccount) {
            console.log(`🎯 Found suitable account for both ${keyType} keys: ${targetAccount.username}`);
            
            // Check if this account already has the same key type (priority 1) or is empty (priority 2)
            const hasExistingKeys = (targetAccount.assigned_keys || 0) > 0;
            const strategy = hasExistingKeys ? 'Thêm vào tài khoản có cùng loại key' : 'Thêm vào tài khoản trống';
            console.log(`📋 Strategy: ${strategy}`);
            
            // Transfer both keys to the same account
            let bothTransferred = true;
            for (const keyId of keysOfType) {
              const transferred = await this.transferSingleKey(keyId, keyType, expiredAccount, targetAccount);
              if (transferred) {
                totalKeysTransferred++;
              } else {
                bothTransferred = false;
                keysNotTransferred.push({ keyId, keyType });
              }
            }
            
            if (bothTransferred) {
              console.log(`✅ Successfully transferred both ${keyType} keys to ${targetAccount.username} using ${strategy}`);
              continue; // Skip individual processing
            } else {
              console.log(`⚠️ Failed to transfer both keys together, will try individually`);
            }
          } else {
            console.log(`❌ No suitable account found for both ${keyType} keys, will try individually`);
          }
        }
        
        // Process keys individually (either because batch failed or single key)
        console.log(`🔄 Processing ${keysOfType.length} ${keyType} keys individually...`);
        for (const keyId of keysOfType) {
          const transferred = await this.transferSingleKey(keyId, keyType, expiredAccount);
          if (transferred) {
            totalKeysTransferred++;
          } else {
            keysNotTransferred.push({ keyId, keyType });
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

      // Delete the expired account to save memory (after successful key transfer)
      if (totalKeysTransferred > 0 && settings.deleteExpiredAccounts) {
        await this.deleteExpiredAccount(expiredAccount);
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

      console.log(`🎯 Target account: ${targetAccount.username} (priority: ${targetAccount.priority || 'N/A'})`);

      // Start transaction for this key transfer
      await executeQuery('START TRANSACTION');

      try {
        // First, deactivate any existing assignments for this key to prevent conflicts
        const deactivateOldQuery = `
          UPDATE account_keys 
          SET is_active = 0
          WHERE key_id = ? AND is_active = 1
        `;
        
        console.log(`🔄 Deactivating old assignments for key ${keyId}...`);
        const deactivateResult = await executeQuery(deactivateOldQuery, [keyId]);
        
        if (!deactivateResult.success) {
          throw new Error(`Failed to deactivate old key assignments: ${deactivateResult.error}`);
        }

        // Create new assignment for the target account
        const createAssignmentQuery = `
          INSERT INTO account_keys (account_id, key_id, assigned_at, is_active)
          VALUES (?, ?, NOW(), 1)
        `;

        console.log(`🔄 Creating new assignment for key ${keyId} to account ${targetAccount.username}...`);
        const createResult = await executeQuery(createAssignmentQuery, [targetAccount.id, keyId]);

        if (!createResult.success || createResult.affectedRows === 0) {
          throw new Error(`Failed to create new key assignment: ${createResult.error}`);
        }

        // Log the transfer in key_usage_history
        const historyQuery = `
          INSERT INTO key_usage_history (key_id, account_id, action, notes, created_at) 
          VALUES (?, ?, 'auto_transfer', ?, NOW())
        `;

        const notes = `Auto transferred from ${expiredAccount.username} to ${targetAccount.username}`;
        await executeQuery(historyQuery, [keyId, targetAccount.id, notes]);

        // Commit transaction
        await executeQuery('COMMIT');

        console.log(`✅ Successfully transferred key ${keyId} from ${expiredAccount.username} to ${targetAccount.username}`);
        return true;

      } catch (error) {
        // Rollback on error
        await executeQuery('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error(`❌ Failed to transfer key ${keyId}:`, error.message);
      return false;
    }
  }

  // Find suitable target account for a specific key type
  async findSuitableTargetAccount(keyType, spaceNeeded = 1) {
    let availableAccountsQuery = '';

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
        WHERE va.is_active = 1 
          AND va.expires_at > NOW()
        GROUP BY va.id, va.username, va.expires_at, va.created_at
        HAVING assigned_keys = 0
        ORDER BY va.created_at DESC
        LIMIT 1
      `;
    } else if (keyType === '2key') {
      // 2key: Độ ưu tiên:
      // Priority 1 - Tài khoản đã có 2key và còn slot trống (tối đa 2 keys)
      // Priority 2 - Tài khoản hoàn toàn trống
      availableAccountsQuery = `
        SELECT va.id, va.username, va.expires_at, va.created_at,
               COUNT(ak.id) as assigned_keys,
               GROUP_CONCAT(DISTINCT vk.key_type) as existing_key_types,
               CASE 
                 WHEN COUNT(ak.id) > 0 AND GROUP_CONCAT(DISTINCT vk.key_type) = '2key' AND COUNT(ak.id) + ${spaceNeeded} <= 2 THEN 1
                 WHEN COUNT(ak.id) = 0 THEN 2
                 ELSE 99
               END as priority
        FROM vpn_accounts va
        LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
        LEFT JOIN vpn_keys vk ON ak.key_id = vk.id
        WHERE va.is_active = 1 AND va.expires_at > NOW()
        GROUP BY va.id, va.username, va.expires_at, va.created_at
        HAVING (
          -- Tài khoản đã có 2key và còn slot
          (COUNT(ak.id) > 0 AND GROUP_CONCAT(DISTINCT vk.key_type) = '2key' AND COUNT(ak.id) + ${spaceNeeded} <= 2)
          OR 
          -- Tài khoản hoàn toàn trống
          (COUNT(ak.id) = 0)
        )
        ORDER BY priority ASC, va.created_at DESC
        LIMIT 1
      `;
    } else if (keyType === '3key') {
      // 3key: Độ ưu tiên:
      // Priority 1 - Tài khoản đã có 3key và còn slot trống (tối đa 3 keys)
      // Priority 2 - Tài khoản hoàn toàn trống
      availableAccountsQuery = `
        SELECT va.id, va.username, va.expires_at, va.created_at,
               COUNT(ak.id) as assigned_keys,
               GROUP_CONCAT(DISTINCT vk.key_type) as existing_key_types,
               CASE 
                 WHEN COUNT(ak.id) > 0 AND GROUP_CONCAT(DISTINCT vk.key_type) = '3key' AND COUNT(ak.id) + ${spaceNeeded} <= 3 THEN 1
                 WHEN COUNT(ak.id) = 0 THEN 2
                 ELSE 99
               END as priority
        FROM vpn_accounts va
        LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
        LEFT JOIN vpn_keys vk ON ak.key_id = vk.id
        WHERE va.is_active = 1 AND va.expires_at > NOW()
        GROUP BY va.id, va.username, va.expires_at, va.created_at
        HAVING (
          -- Tài khoản đã có 3key và còn slot
          (COUNT(ak.id) > 0 AND GROUP_CONCAT(DISTINCT vk.key_type) = '3key' AND COUNT(ak.id) + ${spaceNeeded} <= 3)
          OR 
          -- Tài khoản hoàn toàn trống
          (COUNT(ak.id) = 0)
        )
        ORDER BY priority ASC, va.created_at DESC
        LIMIT 1
      `;
    }

    console.log(`🔍 Looking for suitable target account for ${keyType} key (space needed: ${spaceNeeded})...`);
    
    if (keyType === '2key') {
      console.log('🎯 Priority for 2key: 1) Tài khoản đã có 2key + còn slot → 2) Tài khoản trống');
    } else if (keyType === '3key') {
      console.log('🎯 Priority for 3key: 1) Tài khoản đã có 3key + còn slot → 2) Tài khoản trống');
    } else if (keyType === '1key') {
      console.log('🎯 Priority for 1key: Chỉ tài khoản hoàn toàn trống (1key/account)');
    }
    
    const accountResult = await executeQuery(availableAccountsQuery);

    if (accountResult.success && accountResult.data.length > 0) {
      const targetAccount = accountResult.data[0];
      const priorityText = targetAccount.priority === 1 ? 'Tài khoản có cùng loại key + còn slot' : 
                          targetAccount.priority === 2 ? 'Tài khoản hoàn toàn trống' : 'Khác';
      
      console.log(`🎯 Found target account:`, {
        username: targetAccount.username,
        assigned_keys: targetAccount.assigned_keys || 0,
        existing_types: targetAccount.existing_key_types || 'none',
        priority: `${targetAccount.priority || 'N/A'} (${priorityText})`
      });
      return targetAccount;
    }

    console.log(`❌ No suitable accounts available for ${keyType} key (space needed: ${spaceNeeded})`);
    return null;
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

  // Clean up expired accounts that don't have keys (to save database space)
  async cleanupExpiredAccounts(settings) {
    try {
      // Only cleanup if deletion is enabled
      if (!settings.deleteExpiredAccounts) {
        console.log('⚠️ Account deletion is disabled in settings - skipping cleanup');
        return;
      }

      console.log('🧹 Starting cleanup of expired accounts without keys...');

      // Find expired accounts that don't have any keys
      const expiredAccountsQuery = `
        SELECT va.id, va.username, va.expires_at, 
               TIMESTAMPDIFF(MINUTE, va.expires_at, NOW()) as minutes_expired
        FROM vpn_accounts va
        LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
        WHERE va.is_active = 1 
        AND va.expires_at <= NOW()
        AND ak.account_id IS NULL
        ORDER BY va.expires_at ASC
      `;

      console.log('🔍 Executing cleanup query...');
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

      let processedCount = 0;
      for (const account of expiredResult.data) {
        try {
          console.log(`🗑️ Attempting to clean up account: ${account.username}...`);
          
          // Check if account has any history records first
          const historyCheckQuery = `
            SELECT COUNT(*) as history_count 
            FROM key_usage_history 
            WHERE account_id = ?
          `;
          
          const historyResult = await executeQuery(historyCheckQuery, [account.id]);
          
          if (historyResult.success && historyResult.data[0].history_count > 0) {
            console.log(`🔄 Account ${account.username} has history records, setting as inactive...`);
            
            const inactivateQuery = `
              UPDATE vpn_accounts 
              SET is_active = 0 
              WHERE id = ? AND is_active = 1 AND expires_at <= NOW()
            `;
            
            const inactivateResult = await executeQuery(inactivateQuery, [account.id]);
            
            if (inactivateResult.success && inactivateResult.affectedRows > 0) {
              console.log(`✅ Successfully set account ${account.username} as inactive`);
              processedCount++;
            } else {
              console.log(`⚠️ Could not inactivate account: ${account.username}`);
            }
          } else {
            // Safe to delete if no history records
            console.log(`🗑️ Account ${account.username} has no history records, deleting...`);
            const deleteQuery = `DELETE FROM vpn_accounts WHERE id = ? AND is_active = 1 AND expires_at <= NOW()`;
            const deleteResult = await executeQuery(deleteQuery, [account.id]);

            if (deleteResult.success && deleteResult.affectedRows > 0) {
              console.log(`✅ Successfully deleted expired account: ${account.username}`);
              processedCount++;
            } else {
              console.log(`⚠️ Could not delete account: ${account.username} - ${deleteResult.error || 'No rows affected'}`);
            }
          }
        } catch (error) {
          console.error(`❌ Error processing account ${account.username}:`, error.message);
        }
      }

      console.log(`✅ Cleanup completed - processed ${processedCount}/${expiredResult.data.length} expired accounts`);

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

module.exports = serviceInstance;
