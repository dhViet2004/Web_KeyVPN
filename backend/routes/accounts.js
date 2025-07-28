const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { executeQuery } = require('../config/database');
const { authenticateToken } = require('./auth');
const { getAccountsStats } = require('../utils/accountHelpers');

const router = express.Router();

// Apply authentication to all routes except health check
router.get('/health', async (req, res) => {
  try {
    // Simple health check query
    const result = await executeQuery('SELECT COUNT(*) as count FROM vpn_accounts');
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Database connection healthy',
        data: {
          totalAccounts: result.data[0].count,
          timestamp: new Date().toISOString()
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Database query failed',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message
    });
  }
});

router.use(authenticateToken);

// Debug endpoint - remove in production
router.get('/debug', async (req, res) => {
  try {
    console.log('=== DEBUG ACCOUNTS ===');
    
    // Test simple account query
    const simpleAccountsResult = await executeQuery('SELECT id, username, is_active, expires_at FROM vpn_accounts LIMIT 5');
    console.log('Simple accounts:', simpleAccountsResult);
    
    // Test account_keys table
    try {
      const accountKeysResult = await executeQuery('SELECT account_id, key_id, is_active FROM account_keys LIMIT 5');
      console.log('Account keys:', accountKeysResult);
    } catch (error) {
      console.log('account_keys table error:', error.message);
    }
    
    // Test the complex query
    const complexQuery = `
      SELECT 
        va.id,
        va.username,
        COALESCE(ak_count.key_count, 0) as key_count,
        3 as max_keys
      FROM vpn_accounts va
      LEFT JOIN (
        SELECT account_id, COUNT(*) as key_count 
        FROM account_keys 
        WHERE is_active = 1 
        GROUP BY account_id
      ) ak_count ON va.id = ak_count.account_id
      WHERE va.is_active = 1
      LIMIT 5
    `;
    
    const complexResult = await executeQuery(complexQuery);
    console.log('Complex query result:', complexResult);
    
    res.json({
      success: true,
      data: {
        simple: simpleAccountsResult,
        complex: complexResult
      }
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/accounts
// @desc    Get VPN accounts with pagination and filters
// @access  Private
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  query('timeFilter').optional().isIn(['all', 'expired', '1hour', '6hours', '12hours', '1day', '3days', '7days', '30days']).withMessage('Invalid time filter')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const timeFilter = req.query.timeFilter || 'all';
    const offset = (page - 1) * limit;

    // Build time filter condition
    let timeCondition = '';
    
    switch (timeFilter) {
      case 'expired':
        timeCondition = 'AND va.expires_at <= NOW()';
        break;
      case '1hour':
        timeCondition = 'AND va.expires_at > NOW() AND TIMESTAMPDIFF(MINUTE, NOW(), va.expires_at) <= 60';
        break;
      case '6hours':
        timeCondition = 'AND va.expires_at > NOW() AND TIMESTAMPDIFF(HOUR, NOW(), va.expires_at) <= 6';
        break;
      case '12hours':
        timeCondition = 'AND va.expires_at > NOW() AND TIMESTAMPDIFF(HOUR, NOW(), va.expires_at) <= 12';
        break;
      case '1day':
        timeCondition = 'AND va.expires_at > NOW() AND TIMESTAMPDIFF(HOUR, NOW(), va.expires_at) <= 24';
        break;
      case '3days':
        timeCondition = 'AND va.expires_at > NOW() AND TIMESTAMPDIFF(HOUR, NOW(), va.expires_at) <= 72';
        break;
      case '7days':
        timeCondition = 'AND va.expires_at > NOW() AND TIMESTAMPDIFF(DAY, NOW(), va.expires_at) <= 7';
        break;
      case '30days':
        timeCondition = 'AND va.expires_at > NOW() AND TIMESTAMPDIFF(DAY, NOW(), va.expires_at) <= 30';
        break;
      default:
        timeCondition = '';
        break;
    }

    // Build search condition and params
    let searchCondition = '';
    let queryParams = [];
    if (search && search.trim() !== '') {
      searchCondition = 'AND va.username LIKE ?';
      queryParams.push(`%${search}%`);
    }
    const accountsQuery = `
      SELECT 
        va.id,
        va.username,
        va.password,
        va.expires_at,
        va.is_active,
        va.created_at,
        va.last_used,
        -- Tính số lượng key đã gán từ bảng account_keys
        COALESCE(ak_count.key_count, 0) as key_count,
        COALESCE(ak_count.key_count, 0) as usage_count,
        3 as max_keys,
        -- Lấy key code từ key_id cũ trước (tạm thời)
        vk.code as key_code,
        kg.code as group_code,
        CASE 
          WHEN va.expires_at <= NOW() THEN 'expired'
          WHEN TIMESTAMPDIFF(HOUR, NOW(), va.expires_at) <= 1 THEN 'expiring_soon'
          WHEN va.is_active = 0 THEN 'suspended'
          ELSE 'active'
        END as status,
        TIMESTAMPDIFF(MINUTE, NOW(), va.expires_at) as minutes_remaining,
        -- Cột Key đã gán: hiển thị số key thực tế từ account_keys
        CONCAT(COALESCE(ak_count.key_count, 0), '/3') as assigned_keys
      FROM vpn_accounts va
      LEFT JOIN vpn_keys vk ON va.key_id = vk.id
      LEFT JOIN key_groups kg ON vk.group_id = kg.id
      LEFT JOIN (
        SELECT account_id, COUNT(*) as key_count 
        FROM account_keys 
        WHERE is_active = 1 
        GROUP BY account_id
      ) ak_count ON va.id = ak_count.account_id
      WHERE 1=1
      ${searchCondition}
      ${timeCondition}
      ORDER BY va.expires_at ASC
      LIMIT ${offset}, ${limit}
    `;
    // KHÔNG push offset, limit vào queryParams nữa!

    // Đặt log sau khi đã khai báo xong queryParams
    console.log('accountsQuery:', accountsQuery);
    console.log('queryParams:', queryParams);

    // Build count query and params
    let countSearchCondition = '';
    let countParams = [];
    if (search && search.trim() !== '') {
      countSearchCondition = 'AND va.username LIKE ?';
      countParams.push(`%${search}%`);
    }
    const countQuery = `
      SELECT COUNT(*) as total
      FROM vpn_accounts va
      WHERE 1=1
      ${countSearchCondition}
      ${timeCondition}
    `;

    const [accountsResult, countResult] = await Promise.all([
      executeQuery(accountsQuery, queryParams),
      executeQuery(countQuery, countParams)
    ]);

    console.log('accountsResult success:', accountsResult.success);
    console.log('accountsResult data count:', accountsResult.data?.length || 0);
    console.log('Sample account data:', accountsResult.data?.[0]);
    console.log('countResult:', countResult);

    if (!accountsResult.success || !countResult.success) {
      return res.json({
        success: true,
        data: {
          accounts: [],
          pagination: {
            current_page: page,
            total_pages: 0,
            total_items: 0,
            per_page: limit,
            has_next: false,
            has_prev: false
          }
        }
      });
    }

    const total = countResult.data[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        accounts: accountsResult.data,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_items: total,
          per_page: limit,
          has_next: page < totalPages,
          has_prev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/accounts
// @desc    Create new VPN account
// @access  Private
router.post('/', [
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('expires_at').custom((value) => {
    // Accept both ISO8601 and MySQL datetime format
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    const mysqlRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    if (!isoRegex.test(value) && !mysqlRegex.test(value)) {
      throw new Error('Valid expiration date is required (ISO8601 or YYYY-MM-DD HH:mm:ss format)');
    }
    return true;
  }),
  body('key_id').optional().isInt().withMessage('Key ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { username, password, expires_at, key_id } = req.body;

    // Normalize expires_at to MySQL datetime format
    let mysqlExpiresAt;
    if (expires_at.includes('T')) {
      // ISO format, convert to MySQL format
      mysqlExpiresAt = new Date(expires_at).toISOString().slice(0, 19).replace('T', ' ');
    } else {
      // Already MySQL format
      mysqlExpiresAt = expires_at;
    }

    // Check if username already exists
    const existingResult = await executeQuery(
      'SELECT id FROM vpn_accounts WHERE username = ?',
      [username]
    );

    if (existingResult.success && existingResult.data.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Username '${username}' already exists`,
        code: 'DUPLICATE_USERNAME'
      });
    }

    // Create account
    const result = await executeQuery(
      'INSERT INTO vpn_accounts (username, password, key_id, expires_at, created_by) VALUES (?, ?, ?, ?, ?)',
      [username, password, key_id || null, mysqlExpiresAt, req.user.id]
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create account'
      });
    }

    res.json({
      success: true,
      message: 'Account created successfully',
      data: {
        id: result.data.insertId,
        username,
        expires_at
      }
    });

  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/accounts/:id  
// @desc    Update VPN account
// @access  Private
router.put('/:id', [
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('expires_at').optional().custom((value) => {
    // Accept both ISO8601 and MySQL datetime format
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    const mysqlRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    if (!isoRegex.test(value) && !mysqlRegex.test(value)) {
      throw new Error('Valid expiration date is required (ISO8601 or YYYY-MM-DD HH:mm:ss format)');
    }
    return true;
  }),
  body('key_id').optional().isInt().withMessage('Key ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const accountId = req.params.id;
    const { password, expires_at, key_id } = req.body;

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];

    if (password) {
      updateFields.push('password = ?');
      updateValues.push(password);
    }

    if (expires_at) {
      // Normalize expires_at to MySQL datetime format
      let mysqlExpiresAt;
      if (expires_at.includes('T')) {
        // ISO format, convert to MySQL format
        mysqlExpiresAt = new Date(expires_at).toISOString().slice(0, 19).replace('T', ' ');
      } else {
        // Already MySQL format
        mysqlExpiresAt = expires_at;
      }
      updateFields.push('expires_at = ?');
      updateValues.push(mysqlExpiresAt);
    }

    if (key_id !== undefined) {
      updateFields.push('key_id = ?');
      updateValues.push(key_id);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Add account ID to values
    updateValues.push(accountId);

    const result = await executeQuery(
      `UPDATE vpn_accounts SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update account'
      });
    }

    if (result.data.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    res.json({
      success: true,
      message: 'Account updated successfully'
    });

  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/accounts/:id
// @desc    Delete VPN account (hard delete with safe key cleanup)
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const accountId = req.params.id;

    console.log(`Attempting to delete account ID: ${accountId}`);

    // First, check if account exists
    const accountCheck = await executeQuery(
      'SELECT id, username FROM vpn_accounts WHERE id = ?',
      [accountId]
    );

    if (!accountCheck.success) {
      console.error('Failed to check account existence:', accountCheck.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify account existence'
      });
    }

    if (accountCheck.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    const accountInfo = accountCheck.data[0];
    console.log(`Deleting account: ${accountInfo.username} (ID: ${accountId})`);

    // Try to handle key assignments before deleting account
    try {
      console.log('Handling key assignments before account deletion...');
      
      // First, get all keys assigned to this account
      const assignedKeysResult = await executeQuery(
        'SELECT key_id FROM account_keys WHERE account_id = ? AND is_active = 1',
        [accountId]
      );
      
      if (assignedKeysResult.success && assignedKeysResult.data.length > 0) {
        const keyIds = assignedKeysResult.data.map(row => row.key_id);
        console.log(`Found ${keyIds.length} keys assigned to account ${accountId}:`, keyIds);
        
        // Update each key's status back to 'chờ' if it has no other active assignments
        for (const keyId of keyIds) {
          try {
            // Check if this key has any other active assignments
            const otherAssignments = await executeQuery(
              'SELECT COUNT(*) as count FROM account_keys WHERE key_id = ? AND account_id != ? AND is_active = 1',
              [keyId, accountId]
            );
            
            // If no other active assignments, reset key status to 'chờ'
            if (otherAssignments.success && otherAssignments.data[0].count === 0) {
              await executeQuery(
                'UPDATE vpn_keys SET status = ? WHERE id = ? AND status = ?',
                ['chờ', keyId, 'đang hoạt động']
              );
              console.log(`✅ Updated key ${keyId} status back to 'chờ'`);
            } else {
              console.log(`Key ${keyId} has other active assignments, keeping current status`);
            }
          } catch (keyUpdateError) {
            console.warn(`Failed to update status for key ${keyId}:`, keyUpdateError.message);
            // Continue with other keys
          }
        }
      }
      
      // Now delete the key assignments
      const deleteKeysResult = await executeQuery(
        'DELETE FROM account_keys WHERE account_id = ?',
        [accountId]
      );
      
      if (deleteKeysResult.success) {
        console.log(`✅ Deleted ${deleteKeysResult.data.affectedRows || 0} key assignments`);
      } else {
        console.log('⚠️ Key assignments deletion failed (table may not exist):', deleteKeysResult.error);
        // Continue with account deletion even if key assignments deletion fails
      }
    } catch (keyError) {
      console.log('⚠️ account_keys table may not exist or error occurred:', keyError.message);
      // Continue with account deletion
    }

    // Delete the account itself
    console.log('Deleting account from vpn_accounts table...');
    const deleteAccountResult = await executeQuery(
      'DELETE FROM vpn_accounts WHERE id = ?',
      [accountId]
    );

    if (!deleteAccountResult.success) {
      console.error('Failed to delete account:', deleteAccountResult.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete account from database'
      });
    }

    if (deleteAccountResult.data.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Account not found or already deleted'
      });
    }

    console.log(`✅ Successfully deleted account: ${accountInfo.username} (ID: ${accountId})`);

    res.json({
      success: true,
      message: `Account '${accountInfo.username}' deleted successfully`
    });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while deleting account'
    });
  }
});

// @route   POST /api/accounts/bulk-extend
// @desc    Bulk extend account expiration
// @access  Private
router.post('/bulk-extend', [
  body('accountIds').isArray({ min: 1 }).withMessage('Account IDs array is required'),
  body('accountIds.*').isInt().withMessage('Each account ID must be an integer'),
  body('expiresAt').custom((value) => {
    // Accept both ISO8601 and MySQL datetime format
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    const mysqlRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    if (!isoRegex.test(value) && !mysqlRegex.test(value)) {
      throw new Error('Valid expiration date is required (ISO8601 or YYYY-MM-DD HH:mm:ss format)');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { accountIds, expiresAt } = req.body;

    // Normalize expires_at to MySQL datetime format
    let mysqlExpiresAt;
    if (expiresAt.includes('T')) {
      // ISO format, convert to MySQL format
      mysqlExpiresAt = new Date(expiresAt).toISOString().slice(0, 19).replace('T', ' ');
    } else {
      // Already MySQL format
      mysqlExpiresAt = expiresAt;
    }

    const placeholders = accountIds.map(() => '?').join(',');
    const result = await executeQuery(
      `UPDATE vpn_accounts SET expires_at = ? WHERE id IN (${placeholders})`,
      [mysqlExpiresAt, ...accountIds]
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to extend accounts'
      });
    }

    res.json({
      success: true,
      message: `Extended ${result.data.affectedRows} accounts successfully`,
      data: {
        affectedRows: result.data.affectedRows
      }
    });

  } catch (error) {
    console.error('Bulk extend error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/accounts/:id/assign-key
// @desc    Assign a key to an account
// @access  Private
router.post('/:id/assign-key', [
  body('keyId').isInt().withMessage('Key ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const accountId = req.params.id;
    const { keyId } = req.body;

    console.log(`Assigning key ${keyId} to account ${accountId}`);

    // Check if account exists (simplified check)
    const accountCheck = await executeQuery(
      'SELECT id, username FROM vpn_accounts WHERE id = ?',
      [accountId]
    );

    if (!accountCheck.success || accountCheck.data.length === 0) {
      console.log(`Account ${accountId} not found`);
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Try to check if tables exist first
    try {
      // Check if key exists and is available (status = 'chờ')
      const keyCheck = await executeQuery(
        'SELECT id, code, status, account_count FROM vpn_keys WHERE id = ? AND status = ?',
        [keyId, 'chờ']
      );

      if (!keyCheck.success || keyCheck.data.length === 0) {
        console.log(`Key ${keyId} not found or not available`);
        return res.status(404).json({
          success: false,
          message: 'Key not found or not available for assignment'
        });
      }

      const keyInfo = keyCheck.data[0];
      console.log(`Key ${keyId} found: ${keyInfo.code}, status: ${keyInfo.status}, account_count: ${keyInfo.account_count}`);

      // Check if key is already assigned to this account
      const existingAssignment = await executeQuery(
        'SELECT id FROM account_keys WHERE account_id = ? AND key_id = ? AND is_active = 1',
        [accountId, keyId]
      );

      if (existingAssignment.success && existingAssignment.data.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Key is already assigned to this account'
        });
      }

      // Check how many keys are already assigned to this account (limit 3 per account)
      const accountKeyCountCheck = await executeQuery(
        'SELECT COUNT(*) as count FROM account_keys WHERE account_id = ? AND is_active = 1',
        [accountId]
      );

      if (accountKeyCountCheck.success && accountKeyCountCheck.data[0].count >= 3) {
        return res.status(400).json({
          success: false,
          message: 'Account already has maximum number of keys (3)'
        });
      }

      // Check how many accounts are already assigned to this key (limit based on key's account_count)
      const keyAssignmentCountCheck = await executeQuery(
        'SELECT COUNT(*) as count FROM account_keys WHERE key_id = ? AND is_active = 1',
        [keyId]
      );

      if (keyAssignmentCountCheck.success && keyAssignmentCountCheck.data[0].count >= keyInfo.account_count) {
        return res.status(400).json({
          success: false,
          message: `Key ${keyInfo.code} already has maximum number of accounts assigned (${keyInfo.account_count})`
        });
      }

      // Assign key to account
      const result = await executeQuery(
        'INSERT INTO account_keys (account_id, key_id, assigned_by) VALUES (?, ?, ?)',
        [accountId, keyId, req.user?.id || null]
      );

      if (!result.success) {
        console.error('Failed to assign key:', result.error);
        return res.status(500).json({
          success: false,
          message: 'Failed to assign key to account'
        });
      }

      // Update key status to 'đang hoạt động' when first assigned
      try {
        await executeQuery(
          'UPDATE vpn_keys SET status = ? WHERE id = ? AND status = ?',
          ['đang hoạt động', keyId, 'chờ']
        );
        console.log(`Updated key ${keyId} status to 'đang hoạt động'`);
      } catch (updateError) {
        console.warn('Failed to update key status:', updateError.message);
        // Continue even if status update fails
      }

      console.log(`✅ Key ${keyId} (${keyInfo.code}) assigned to account ${accountId} successfully`);

      res.json({
        success: true,
        message: `Key ${keyInfo.code} assigned successfully`,
        data: {
          keyId: keyId,
          keyCode: keyInfo.code,
          accountId: accountId
        }
      });

    } catch (tableError) {
      console.log('Key tables may not exist:', tableError.message);
      
      // If tables don't exist, return a user-friendly message
      return res.status(503).json({
        success: false,
        message: 'Key management system is not fully configured. Please contact administrator.'
      });
    }

  } catch (error) {
    console.error('Assign key error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/accounts/:id/unassign-key/:keyId
// @desc    Unassign a key from an account
// @access  Private
router.delete('/:id/unassign-key/:keyId', async (req, res) => {
  try {
    const accountId = req.params.id;
    const keyId = req.params.keyId;

    console.log(`Unassigning key ${keyId} from account ${accountId}`);

    // Check if account exists
    const accountCheck = await executeQuery(
      'SELECT id, username FROM vpn_accounts WHERE id = ?',
      [accountId]
    );

    if (!accountCheck.success || accountCheck.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    try {
      // Check if assignment exists
      const assignmentCheck = await executeQuery(
        'SELECT id FROM account_keys WHERE account_id = ? AND key_id = ? AND is_active = 1',
        [accountId, keyId]
      );

      if (!assignmentCheck.success || assignmentCheck.data.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Key assignment not found'
        });
      }

      // Remove assignment (soft delete)
      const result = await executeQuery(
        'UPDATE account_keys SET is_active = 0 WHERE account_id = ? AND key_id = ?',
        [accountId, keyId]
      );

      if (!result.success) {
        console.error('Failed to unassign key:', result.error);
        return res.status(500).json({
          success: false,
          message: 'Failed to unassign key'
        });
      }

      // Check if this key has any remaining active assignments
      try {
        const remainingAssignments = await executeQuery(
          'SELECT COUNT(*) as count FROM account_keys WHERE key_id = ? AND is_active = 1',
          [keyId]
        );

        // If no more active assignments, set key status back to 'chờ'
        if (remainingAssignments.success && remainingAssignments.data[0].count === 0) {
          await executeQuery(
            'UPDATE vpn_keys SET status = ? WHERE id = ? AND status = ?',
            ['chờ', keyId, 'đang hoạt động']
          );
          console.log(`Updated key ${keyId} status back to 'chờ' (no active assignments)`);
        }
      } catch (updateError) {
        console.warn('Failed to update key status:', updateError.message);
        // Continue even if status update fails
      }

      console.log(`✅ Key ${keyId} unassigned from account ${accountId} successfully`);

      res.json({
        success: true,
        message: 'Key unassigned successfully'
      });

    } catch (tableError) {
      console.log('Key tables may not exist:', tableError.message);
      
      return res.status(503).json({
        success: false,
        message: 'Key management system is not fully configured. Please contact administrator.'
      });
    }

  } catch (error) {
    console.error('Unassign key error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/accounts/:id/keys
// @desc    Get all keys assigned to an account
// @access  Private
router.get('/:id/keys', async (req, res) => {
  try {
    const accountId = req.params.id;

    console.log(`Getting keys for account ID: ${accountId}`);

    // First check if account exists
    const accountCheck = await executeQuery(
      'SELECT id, username FROM vpn_accounts WHERE id = ?',
      [accountId]
    );

    if (!accountCheck.success || accountCheck.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    try {
      // Try to get keys from account_keys table if it exists
      const result = await executeQuery(`
        SELECT 
          vk.id,
          vk.code,
          vk.status,
          vk.key_type,
          kg.name as group_name,
          kg.code as group_code,
          ak.assigned_at
        FROM account_keys ak
        JOIN vpn_keys vk ON ak.key_id = vk.id
        LEFT JOIN key_groups kg ON vk.group_id = kg.id
        WHERE ak.account_id = ? AND ak.is_active = 1
        ORDER BY ak.assigned_at DESC
      `, [accountId]);

      if (result.success) {
        console.log(`Found ${result.data.length} keys for account ${accountId}`);
        return res.json({
          success: true,
          data: result.data
        });
      } else {
        console.log('Query failed, falling back to empty result:', result.error);
      }
    } catch (keyError) {
      console.log('Key tables may not exist, returning empty result:', keyError.message);
    }

    // If tables don't exist or query fails, return empty array
    console.log(`No keys found for account ${accountId}, returning empty array`);
    res.json({
      success: true,
      data: []
    });

  } catch (error) {
    console.error('Get account keys error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/accounts/available-keys
// @desc    Get all available keys that can be assigned
// @access  Private
router.get('/available-keys', async (req, res) => {
  try {
    console.log('Getting available keys...');

    // First, let's check if tables exist
    try {
      const tableCheck = await executeQuery(`
        SELECT COUNT(*) as count FROM information_schema.tables 
        WHERE table_schema = 'keyvpn_db' 
        AND table_name IN ('vpn_keys', 'key_groups', 'account_keys')
      `);
      
      if (tableCheck.success && tableCheck.data[0].count < 3) {
        console.log('Some required tables are missing');
        return res.json({
          success: true,
          data: [],
          message: 'Database tables not fully configured'
        });
      }
    } catch (error) {
      console.log('Table check failed:', error.message);
    }

    try {
      console.log('Executing available keys query...');
      // Get all keys with status 'chờ' (waiting/available) that are not assigned to any account
      // or have available slots (for multi-account keys)
      const result = await executeQuery(`
        SELECT 
          vk.id,
          vk.code,
          vk.status,
          vk.key_type,
          vk.days_valid,
          vk.account_count,
          kg.name as group_name,
          kg.code as group_code,
          vk.created_at,
          COALESCE(assigned_count.count, 0) as currently_assigned
        FROM vpn_keys vk
        LEFT JOIN key_groups kg ON vk.group_id = kg.id
        LEFT JOIN (
          SELECT key_id, COUNT(*) as count 
          FROM account_keys 
          WHERE is_active = 1 
          GROUP BY key_id
        ) assigned_count ON vk.id = assigned_count.key_id
        WHERE vk.status = 'chờ' 
        AND (assigned_count.count IS NULL OR assigned_count.count < vk.account_count)
        ORDER BY kg.code, vk.code
      `);

      if (result.success) {
        console.log(`Found ${result.data.length} available keys`);
        return res.json({
          success: true,
          data: result.data
        });
      } else {
        console.log('Query failed:', result.error);
      }
    } catch (keyError) {
      console.log('Complex query failed, trying simpler query:', keyError.message);
      
      // Try a simpler query without the complex joins
      try {
        const simpleResult = await executeQuery(`
          SELECT 
            vk.id,
            vk.code,
            vk.status,
            vk.key_type,
            vk.days_valid,
            vk.account_count,
            kg.name as group_name,
            kg.code as group_code
          FROM vpn_keys vk
          LEFT JOIN key_groups kg ON vk.group_id = kg.id
          WHERE vk.status = 'chờ'
          ORDER BY kg.code, vk.code
        `);
        
        if (simpleResult.success && simpleResult.data.length > 0) {
          console.log(`Found ${simpleResult.data.length} keys with simple query`);
          return res.json({
            success: true,
            data: simpleResult.data.map(key => ({
              ...key,
              currently_assigned: 0 // Default value since we can't calculate it
            }))
          });
        }
      } catch (simpleError) {
        console.log('Simple query also failed:', simpleError.message);
      }
    }

    // If tables don't exist or query fails, return empty array
    console.log('No keys found, returning empty array');
    res.json({
      success: true,
      data: []
    });

  } catch (error) {
    console.error('Get available keys error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/accounts/stats
// @desc    Get accounts statistics
// @access  Private
router.get('/stats', async (req, res) => {
  try {
    const result = await getAccountsStats();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || 'Failed to get statistics'
      });
    }

    res.json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('Get account stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/accounts/transfer-key
// @desc    Transfer a key from one account to another
// @access  Private
router.post('/transfer-key', [
  body('keyId').isInt().withMessage('Key ID must be an integer'),
  body('fromAccountId').isInt().withMessage('From account ID must be an integer'),
  body('toAccountId').isInt().withMessage('To account ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { keyId, fromAccountId, toAccountId } = req.body;

    console.log(`Transferring key ${keyId} from account ${fromAccountId} to account ${toAccountId}`);

    // Check if both accounts exist
    const accountsCheck = await executeQuery(
      'SELECT id, username FROM vpn_accounts WHERE id IN (?, ?)',
      [fromAccountId, toAccountId]
    );

    if (!accountsCheck.success || accountsCheck.data.length !== 2) {
      return res.status(404).json({
        success: false,
        message: 'One or both accounts not found'
      });
    }

    try {
      // Check if key exists and is currently assigned to the from account
      const keyAssignmentCheck = await executeQuery(
        'SELECT ak.id, ak.account_id, vk.code, vk.status, vk.account_count FROM account_keys ak JOIN vpn_keys vk ON ak.key_id = vk.id WHERE ak.key_id = ? AND ak.account_id = ? AND ak.is_active = 1',
        [keyId, fromAccountId]
      );

      if (!keyAssignmentCheck.success || keyAssignmentCheck.data.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Key is not currently assigned to the source account'
        });
      }

      const keyInfo = keyAssignmentCheck.data[0];

      // Check if target account has available slots
      const targetAccountKeyCount = await executeQuery(
        'SELECT COUNT(*) as count FROM account_keys WHERE account_id = ? AND is_active = 1',
        [toAccountId]
      );

      if (targetAccountKeyCount.success && targetAccountKeyCount.data[0].count >= 3) {
        return res.status(400).json({
          success: false,
          message: 'Target account already has maximum number of keys (3)'
        });
      }

      // Start transaction-like operations
      // 1. Unassign key from source account
      const unassignResult = await executeQuery(
        'UPDATE account_keys SET is_active = 0 WHERE key_id = ? AND account_id = ? AND is_active = 1',
        [keyId, fromAccountId]
      );

      if (!unassignResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to unassign key from source account'
        });
      }

      // 2. Assign key to target account
      const assignResult = await executeQuery(
        'INSERT INTO account_keys (account_id, key_id, assigned_by) VALUES (?, ?, ?)',
        [toAccountId, keyId, req.user?.id || null]
      );

      if (!assignResult.success) {
        // Rollback: reactivate the key in source account
        await executeQuery(
          'UPDATE account_keys SET is_active = 1 WHERE key_id = ? AND account_id = ? AND is_active = 0',
          [keyId, fromAccountId]
        );
        
        return res.status(500).json({
          success: false,
          message: 'Failed to assign key to target account'
        });
      }

      console.log(`✅ Key ${keyId} (${keyInfo.code}) transferred from account ${fromAccountId} to account ${toAccountId} successfully`);

      res.json({
        success: true,
        message: `Key ${keyInfo.code} transferred successfully`,
        data: {
          keyId: keyId,
          keyCode: keyInfo.code,
          fromAccountId: fromAccountId,
          toAccountId: toAccountId
        }
      });

    } catch (tableError) {
      console.log('Key tables may not exist:', tableError.message);
      
      return res.status(503).json({
        success: false,
        message: 'Key management system is not fully configured. Please contact administrator.'
      });
    }

  } catch (error) {
    console.error('Transfer key error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
