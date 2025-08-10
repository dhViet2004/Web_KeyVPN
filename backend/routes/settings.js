const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { authenticateToken } = require('./auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// @route   GET /api/settings
// @desc    Get all system settings
// @access  Private
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        setting_key,
        setting_value,
        setting_type,
        description,
        updated_at
      FROM system_settings
      ORDER BY setting_key
    `;

    const result = await executeQuery(query);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get settings'
      });
    }

    // Transform array to object for easier frontend consumption
    const settings = {};
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

      settings[setting.setting_key] = {
        value,
        type: setting.setting_type,
        description: setting.description,
        updated_at: setting.updated_at
      };
    });

    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/settings
// @desc    Update system setting
// @access  Private
router.put('/', [
  body('key').trim().isLength({ min: 1 }).withMessage('Setting key is required'),
  body('value').exists().withMessage('Setting value is required'),
  body('type').optional().isIn(['string', 'number', 'boolean', 'json']).withMessage('Invalid setting type')
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

    const { key, value, type = 'string', description } = req.body;

    // Convert value to string for storage
    let stringValue = value;
    if (type === 'json') {
      stringValue = JSON.stringify(value);
    } else if (type === 'boolean') {
      stringValue = value ? 'true' : 'false';
    } else {
      stringValue = String(value);
    }

    const result = await executeQuery(`
      INSERT INTO system_settings (setting_key, setting_value, setting_type, description, updated_by)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        setting_value = VALUES(setting_value),
        setting_type = VALUES(setting_type),
        description = VALUES(description),
        updated_by = VALUES(updated_by),
        updated_at = NOW()
    `, [key, stringValue, type, description || '', req.user.id]);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update setting'
      });
    }

    res.json({
      success: true,
      message: 'Setting updated successfully',
      data: {
        key,
        value,
        type
      }
    });

  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/settings/notifications
// @desc    Get active notifications
// @access  Public/Private
router.get('/notifications', async (req, res) => {
  try {
    const targetAudience = req.user ? 'admins' : 'users';

    const query = `
      SELECT 
        id,
        title,
        content,
        type,
        target_audience,
        display_count,
        has_link,
        link_url,
        link_text,
        position
      FROM notifications
      WHERE is_active = 1 
      AND (expires_at IS NULL OR expires_at > NOW())
      AND target_audience IN ('all', ?)
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await executeQuery(query, [targetAudience]);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get notifications'
      });
    }

    res.json({
      success: true,
      data: result.data[0] || null
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/settings/notifications
// @desc    Update notification
// @access  Private
router.put('/notifications', [
  body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
  body('content').trim().isLength({ min: 1 }).withMessage('Content is required'),
  body('type').optional().isIn(['info', 'warning', 'success', 'error']).withMessage('Invalid type'),
  body('target_audience').optional().isIn(['all', 'users', 'admins']).withMessage('Invalid target audience'),
  body('display_count').optional().isInt({ min: 1 }).withMessage('Display count must be positive'),
  body('has_link').optional().isBoolean().withMessage('Has link must be boolean'),
  body('position').optional().isIn(['before', 'after']).withMessage('Invalid position')
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

    const {
      title,
      content,
      type = 'info',
      target_audience = 'all',
      display_count = 1,
      has_link = false,
      link_url = '',
      link_text = '',
      position = 'before'
    } = req.body;

    // Kiểm tra xem có notification hiện có không
    const existingNotification = await executeQuery(`
      SELECT id FROM notifications 
      WHERE is_active = 1 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    let result;
    let notificationId;

    if (existingNotification.success && existingNotification.data.length > 0) {
      // UPDATE notification hiện có
      notificationId = existingNotification.data[0].id;
      result = await executeQuery(`
        UPDATE notifications 
        SET title = ?, 
            content = ?, 
            type = ?, 
            target_audience = ?, 
            display_count = ?, 
            has_link = ?, 
            link_url = ?, 
            link_text = ?, 
            position = ?,
            updated_at = NOW()
        WHERE id = ?
      `, [title, content, type, target_audience, display_count, has_link, 
          link_url || null, link_text || null, position, notificationId]);
    } else {
      // INSERT notification mới nếu chưa có
      result = await executeQuery(`
        INSERT INTO notifications (title, content, type, target_audience, display_count, has_link, link_url, link_text, position, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [title, content, type, target_audience, display_count, has_link, 
          link_url || null, link_text || null, position, req.user.id]);
      
      notificationId = result.data?.insertId;
    }

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update notification'
      });
    }

    res.json({
      success: true,
      message: 'Notification updated successfully',
      data: {
        id: notificationId,
        title,
        content,
        type
      }
    });

  } catch (error) {
    console.error('Update notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/settings/notifications/disable
// @desc    Disable all notifications
// @access  Private
router.put('/notifications/disable', async (req, res) => {
  try {
    // Deactivate all notifications
    const result = await executeQuery(
      'UPDATE notifications SET is_active = 0 WHERE is_active = 1'
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to disable notifications'
      });
    }

    res.json({
      success: true,
      message: 'All notifications disabled successfully'
    });

  } catch (error) {
    console.error('Disable notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
