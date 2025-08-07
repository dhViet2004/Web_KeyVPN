const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, getConnection } = require('../config/database');

const router = express.Router();

// @route   POST /api/public/check-key
// @desc    Check key validity (public endpoint)
// @access  Public
router.post('/check-key', [
  body('keyCode').trim().isLength({ min: 3 }).withMessage('Key code is required')
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

    const { keyCode } = req.body;

    // Check if key exists and get info
    const query = `
      SELECT 
        vk.id,
        vk.code,
        vk.status,
        vk.days_valid,
        vk.key_type,
        vk.account_count,
        vk.expires_at,
        kg.code as group_code,
        kg.name as group_name,
        CASE 
          WHEN vk.expires_at IS NULL THEN vk.days_valid
          WHEN vk.expires_at > NOW() THEN DATEDIFF(vk.expires_at, NOW())
          ELSE 0
        END as days_remaining
      FROM vpn_keys vk
      JOIN key_groups kg ON vk.group_id = kg.id
      WHERE vk.code = ? AND vk.status != 'đã xóa'
    `;

    const result = await executeQuery(query, [keyCode]);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Database query failed'
      });
    }

    if (result.data.length === 0) {
      return res.json({
        success: false,
        message: 'Key không tồn tại hoặc đã bị xóa',
        data: null
      });
    }

    const keyData = result.data[0];

    // Check if key is expired
    if (keyData.status === 'hết hạn' || keyData.days_remaining <= 0) {
      return res.json({
        success: false,
        message: 'Key đã hết hạn',
        data: {
          ...keyData,
          days_remaining: 0
        }
      });
    }

    // Get associated VPN accounts through account_keys relationship (always check)
    const accountsQuery = `
      SELECT 
        va.id,
        va.username,
        va.password,
        va.expires_at,
        TIMESTAMPDIFF(SECOND, NOW(), va.expires_at) as seconds_remaining
      FROM vpn_accounts va
      INNER JOIN account_keys ak ON va.id = ak.account_id
      WHERE ak.key_id = ? AND ak.is_active = 1 AND va.is_active = 1
      ORDER BY va.created_at DESC
    `;

    const accountsResult = await executeQuery(accountsQuery, [keyData.id]);
    let accounts = [];
    if (accountsResult.success) {
      accounts = accountsResult.data;
      // Nếu có accounts được gán nhưng status key vẫn là 'chờ', cập nhật status
      if (accounts.length > 0 && keyData.status === 'chờ') {
        keyData.status = 'đang hoạt động';
        // Update key status in database
        await executeQuery('UPDATE vpn_keys SET status = ? WHERE id = ?', ['đang hoạt động', keyData.id]);
      }
    }

    res.json({
      success: true,
      message: 'Key hợp lệ',
      data: {
        ...keyData,
        accounts
      }
    });

  } catch (error) {
    console.error('Check key error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/public/use-gift
// @desc    Use gift code to extend key (public endpoint)
// @access  Public
router.post('/use-gift', [
  body('giftCode').trim().isLength({ min: 1 }).withMessage('Gift code is required'),
  body('keyCode').trim().isLength({ min: 3 }).withMessage('Key code is required')
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

    const { giftCode, keyCode } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

    // Use stored procedure to handle gift code usage
    const connection = await getConnection();

    try {
      const [_results] = await connection.execute(
        'CALL UseGiftCode(?, ?, ?, @result, @bonus_days)',
        [giftCode, keyCode, clientIp]
      );

      // Get the output parameters
      const [output] = await connection.execute('SELECT @result as result, @bonus_days as bonus_days');
      const { result: procedureResult, bonus_days } = output[0];

      connection.release();

      switch (procedureResult) {
        case 'SUCCESS':
          res.json({
            success: true,
            message: `Đã thêm ${bonus_days} ngày vào key của bạn!`,
            data: {
              bonusDays: bonus_days,
              keyCode
            }
          });
          break;

        case 'GIFT_NOT_FOUND':
          res.json({
            success: false,
            message: 'Gift code không tồn tại hoặc đã hết hạn'
          });
          break;

        case 'GIFT_USED_UP':
          res.json({
            success: false,
            message: 'Gift code đã được sử dụng hết'
          });
          break;

        case 'KEY_NOT_FOUND':
          res.json({
            success: false,
            message: 'Key không tồn tại'
          });
          break;

        default:
          res.json({
            success: false,
            message: 'Có lỗi xảy ra khi sử dụng gift code'
          });
      }

    } catch (error) {
      connection.release();
      throw error;
    }

  } catch (error) {
    console.error('Use gift error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/public/auto-assign-key
// @desc    Auto assign key to available VPN account (public endpoint)
// @access  Public
router.post('/auto-assign-key', [
  body('keyCode').trim().isLength({ min: 3 }).withMessage('Key code is required')
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

    const { keyCode } = req.body;

    // Check if key exists and is available for assignment
    const keyQuery = `
      SELECT 
        vk.id,
        vk.code,
        vk.status,
        vk.key_type,
        vk.days_valid,
        vk.expires_at,
        kg.code as group_code
      FROM vpn_keys vk
      JOIN key_groups kg ON vk.group_id = kg.id
      WHERE vk.code = ? AND vk.status = 'chờ'
    `;

    const keyResult = await executeQuery(keyQuery, [keyCode]);

    if (!keyResult.success || keyResult.data.length === 0) {
      return res.json({
        success: false,
        message: 'Key không tồn tại hoặc đã được gán'
      });
    }

    const keyData = keyResult.data[0];

    // Check if key is already assigned (double check before finding accounts)
    const existingAssignmentCheck = `
      SELECT ak.id, ak.account_id, va.username 
      FROM account_keys ak
      JOIN vpn_accounts va ON ak.account_id = va.id
      WHERE ak.key_id = ? AND ak.is_active = 1
    `;

    const existingCheckResult = await executeQuery(existingAssignmentCheck, [keyData.id]);

    if (existingCheckResult.success && existingCheckResult.data.length > 0) {
      return res.json({
        success: false,
        message: `Key đã được gán vào tài khoản: ${existingCheckResult.data[0].username}`
      });
    }

    // Check if key is expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.json({
        success: false,
        message: 'Key đã hết hạn'
      });
    }

    // Find available VPN accounts with empty slots matching the key type
    let availableAccountsQuery = '';
    
    if (keyData.key_type === '1key') {
      // 1key chỉ gán vào tài khoản hoàn toàn trống (không có key nào)
      availableAccountsQuery = `
        SELECT va.id, va.username, va.password, va.expires_at
        FROM vpn_accounts va
        LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
        WHERE va.is_active = 1 
          AND va.expires_at > NOW()
          AND ak.id IS NULL
        LIMIT 1
      `;
    } else if (keyData.key_type === '2key') {
      // 2key chỉ gán vào:
      // - Tài khoản trống (0 key)
      // - Tài khoản đã có 1 key loại 2key (cùng loại)
      availableAccountsQuery = `
        SELECT va.id, va.username, va.password, va.expires_at,
               COUNT(ak.id) as assigned_keys,
               GROUP_CONCAT(DISTINCT vk.key_type) as existing_key_types
        FROM vpn_accounts va
        LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
        LEFT JOIN vpn_keys vk ON ak.key_id = vk.id
        WHERE va.is_active = 1 AND va.expires_at > NOW()
        GROUP BY va.id, va.username, va.password, va.expires_at
        HAVING (assigned_keys = 0) 
           OR (assigned_keys = 1 AND existing_key_types = '2key')
        LIMIT 1
      `;
    } else if (keyData.key_type === '3key') {
      // 3key chỉ gán vào:
      // - Tài khoản trống (0 key)
      // - Tài khoản đã có 1-2 key loại 3key (cùng loại)
      availableAccountsQuery = `
        SELECT va.id, va.username, va.password, va.expires_at,
               COUNT(ak.id) as assigned_keys,
               GROUP_CONCAT(DISTINCT vk.key_type) as existing_key_types
        FROM vpn_accounts va
        LEFT JOIN account_keys ak ON va.id = ak.account_id AND ak.is_active = 1
        LEFT JOIN vpn_keys vk ON ak.key_id = vk.id
        WHERE va.is_active = 1 AND va.expires_at > NOW()
        GROUP BY va.id, va.username, va.password, va.expires_at
        HAVING (assigned_keys = 0) 
           OR (assigned_keys < 3 AND existing_key_types = '3key')
        LIMIT 1
      `;
    }

    const accountResult = await executeQuery(availableAccountsQuery);

    if (!accountResult.success || accountResult.data.length === 0) {
      return res.json({
        success: false,
        message: `Không có tài khoản VPN trống phù hợp với key loại ${keyData.key_type}`
      });
    }

    const targetAccount = accountResult.data[0];

    // Assign key to account
    const assignQuery = `
      INSERT INTO account_keys (account_id, key_id, is_active, assigned_at)
      VALUES (?, ?, 1, NOW())
    `;

    const assignResult = await executeQuery(assignQuery, [targetAccount.id, keyData.id]);

    if (!assignResult.success) {
      console.error('Failed to assign key to account:', assignResult.error);
      return res.status(500).json({
        success: false,
        message: 'Không thể gán key vào tài khoản'
      });
    }

    // Update key status to active
    const updateKeyQuery = `
      UPDATE vpn_keys 
      SET status = 'đang hoạt động', updated_at = NOW()
      WHERE id = ?
    `;

    await executeQuery(updateKeyQuery, [keyData.id]);

    // Log the assignment in history
    const historyQuery = `
      INSERT INTO key_usage_history (key_id, account_id, action, notes)
      VALUES (?, ?, 'activated', 'Key auto-assigned to existing account')
    `;

    await executeQuery(historyQuery, [keyData.id, targetAccount.id]);

    res.json({
      success: true,
      message: 'Key đã được gán thành công!',
      data: {
        keyCode,
        keyType: keyData.key_type,
        account: {
          username: targetAccount.username,
          password: targetAccount.password,
          expires_at: targetAccount.expires_at
        }
      }
    });

  } catch (error) {
    console.error('Auto assign key error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/public/activate-key
// @desc    Activate key and create VPN account (public endpoint)
// @access  Public
router.post('/activate-key', [
  body('keyCode').trim().isLength({ min: 3 }).withMessage('Key code is required')
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

    const { keyCode } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

    // Check if key exists and is available for activation
    const keyQuery = `
      SELECT 
        vk.id,
        vk.code,
        vk.status,
        vk.days_valid,
        vk.key_type,
        vk.account_count,
        vk.expires_at,
        kg.code as group_code,
        kg.name as group_name
      FROM vpn_keys vk
      JOIN key_groups kg ON vk.group_id = kg.id
      WHERE vk.code = ? AND vk.status = 'chờ'
    `;

    const keyResult = await executeQuery(keyQuery, [keyCode]);

    if (!keyResult.success || keyResult.data.length === 0) {
      return res.json({
        success: false,
        message: 'Key không tồn tại hoặc đã được kích hoạt'
      });
    }

    const keyData = keyResult.data[0];

    // Check if key is expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.json({
        success: false,
        message: 'Key đã hết hạn'
      });
    }

    // Generate VPN account credentials
    const username = `vpn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const password = Math.random().toString(36).substring(2, 12);
    const accountExpires = new Date();
    accountExpires.setDate(accountExpires.getDate() + keyData.days_valid);

    // Create VPN account
    const createAccountQuery = `
      INSERT INTO vpn_accounts (username, password, key_id, expires_at, is_active)
      VALUES (?, ?, ?, ?, 1)
    `;

    const accountResult = await executeQuery(createAccountQuery, [
      username,
      password,
      keyData.id,
      accountExpires
    ]);

    if (!accountResult.success) {
      console.error('Failed to create VPN account:', accountResult.error);
      return res.status(500).json({
        success: false,
        message: 'Không thể tạo tài khoản VPN'
      });
    }

    // Update key status to active
    const updateKeyQuery = `
      UPDATE vpn_keys 
      SET status = 'đang hoạt động', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const updateResult = await executeQuery(updateKeyQuery, [keyData.id]);

    if (!updateResult.success) {
      console.error('Failed to update key status:', updateResult.error);
      // Note: Account was created but key status wasn't updated
      // This is not critical as the account is still functional
    }

    // Log the activation in history
    const historyQuery = `
      INSERT INTO key_usage_history (key_id, account_id, action, ip_address, notes)
      VALUES (?, ?, 'activated', ?, 'Key activated and account created automatically')
    `;

    await executeQuery(historyQuery, [keyData.id, accountResult.insertId, clientIp]);

    res.json({
      success: true,
      message: 'Tài khoản VPN đã được tạo thành công!',
      data: {
        username,
        password,
        expires_at: accountExpires,
        keyCode
      }
    });

  } catch (error) {
    console.error('Activate key error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/public/statistics
// @desc    Get public statistics
// @access  Public
router.get('/statistics', async (req, res) => {
  try {
    // Get basic public statistics
    const query = `
      SELECT 
        (SELECT COUNT(*) FROM vpn_keys WHERE status = 'active') as active_keys,
        (SELECT COUNT(*) FROM vpn_accounts WHERE is_active = 1) as active_accounts,
        (SELECT COUNT(*) FROM vpn_keys WHERE DATE(expires_at) = CURDATE()) as keys_expiring_today,
        (SELECT COUNT(*) FROM vpn_keys WHERE created_at >= CURDATE()) as keys_created_today
    `;

    const result = await executeQuery(query);

    res.json({
      success: true,
      data: {
        activeKeys: result[0].active_keys,
        activeAccounts: result[0].active_accounts,
        keysExpiringToday: result[0].keys_expiring_today,
        keysCreatedToday: result[0].keys_created_today
      }
    });

  } catch (error) {
    console.error('Get public statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
