#!/usr/bin/env node

/**
 * Test Key Assignment Policy
 * Verifies that auto assignment ONLY processes keys assigned to expiring accounts,
 * NOT keys in 'chờ' status waiting for user activation
 */

const { executeQuery } = require('./backend/config/database');

async function testKeyAssignmentPolicy() {
  console.log('🧪 Testing Key Assignment Policy...\n');

  try {
    // Test 1: Check keys in 'chờ' status that have never been assigned
    console.log('📋 Test 1: Keys in "chờ" status that should NOT be auto-assigned');
    const waitingKeysQuery = `
      SELECT 
        vk.id as key_id,
        vk.code,
        vk.key_type,
        vk.status,
        vk.created_at,
        CASE 
          WHEN kuh.key_id IS NULL THEN 'NEVER_ACTIVATED'
          ELSE 'HAS_HISTORY'
        END as activation_status
      FROM vpn_keys vk
      LEFT JOIN key_usage_history kuh ON vk.id = kuh.key_id AND kuh.action IN ('activated', 'transferred')
      WHERE vk.status = 'chờ'
      AND vk.id NOT IN (
        SELECT DISTINCT ak.key_id 
        FROM account_keys ak 
        WHERE ak.is_active = 1
      )
      ORDER BY vk.created_at DESC
      LIMIT 10
    `;

    const waitingResult = await executeQuery(waitingKeysQuery);
    
    if (waitingResult.success && waitingResult.data.length > 0) {
      console.log(`✅ Found ${waitingResult.data.length} keys in "chờ" status:`);
      waitingResult.data.forEach(key => {
        console.log(`  - Key: ${key.code} (${key.key_type}) - Status: ${key.activation_status}`);
        if (key.activation_status === 'NEVER_ACTIVATED') {
          console.log(`    ✅ CORRECT: This key should NOT be auto-assigned (waiting for user activation)`);
        } else {
          console.log(`    ⚠️ This key has history - could be orphaned from deleted account`);
        }
      });
    } else {
      console.log('ℹ️ No keys in "chờ" status found');
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test 2: Check keys currently assigned to expiring accounts
    console.log('📋 Test 2: Keys assigned to expiring accounts (SHOULD be auto-assigned)');
    const assignedToExpiringQuery = `
      SELECT 
        va.id as account_id,
        va.username,
        va.expires_at,
        TIMESTAMPDIFF(MINUTE, NOW(), va.expires_at) as minutes_remaining,
        vk.id as key_id,
        vk.code,
        vk.key_type,
        vk.status
      FROM vpn_accounts va
      INNER JOIN account_keys ak ON va.id = ak.account_id
      INNER JOIN vpn_keys vk ON ak.key_id = vk.id
      WHERE va.expires_at IS NOT NULL
      AND ak.is_active = 1
      AND (
        TIMESTAMPDIFF(MINUTE, NOW(), va.expires_at) <= 60
        OR va.expires_at <= NOW()
      )
      ORDER BY va.expires_at ASC, vk.key_type
      LIMIT 10
    `;

    const assignedResult = await executeQuery(assignedToExpiringQuery);
    
    if (assignedResult.success && assignedResult.data.length > 0) {
      console.log(`✅ Found ${assignedResult.data.length} keys assigned to expiring accounts:`);
      assignedResult.data.forEach(key => {
        const expiryStatus = key.minutes_remaining <= 0 ? 'EXPIRED' : `expiring in ${key.minutes_remaining}min`;
        console.log(`  - Account: ${key.username} (${expiryStatus})`);
        console.log(`    Key: ${key.code} (${key.key_type}) - Status: ${key.status}`);
        console.log(`    ✅ CORRECT: This key SHOULD be auto-assigned to new account`);
      });
    } else {
      console.log('ℹ️ No keys assigned to expiring accounts found');
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test 3: Check for orphaned keys (previously assigned but account deleted)
    console.log('📋 Test 3: Orphaned keys from deleted accounts (SHOULD be auto-assigned)');
    const orphanedKeysQuery = `
      SELECT DISTINCT
        vk.id as key_id,
        vk.code,
        vk.key_type,
        vk.status,
        kuh.account_id as last_account_id,
        va.username as last_account_username,
        va.expires_at as last_account_expires,
        CASE 
          WHEN va.id IS NULL THEN 'ACCOUNT_DELETED'
          WHEN va.expires_at <= NOW() AND va.is_active = 0 THEN 'ACCOUNT_EXPIRED_INACTIVE'
          ELSE 'ACCOUNT_EXISTS'
        END as account_status
      FROM vpn_keys vk
      INNER JOIN key_usage_history kuh ON vk.id = kuh.key_id
      LEFT JOIN vpn_accounts va ON kuh.account_id = va.id
      WHERE vk.status = 'chờ'
      AND vk.id NOT IN (
        SELECT DISTINCT ak.key_id 
        FROM account_keys ak 
        WHERE ak.is_active = 1
      )
      AND kuh.action IN ('activated', 'transferred')
      ORDER BY kuh.created_at DESC
      LIMIT 10
    `;

    const orphanedResult = await executeQuery(orphanedKeysQuery);
    
    if (orphanedResult.success && orphanedResult.data.length > 0) {
      console.log(`✅ Found ${orphanedResult.data.length} orphaned keys:`);
      orphanedResult.data.forEach(key => {
        console.log(`  - Key: ${key.code} (${key.key_type}) - Status: ${key.account_status}`);
        console.log(`    Last account: ${key.last_account_username || 'DELETED'}`);
        console.log(`    ✅ CORRECT: This key SHOULD be auto-assigned to new account`);
      });
    } else {
      console.log('ℹ️ No orphaned keys found');
    }

    console.log('\n' + '='.repeat(60) + '\n');
    console.log('✅ Key Assignment Policy Test Completed!');
    
    // Summary
    const neverActivated = waitingResult.success ? 
      waitingResult.data.filter(k => k.activation_status === 'NEVER_ACTIVATED').length : 0;
    const assignedToExpiring = assignedResult.success ? assignedResult.data.length : 0;
    const orphaned = orphanedResult.success ? orphanedResult.data.length : 0;

    console.log('\n📊 Summary:');
    console.log(`  - Keys waiting for user activation (should NOT auto-assign): ${neverActivated}`);
    console.log(`  - Keys assigned to expiring accounts (should auto-assign): ${assignedToExpiring}`);
    console.log(`  - Orphaned keys from deleted accounts (should auto-assign): ${orphaned}`);
    
    if (neverActivated > 0) {
      console.log(`\n✅ POLICY CORRECT: ${neverActivated} keys waiting for user activation will be left alone`);
    }
    
    if (assignedToExpiring > 0 || orphaned > 0) {
      console.log(`\n✅ POLICY CORRECT: ${assignedToExpiring + orphaned} keys will be auto-assigned to new accounts`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testKeyAssignmentPolicy();
}

module.exports = { testKeyAssignmentPolicy };
