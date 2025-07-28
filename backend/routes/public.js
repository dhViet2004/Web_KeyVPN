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

    // Get associated VPN accounts if key is active
    let accounts = [];
    if (keyData.status === 'đang hoạt động') {
      const accountsQuery = `
        SELECT 
          va.id,
          va.username,
          va.password,
          va.expires_at,
          TIMESTAMPDIFF(SECOND, NOW(), va.expires_at) as seconds_remaining
        FROM vpn_accounts va
        WHERE va.key_id = ? AND va.is_active = 1
        ORDER BY va.created_at DESC
      `;

      const accountsResult = await executeQuery(accountsQuery, [keyData.id]);
      if (accountsResult.success) {
        accounts = accountsResult.data;
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

    // Use stored procedure to activate key and create account
    const connection = await getConnection();

    try {
      const [_results] = await connection.execute(
        'CALL ActivateKeyAndCreateAccount(?, ?, @result, @username, @password, @expires_at)',
        [keyCode, clientIp]
      );

      // Get the output parameters
      const [output] = await connection.execute(
        'SELECT @result as result, @username as username, @password as password, @expires_at as expires_at'
      );
      const { result: procedureResult, username, password, expires_at } = output[0];

      connection.release();

      switch (procedureResult) {
        case 'SUCCESS':
          res.json({
            success: true,
            message: 'Tài khoản VPN đã được tạo thành công!',
            data: {
              username,
              password,
              expires_at,
              keyCode
            }
          });
          break;

        case 'KEY_NOT_FOUND':
          res.json({
            success: false,
            message: 'Key không tồn tại'
          });
          break;

        case 'KEY_EXPIRED':
          res.json({
            success: false,
            message: 'Key đã hết hạn'
          });
          break;

        case 'ACCOUNT_LIMIT_REACHED':
          res.json({
            success: false,
            message: 'Key đã đạt giới hạn số tài khoản'
          });
          break;

        default:
          res.json({
            success: false,
            message: 'Có lỗi xảy ra khi kích hoạt key'
          });
      }

    } catch (error) {
      connection.release();
      throw error;
    }

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
