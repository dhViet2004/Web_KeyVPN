const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { executeQuery } = require('../config/database');
const { authenticateToken } = require('./auth');
const { getAccountsStats } = require('../utils/accountHelpers');
const { cleanupAccountKeys, cleanupAccountAssignments } = require('../utils/cleanupHelpers');

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

// @route   GET /api/accounts
// @desc    Get VPN accounts with pagination and filters
// @access  Private
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 0, max: 1000 }).withMessage('Limit must be between 0 and 1000 (0 means no limit)'),
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
    const limit = parseInt(req.query.limit) || 0; // 0 means no limit
    const search = req.query.search || '';
    const timeFilter = req.query.timeFilter || 'all';
    const offset = (page - 1) * (limit || 20); // Use 20 as default for offset calculation when limit is provided

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
        COALESCE(ak_count.key_count, 0) as current_key_count,
        COALESCE(ak_count.key_count, 0) as usage_count,
        -- Lấy thông tin key type chủ đạo từ key được gán nhiều nhất
        COALESCE(ak_dominant.dominant_key_type, '2key') as dominant_key_type,
        -- Tính slot tối đa dựa trên key type của key đầu tiên được gán (dynamic slots)
        COALESCE(ak_slots.max_key_slots, 3) as max_key_slots,
        COALESCE(ak_slots.max_key_slots, 3) as max_keys,
        -- Lấy key code từ key_id cũ trước (tạm thời để tương thích)
        vk.code as key_code,
        kg.code as group_code,
        CASE 
          WHEN va.expires_at <= NOW() THEN 'hết hạn'
          WHEN TIMESTAMPDIFF(HOUR, NOW(), va.expires_at) <= 1 THEN 'sắp hết hạn'
          ELSE 'hoạt động'
        END as status,
        TIMESTAMPDIFF(MINUTE, NOW(), va.expires_at) as minutes_remaining,
        -- Cột Key đã gán: hiển thị số key thực tế với slot động dựa trên key type
        CONCAT(
          COALESCE(ak_count.key_count, 0), 
          '/', 
          COALESCE(ak_slots.max_key_slots, 3)
        ) as assigned_keys,
        -- Danh sách key codes được gán (cho frontend debug)
        COALESCE(ak_keys.assigned_key_codes, '') as assigned_key_codes
      FROM vpn_accounts va
      LEFT JOIN vpn_keys vk ON va.key_id = vk.id
      LEFT JOIN key_groups kg ON vk.group_id = kg.id
      -- Đếm số key active cho mỗi account
      LEFT JOIN (
        SELECT account_id, COUNT(*) as key_count 
        FROM account_keys 
        WHERE is_active = 1 
        GROUP BY account_id
      ) ak_count ON va.id = ak_count.account_id
      -- Tìm key type chủ đạo (key type đầu tiên được gán cho mỗi account)
      LEFT JOIN (
        SELECT 
          ak.account_id,
          MIN(vk.key_type) as dominant_key_type
        FROM account_keys ak
        INNER JOIN vpn_keys vk ON ak.key_id = vk.id
        WHERE ak.is_active = 1
        GROUP BY ak.account_id
      ) ak_dominant ON va.id = ak_dominant.account_id
      -- Tính slot tối đa dựa trên key type của key đầu tiên
      LEFT JOIN (
        SELECT 
          ak.account_id,
          CASE 
            WHEN MIN(vk.key_type) = '1key' THEN 1
            WHEN MIN(vk.key_type) = '2key' THEN 2
            WHEN MIN(vk.key_type) = '3key' THEN 3
            ELSE 3
          END as max_key_slots
        FROM account_keys ak
        INNER JOIN vpn_keys vk ON ak.key_id = vk.id
        WHERE ak.is_active = 1
        GROUP BY ak.account_id
      ) ak_slots ON va.id = ak_slots.account_id
      -- Lấy danh sách key codes (cho debug)
      LEFT JOIN (
        SELECT 
          ak.account_id,
          GROUP_CONCAT(vk.code SEPARATOR ', ') as assigned_key_codes
        FROM account_keys ak
        INNER JOIN vpn_keys vk ON ak.key_id = vk.id
        WHERE ak.is_active = 1
        GROUP BY ak.account_id
      ) ak_keys ON va.id = ak_keys.account_id
      WHERE 1=1
      ${searchCondition}
      ${timeCondition}
      ORDER BY va.expires_at ASC
      ${limit > 0 ? `LIMIT ${offset}, ${limit}` : ''}
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

    console.log('accountsResult:', accountsResult);
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
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

    res.json({
      success: true,
      data: {
        accounts: accountsResult.data,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_items: total,
          per_page: limit || total, // Show actual limit or total items
          has_next: limit > 0 ? page < totalPages : false,
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

    // Clean up account assignments BEFORE deleting the account
    console.log(`🧹 Cleaning up assignments for account ${accountId} before deletion...`);
    const cleanupResult = await cleanupAccountAssignments(accountId);
    
    if (cleanupResult.success) {
      console.log(`✅ Cleaned up ${cleanupResult.affectedRows} assignments for account ${accountId}`);
    } else {
      console.warn(`⚠️ Cleanup failed for account ${accountId}:`, cleanupResult.error);
      // Continue with deletion even if cleanup fails
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

    // Run general cleanup after deletion to ensure data consistency
    console.log('🧹 Running general account_keys cleanup after account deletion...');
    const generalCleanup = await cleanupAccountKeys();
    if (generalCleanup.success) {
      console.log('✅ General cleanup completed after account deletion');
    } else {
      console.warn('⚠️ General cleanup failed after account deletion:', generalCleanup.error);
    }

    console.log(`✅ Successfully deleted account: ${accountInfo.username} (ID: ${accountId})`);

    res.json({
      success: true,
      message: `Account '${accountInfo.username}' deleted successfully`,
      cleanup: {
        assignmentsRemoved: cleanupResult.success ? cleanupResult.affectedRows : 0,
        generalCleanup: generalCleanup.success
      }
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
        'SELECT id, code, status, account_count, key_type FROM vpn_keys WHERE id = ? AND status = ?',
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
      console.log(`Key ${keyId} found: ${keyInfo.code}, status: ${keyInfo.status}, account_count: ${keyInfo.account_count}, key_type: ${keyInfo.key_type}`);

      // Check if key is already assigned to this account
      const existingAssignment = await executeQuery(
        'SELECT id FROM account_keys WHERE account_id = ? AND key_id = ?',
        [accountId, keyId]
      );

      if (existingAssignment.success && existingAssignment.data.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Key is already assigned to this account'
        });
      }

      // KIỂM TRA SLOT LIMIT TRƯỚC KHI GÁN KEY - để tránh gán xong mới kiểm tra
      // Check how many keys are already assigned to this account và áp dụng logic slot động
      const accountKeyInfoQuery = `
        SELECT 
          COUNT(*) as current_key_count,
          MIN(vk.key_type) as first_key_type,
          MAX(vk.key_type) as last_key_type,
          GROUP_CONCAT(DISTINCT vk.key_type) as all_key_types,
          CASE 
            WHEN MIN(vk.key_type) = '1key' THEN 1
            WHEN MIN(vk.key_type) = '2key' THEN 2
            WHEN MIN(vk.key_type) = '3key' THEN 3
            ELSE 3
          END as max_slots_based_on_type
        FROM account_keys ak
        INNER JOIN vpn_keys vk ON ak.key_id = vk.id
        WHERE ak.account_id = ?
      `;
      
      const accountKeyInfo = await executeQuery(accountKeyInfoQuery, [accountId]);
      
      if (accountKeyInfo.success && accountKeyInfo.data.length > 0 && accountKeyInfo.data[0].current_key_count > 0) {
        const currentKeyCount = accountKeyInfo.data[0].current_key_count;
        const firstKeyType = accountKeyInfo.data[0].first_key_type;
        const allKeyTypes = accountKeyInfo.data[0].all_key_types;
        const maxSlotsBasedOnType = accountKeyInfo.data[0].max_slots_based_on_type;
        
        console.log(`Account ${accountId} current status BEFORE assignment:`, {
          currentKeyCount,
          firstKeyType,
          allKeyTypes,
          maxSlotsBasedOnType,
          newKeyType: keyInfo.key_type
        });
        
        // Kiểm tra key type compatibility - CHỈ cho phép cùng loại key
        if (keyInfo.key_type !== firstKeyType) {
          return res.status(400).json({
            success: false,
            message: `Cannot assign ${keyInfo.key_type} to account that already has ${firstKeyType}. Key types must match.`
          });
        }
        
        // Áp dụng logic slot động dựa trên key type - KIỂM TRA TRƯỚC KHI GÁN
        if (firstKeyType === '1key' && currentKeyCount >= 1) {
          return res.status(400).json({
            success: false,
            message: 'Account with 1key type can only have 1 key maximum'
          });
        }
        
        if (firstKeyType === '2key' && currentKeyCount >= 2) {
          return res.status(400).json({
            success: false,
            message: 'Account with 2key type can only have 2 keys maximum'
          });
        }
        
        if (firstKeyType === '3key' && currentKeyCount >= 3) {
          return res.status(400).json({
            success: false,
            message: 'Account with 3key type can only have 3 keys maximum'
          });
        }
        
        // Kiểm tra tổng quát - không được vượt quá slot limit
        if (currentKeyCount >= maxSlotsBasedOnType) {
          return res.status(400).json({
            success: false,
            message: `Account already has maximum number of keys (${maxSlotsBasedOnType}) based on key type ${firstKeyType}`
          });
        }
      } else {
        // Account trống - cho phép gán bất kỳ loại key nào
        console.log(`Account ${accountId} is empty, allowing ${keyInfo.key_type} assignment`);
      }

      // SAU KHI KIỂM TRA XONG, THỰC HIỆN GÁN KEY - luôn tạo assignment mới
      const assignResult = await executeQuery(
        'INSERT INTO account_keys (account_id, key_id, assigned_by) VALUES (?, ?, ?)',
        [accountId, keyId, req.user?.id || null]
      );

      // Assign key to account (reuse assignResult from above)
      if (!assignResult.success) {
        console.error('Database assignment error:', assignResult.error);
        
        // Provide more specific error messages for different database constraint violations
        let errorMessage = 'Failed to assign key to account';
        
        if (assignResult.error.includes('Duplicate entry') || assignResult.error.includes('unique_account_key')) {
          errorMessage = `Key ${keyInfo.code} has a database record conflict. This might be due to an inactive assignment that needs reactivation. Please refresh data and try again.`;
        } else if (assignResult.error.includes('Foreign key constraint')) {
          errorMessage = 'Database integrity error. Please check if the account or key still exists.';
        }
        
        return res.status(500).json({
          success: false,
          message: errorMessage,
          details: assignResult.error // Include technical details for debugging
        });
      }

      // Check how many accounts are already assigned to this key (limit based on key's account_count)
      // This check is done AFTER assignment to ensure we don't exceed the key's account limit
      const keyAssignmentCountCheck = await executeQuery(
        'SELECT COUNT(*) as count FROM account_keys WHERE key_id = ? AND is_active = 1',
        [keyId]
      );

      if (keyAssignmentCountCheck.success && keyAssignmentCountCheck.data[0].count > keyInfo.account_count) {
        // If we exceeded the limit, rollback the assignment
        console.error(`Key ${keyId} exceeded account limit after assignment. Rolling back...`);
        
        // Rollback assignment - always delete the record
        await executeQuery(
          'DELETE FROM account_keys WHERE account_id = ? AND key_id = ?',
          [accountId, keyId]
        );
        
        return res.status(400).json({
          success: false,
          message: `Key ${keyInfo.code} already has maximum number of accounts assigned (${keyInfo.account_count})`
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

      // Lấy thông tin account sau khi gán key để trả về cho frontend
      const updatedAccountQuery = `
        SELECT 
          va.id,
          va.username,
          COALESCE(ak_count.key_count, 0) as current_key_count,
          CASE 
            WHEN MIN(vk.key_type) = '1key' THEN 1
            WHEN MIN(vk.key_type) = '2key' THEN 2
            WHEN MIN(vk.key_type) = '3key' THEN 3
            ELSE 3
          END as max_key_slots,
          CONCAT(
            COALESCE(ak_count.key_count, 0), 
            '/', 
            CASE 
              WHEN MIN(vk.key_type) = '1key' THEN 1
              WHEN MIN(vk.key_type) = '2key' THEN 2
              WHEN MIN(vk.key_type) = '3key' THEN 3
              ELSE 3
            END
          ) as assigned_keys,
          MIN(vk.key_type) as key_type_restriction
        FROM vpn_accounts va
        LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
        LEFT JOIN vpn_keys vk ON ak.key_id = vk.id
        LEFT JOIN (
          SELECT account_id, COUNT(*) as key_count 
          FROM account_keys 
          WHERE is_active = 1 AND account_id = ?
          GROUP BY account_id
        ) ak_count ON va.id = ak_count.account_id
        WHERE va.id = ?
        GROUP BY va.id, va.username, ak_count.key_count
      `;

      const updatedAccount = await executeQuery(updatedAccountQuery, [accountId, accountId]);

      // All assignments are new assignments now (no reactivation)
      const isReactivation = false;
      
      console.log(`✅ Key ${keyId} (${keyInfo.code}) assigned to account ${accountId} successfully`);
      console.log(`📊 Assignment summary:`, {
        keyId,
        keyCode: keyInfo.code,
        keyType: keyInfo.key_type,
        accountId,
        wasReactivation: isReactivation,
        finalActiveAssignments: keyAssignmentCountCheck.success ? keyAssignmentCountCheck.data[0].count : 'unknown'
      });

      // Tạo message về thay đổi slot dựa trên key type
      let slotChangeMessage = '';
      if (keyInfo.key_type === '1key') {
        slotChangeMessage = 'Tài khoản chuyển thành 1 slot tối đa (1key/tài khoản).';
      } else if (keyInfo.key_type === '2key') {
        slotChangeMessage = 'Tài khoản chuyển thành 2 slot tối đa (2key/tài khoản).';
      } else if (keyInfo.key_type === '3key') {
        slotChangeMessage = 'Tài khoản giữ nguyên 3 slot tối đa (3key/tài khoản).';
      }

      res.json({
        success: true,
        message: `Key ${keyInfo.code} ${isReactivation ? 'reactivated and assigned' : 'assigned'} successfully`,
        data: {
          keyId: keyId,
          keyCode: keyInfo.code,
          accountId: accountId,
          slotChangeMessage: slotChangeMessage,
          updatedAccount: updatedAccount.success && updatedAccount.data.length > 0 ? 
            updatedAccount.data[0] : null
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
    
    // Xử lý các loại lỗi cụ thể
    let statusCode = 500;
    let message = 'Internal server error';
    
    if (error.message && error.message.includes('Duplicate entry')) {
      statusCode = 400;
      message = 'Key is already assigned to this account';
    } else if (error.message && error.message.includes('cannot have more than 3 active keys')) {
      statusCode = 400;
      message = 'Account already has maximum number of keys (3)';
    } else if (error.code === 'ER_DUP_ENTRY') {
      statusCode = 400;
      message = 'Key is already assigned to this account';
    }
    
    res.status(statusCode).json({
      success: false,
      message: message
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

      // Remove assignment (hard delete)
      const result = await executeQuery(
        'DELETE FROM account_keys WHERE account_id = ? AND key_id = ?',
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
          'SELECT COUNT(*) as count FROM account_keys WHERE key_id = ?',
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

module.exports = router;
