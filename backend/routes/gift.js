const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { authenticateToken } = require('./auth');

const router = express.Router();

// @route   POST /api/gift/validate
// @desc    Validate gift code (public)
// @access  Public
router.post('/validate', [
  body('code').trim().isLength({ min: 1 }).withMessage('Gift code is required')
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

    const { code } = req.body;

    const query = `
      SELECT 
        gc.id,
        gc.code,
        gc.bonus_days,
        gc.max_uses,
        gc.current_uses,
        gc.is_active,
        gc.expires_at,
        (gc.max_uses - gc.current_uses) as remaining_uses
      FROM gift_codes gc
      WHERE gc.code = ? 
      AND gc.is_active = 1 
      AND (gc.expires_at IS NULL OR gc.expires_at > NOW())
      AND gc.current_uses < gc.max_uses
    `;

    const result = await executeQuery(query, [code]);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Database query failed'
      });
    }

    if (result.data.length === 0) {
      return res.json({
        success: false,
        message: 'Gift code không hợp lệ hoặc đã hết hạn'
      });
    }

    res.json({
      success: true,
      message: 'Gift code hợp lệ',
      data: result.data[0]
    });

  } catch (error) {
    console.error('Validate gift error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/gift/apply
// @desc    Apply gift code to add time to key (public)
// @access  Public
router.post('/apply', [
  body('code').trim().isLength({ min: 1 }).withMessage('Gift code is required'),
  body('key_code').trim().isLength({ min: 1 }).withMessage('Key code is required')
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

    const { code, key_code } = req.body;

    // Validate gift code
    const giftQuery = `
      SELECT 
        gc.id,
        gc.code,
        gc.bonus_days,
        gc.max_uses,
        gc.current_uses,
        gc.is_active,
        gc.expires_at
      FROM gift_codes gc
      WHERE gc.code = ? 
      AND gc.is_active = 1 
      AND (gc.expires_at IS NULL OR gc.expires_at > NOW())
      AND gc.current_uses < gc.max_uses
    `;

    const giftResult = await executeQuery(giftQuery, [code]);

    if (!giftResult.success || giftResult.data.length === 0) {
      return res.json({
        success: false,
        message: 'Gift code không hợp lệ hoặc đã hết lượt sử dụng'
      });
    }

    const giftData = giftResult.data[0];

    // Find the key
    const keyQuery = `
      SELECT id, code, expires_at, status 
      FROM vpn_keys 
      WHERE code = ? AND status != 'hết hạn'
    `;

    const keyResult = await executeQuery(keyQuery, [key_code]);

    if (!keyResult.success || keyResult.data.length === 0) {
      return res.json({
        success: false,
        message: 'Key code không tồn tại hoặc đã hết hạn'
      });
    }

    const keyData = keyResult.data[0];

    // Update key expiration time by adding bonus days
    const updateKeyQuery = `
      UPDATE vpn_keys 
      SET expires_at = DATE_ADD(COALESCE(expires_at, NOW()), INTERVAL ? DAY),
          status = 'đang hoạt động'
      WHERE id = ?
    `;

    const updateKeyResult = await executeQuery(updateKeyQuery, [giftData.bonus_days, keyData.id]);

    if (!updateKeyResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Không thể cập nhật thời gian key'
      });
    }

    // Update gift code usage count
    const updateGiftQuery = `
      UPDATE gift_codes 
      SET current_uses = current_uses + 1 
      WHERE id = ?
    `;

    await executeQuery(updateGiftQuery, [giftData.id]);

    // Record gift usage history
    const historyQuery = `
      INSERT INTO gift_usage_history (gift_code_id, key_id, ip_address, bonus_applied) 
      VALUES (?, ?, ?, ?)
    `;

    await executeQuery(historyQuery, [
      giftData.id, 
      keyData.id, 
      req.ip || req.connection.remoteAddress,
      giftData.bonus_days
    ]);

    res.json({
      success: true,
      message: `Đã cộng thêm ${giftData.bonus_days} ngày cho key ${key_code}`,
      data: {
        key_code: key_code,
        bonus_days: giftData.bonus_days,
        remaining_uses: giftData.max_uses - giftData.current_uses - 1
      }
    });

  } catch (error) {
    console.error('Apply gift error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/gift
// @desc    Get all gift codes (admin)
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT 
        gc.id,
        gc.code,
        gc.bonus_days,
        gc.max_uses,
        gc.current_uses,
        gc.is_active,
        gc.expires_at,
        gc.created_at,
        (gc.max_uses - gc.current_uses) as remaining_uses,
        COUNT(guh.id) as total_used
      FROM gift_codes gc
      LEFT JOIN gift_usage_history guh ON gc.id = guh.gift_code_id
      GROUP BY gc.id
      ORDER BY gc.created_at DESC
    `;

    const result = await executeQuery(query);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get gift codes'
      });
    }

    res.json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('Get gift codes error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/gift/create
// @desc    Create new gift code (admin)
// @access  Private
router.post('/create', [
  authenticateToken,
  body('code').trim().isLength({ min: 1 }).withMessage('Gift code is required'),
  body('bonus_days').toInt().isInt({ min: 1 }).withMessage('Bonus days must be a positive integer'),
  body('max_uses').toInt().isInt({ min: 1 }).withMessage('Max uses must be a positive integer')
  // expires_at không cần validate vì có thể null
], async (req, res) => {
  try {
    console.log('Backend received data:', req.body);
    console.log('Data types:', {
      code: typeof req.body.code,
      bonus_days: typeof req.body.bonus_days,
      max_uses: typeof req.body.max_uses,
      expires_at: typeof req.body.expires_at
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
        details: errors.array().map(err => `${err.param}: ${err.msg}`).join(', ')
      });
    }

    const { code, bonus_days, max_uses, expires_at } = req.body;

    // Check if code already exists
    const existingResult = await executeQuery(
      'SELECT id FROM gift_codes WHERE code = ?',
      [code]
    );

    if (existingResult.success && existingResult.data.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Gift code already exists'
      });
    }

    // Create gift code
    const result = await executeQuery(
      'INSERT INTO gift_codes (code, bonus_days, max_uses, expires_at, created_by) VALUES (?, ?, ?, ?, ?)',
      [code, bonus_days, max_uses, expires_at || null, req.user.id]
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create gift code'
      });
    }

    res.json({
      success: true,
      message: 'Gift code created successfully',
      data: {
        id: result.data.insertId,
        code,
        bonus_days,
        max_uses
      }
    });

  } catch (error) {
    console.error('Create gift code error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/gift/settings
// @desc    Get gift key settings
// @access  Private (Admin only)
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT setting_key, setting_value, setting_type
      FROM system_settings 
      WHERE setting_key LIKE 'gift_%'
    `;

    const result = await executeQuery(query);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get gift settings'
      });
    }

    // Transform to object format with defaults
    const defaultSettings = {
      gift_default_expiration: 30,
      gift_allow_multiple_use: false,
      gift_max_uses: 1
    };

    const settings = { ...defaultSettings };
    
    result.data.forEach(setting => {
      let value = setting.setting_value;
      
      // Parse value based on type
      switch (setting.setting_type) {
        case 'number':
          value = parseInt(value);
          break;
        case 'boolean':
          value = value === 'true';
          break;
        case 'json':
          try {
            value = JSON.parse(value);
          } catch {
            value = setting.setting_value;
          }
          break;
        default:
          value = setting.setting_value;
      }

      settings[setting.setting_key] = value;
    });

    res.json({
      success: true,
      data: {
        defaultExpiration: settings.gift_default_expiration,
        allowMultipleUse: settings.gift_allow_multiple_use,
        maxUses: settings.gift_max_uses
      }
    });

  } catch (error) {
    console.error('Get gift settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/gift/settings
// @desc    Update gift key settings
// @access  Private (Admin only)
router.put('/settings', [
  authenticateToken,
  body('defaultExpiration').optional().isInt({ min: 1, max: 365 }).withMessage('Default expiration must be 1-365 days'),
  body('allowMultipleUse').optional().isBoolean().withMessage('Allow multiple use must be boolean'),
  body('maxUses').optional().isInt({ min: 1, max: 100 }).withMessage('Max uses must be 1-100')
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

    const { defaultExpiration, allowMultipleUse, maxUses } = req.body;

    const updates = [];
    if (defaultExpiration !== undefined) {
      updates.push({
        key: 'gift_default_expiration',
        value: defaultExpiration.toString(),
        type: 'number'
      });
    }

    if (allowMultipleUse !== undefined) {
      updates.push({
        key: 'gift_allow_multiple_use',
        value: allowMultipleUse.toString(),
        type: 'boolean'
      });
    }

    if (maxUses !== undefined) {
      updates.push({
        key: 'gift_max_uses',
        value: maxUses.toString(),
        type: 'number'
      });
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid settings to update'
      });
    }

    // Update each setting
    for (const update of updates) {
      const result = await executeQuery(`
        INSERT INTO system_settings (setting_key, setting_value, setting_type, updated_by)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          setting_value = VALUES(setting_value),
          setting_type = VALUES(setting_type),
          updated_by = VALUES(updated_by),
          updated_at = NOW()
      `, [update.key, update.value, update.type, req.user.id]);

      if (!result.success) {
        throw new Error(`Failed to update ${update.key}`);
      }
    }

    res.json({
      success: true,
      message: 'Gift settings updated successfully'
    });

  } catch (error) {
    console.error('Update gift settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
