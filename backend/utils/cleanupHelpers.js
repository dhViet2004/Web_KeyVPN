const { executeQuery } = require('../config/database');

/**
 * Clean up orphaned or inconsistent records in account_keys table
 * This helps prevent constraint violations and data inconsistency
 */
async function cleanupAccountKeys() {
  console.log('🧹 Starting account_keys cleanup...');
  
  try {
    // Step 1: Remove account_keys records where the referenced key no longer exists
    const orphanedKeysResult = await executeQuery(`
      DELETE ak FROM account_keys ak
      LEFT JOIN vpn_keys vk ON ak.key_id = vk.id
      WHERE vk.id IS NULL
    `);
    
    if (orphanedKeysResult.success) {
      console.log(`✅ Removed ${orphanedKeysResult.data.affectedRows || 0} orphaned key references`);
    }
    
    // Step 2: Remove account_keys records where the referenced account no longer exists
    const orphanedAccountsResult = await executeQuery(`
      DELETE ak FROM account_keys ak
      LEFT JOIN vpn_accounts va ON ak.account_id = va.id
      WHERE va.id IS NULL
    `);
    
    if (orphanedAccountsResult.success) {
      console.log(`✅ Removed ${orphanedAccountsResult.data.affectedRows || 0} orphaned account references`);
    }
    
    // Step 2a: Clean up orphaned key_usage_history records
    const orphanedHistoryResult = await executeQuery(`
      DELETE kuh FROM key_usage_history kuh
      LEFT JOIN vpn_keys vk ON kuh.key_id = vk.id
      WHERE vk.id IS NULL
    `);
    
    if (orphanedHistoryResult.success) {
      console.log(`✅ Removed ${orphanedHistoryResult.data.affectedRows || 0} orphaned history records`);
    }
    
    // Step 3: Fix duplicate active assignments (keep only the most recent one)
    const duplicatesResult = await executeQuery(`
      UPDATE account_keys ak1
      INNER JOIN (
        SELECT account_id, key_id, MAX(assigned_at) as max_assigned_at
        FROM account_keys
        WHERE is_active = 1
        GROUP BY account_id, key_id
        HAVING COUNT(*) > 1
      ) duplicates ON ak1.account_id = duplicates.account_id AND ak1.key_id = duplicates.key_id
      SET ak1.is_active = 0
      WHERE ak1.is_active = 1 AND ak1.assigned_at < duplicates.max_assigned_at
    `);
    
    if (duplicatesResult.success) {
      console.log(`✅ Fixed ${duplicatesResult.data.affectedRows || 0} duplicate active assignments`);
    }
    
    // Step 4: Update key statuses based on actual assignments
    const statusUpdateResult = await executeQuery(`
      UPDATE vpn_keys vk
      LEFT JOIN (
        SELECT key_id, COUNT(*) as active_assignments
        FROM account_keys
        WHERE is_active = 1
        GROUP BY key_id
      ) ak_count ON vk.id = ak_count.key_id
      SET vk.status = CASE
        WHEN COALESCE(ak_count.active_assignments, 0) > 0 THEN 'đang hoạt động'
        ELSE 'chờ'
      END
      WHERE vk.status IN ('chờ', 'đang hoạt động')
    `);
    
    if (statusUpdateResult.success) {
      console.log(`✅ Updated ${statusUpdateResult.data.affectedRows || 0} key statuses`);
    }
    
    console.log('🎉 Account_keys cleanup completed successfully');
    return {
      success: true,
      message: 'Cleanup completed',
      details: {
        orphanedKeys: orphanedKeysResult.data?.affectedRows || 0,
        orphanedAccounts: orphanedAccountsResult.data?.affectedRows || 0,
        orphanedHistory: orphanedHistoryResult.data?.affectedRows || 0,
        duplicatesFixed: duplicatesResult.data?.affectedRows || 0,
        statusesUpdated: statusUpdateResult.data?.affectedRows || 0
      }
    };
    
  } catch (error) {
    console.error('❌ Account_keys cleanup failed:', error);
    return {
      success: false,
      message: 'Cleanup failed',
      error: error.message
    };
  }
}

/**
 * Clean up account_keys for a specific key
 */
async function cleanupKeyAssignments(keyId) {
  console.log(`🧹 Cleaning up assignments for key ${keyId}...`);
  
  try {
    // First, set all assignments for this key to inactive to avoid foreign key issues
    const inactiveResult = await executeQuery(
      'UPDATE account_keys SET is_active = 0 WHERE key_id = ? AND is_active = 1',
      [keyId]
    );
    
    if (inactiveResult.success && inactiveResult.data.affectedRows > 0) {
      console.log(`✅ Set ${inactiveResult.data.affectedRows} assignments to inactive for key ${keyId}`);
    }
    
    // Clean up key_usage_history records that might prevent deletion
    const historyResult = await executeQuery(
      'DELETE FROM key_usage_history WHERE key_id = ?',
      [keyId]
    );
    
    if (historyResult.success) {
      console.log(`✅ Removed ${historyResult.data.affectedRows || 0} history records for key ${keyId}`);
    } else {
      console.warn(`⚠️ Failed to remove history records for key ${keyId}:`, historyResult.error);
      // Continue anyway, might not exist
    }
    
    // Clean up gift_usage_history records that might prevent deletion
    const giftHistoryResult = await executeQuery(
      'DELETE FROM gift_usage_history WHERE key_id = ?',
      [keyId]
    );
    
    if (giftHistoryResult.success) {
      console.log(`✅ Removed ${giftHistoryResult.data.affectedRows || 0} gift history records for key ${keyId}`);
    } else {
      console.warn(`⚠️ Failed to remove gift history records for key ${keyId}:`, giftHistoryResult.error);
      // Continue anyway, might not exist
    }
    
    // Then remove all assignments for this key (both active and inactive)
    const result = await executeQuery(
      'DELETE FROM account_keys WHERE key_id = ?',
      [keyId]
    );
    
    if (result.success) {
      console.log(`✅ Removed ${result.data.affectedRows || 0} assignments for key ${keyId}`);
      return { 
        success: true, 
        affectedRows: (result.data.affectedRows || 0) + (historyResult.data?.affectedRows || 0) + (giftHistoryResult.data?.affectedRows || 0)
      };
    } else {
      console.error(`❌ Failed to clean assignments for key ${keyId}:`, result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error(`❌ Error cleaning assignments for key ${keyId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Clean up account_keys for a specific account
 */
async function cleanupAccountAssignments(accountId) {
  console.log(`🧹 Cleaning up assignments for account ${accountId}...`);
  
  try {
    // Step 1: Clean up key_usage_history records for this account first
    const historyCleanup = await executeQuery(
      'DELETE FROM key_usage_history WHERE account_id = ?',
      [accountId]
    );
    
    if (historyCleanup.success) {
      console.log(`✅ Removed ${historyCleanup.data.affectedRows || 0} history records for account ${accountId}`);
    } else {
      console.warn(`⚠️ Failed to cleanup history for account ${accountId}:`, historyCleanup.error);
    }

    // Step 2: Get all keys assigned to this account for status updates
    const assignedKeysResult = await executeQuery(
      'SELECT DISTINCT key_id FROM account_keys WHERE account_id = ? AND is_active = 1',
      [accountId]
    );
    
    // Step 3: Remove all assignments for this account
    const deleteResult = await executeQuery(
      'DELETE FROM account_keys WHERE account_id = ?',
      [accountId]
    );
    
    if (deleteResult.success) {
      console.log(`✅ Removed ${deleteResult.data.affectedRows || 0} assignments for account ${accountId}`);
      
      // Update status of previously assigned keys if they have no other active assignments
      if (assignedKeysResult.success && assignedKeysResult.data.length > 0) {
        for (const keyRecord of assignedKeysResult.data) {
          const keyId = keyRecord.key_id;
          
          // Check if this key has any other active assignments
          const otherAssignments = await executeQuery(
            'SELECT COUNT(*) as count FROM account_keys WHERE key_id = ? AND is_active = 1',
            [keyId]
          );
          
          if (otherAssignments.success && otherAssignments.data[0].count === 0) {
            // No other active assignments, reset key status to 'chờ'
            await executeQuery(
              'UPDATE vpn_keys SET status = ? WHERE id = ? AND status = ?',
              ['chờ', keyId, 'đang hoạt động']
            );
            console.log(`✅ Reset key ${keyId} status to 'chờ'`);
          }
        }
      }
      
      return { 
        success: true, 
        affectedRows: (deleteResult.data.affectedRows || 0) + (historyCleanup.data?.affectedRows || 0)
      };
    } else {
      console.error(`❌ Failed to clean assignments for account ${accountId}:`, deleteResult.error);
      return { success: false, error: deleteResult.error };
    }
  } catch (error) {
    console.error(`❌ Error cleaning assignments for account ${accountId}:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  cleanupAccountKeys,
  cleanupKeyAssignments,
  cleanupAccountAssignments
};
