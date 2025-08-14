const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { authenticateToken } = require('./auth');

const router = express.Router();

// Helper function to get auto assignment service
const getAutoAssignmentService = () => {
  try {
    console.log('Loading auto assignment service...');
    const service = require('../services/autoAssignmentService');
    console.log('Service loaded:', typeof service);
    console.log('Service methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(service)));
    console.log('Has getStatus:', typeof service.getStatus);
    return service;
  } catch (error) {
    console.error('Error loading auto assignment service:', error);
    throw new Error('Auto assignment service not available');
  }
};

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

    // Get notification enabled status from system_settings
    const enabledQuery = `
      SELECT setting_value 
      FROM system_settings 
      WHERE setting_key = 'notification_enabled'
    `;
    
    const enabledResult = await executeQuery(enabledQuery);
    const notificationEnabled = enabledResult.success && enabledResult.data.length > 0 
      ? enabledResult.data[0].setting_value === 'true' 
      : true; // default to true

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

    const notification = result.data[0];
    
    res.json({
      success: true,
      data: notification ? {
        ...notification,
        enabled: notificationEnabled
      } : {
        enabled: notificationEnabled,
        title: 'THÔNG BÁO HỆ THỐNG',
        content: 'Chào mừng bạn đến với KeyVPN Tool!',
        position: 'before',
        display_count: 1,
        has_link: false,
        link_url: '',
        link_text: 'Xem thêm'
      }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/settings/notifications/enabled
// @desc    Update notification enabled status
// @access  Private
router.put('/notifications/enabled', [
  body('enabled').isBoolean().withMessage('Enabled must be boolean')
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

    const { enabled } = req.body;

    const upsertQuery = `
      INSERT INTO system_settings (setting_key, setting_value, setting_type, updated_by) 
      VALUES ('notification_enabled', ?, 'boolean', ?)
      ON DUPLICATE KEY UPDATE 
      setting_value = VALUES(setting_value),
      updated_by = VALUES(updated_by),
      updated_at = CURRENT_TIMESTAMP
    `;

    const result = await executeQuery(upsertQuery, [enabled.toString(), req.user?.id || 1]);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update notification enabled status'
      });
    }

    res.json({
      success: true,
      message: 'Notification enabled status updated successfully'
    });

  } catch (error) {
    console.error('Update notification enabled error:', error);
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

// @route   GET /api/settings/auto-assignment
// @desc    Get auto assignment settings
// @access  Private
router.get('/auto-assignment', async (req, res) => {
  try {
    const query = `
      SELECT setting_key, setting_value 
      FROM system_settings 
      WHERE setting_key IN ('auto_assignment_enabled', 'auto_assignment_before_expiry', 'auto_assignment_check_interval')
    `;

    const result = await executeQuery(query);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get auto assignment settings'
      });
    }

    // Convert to object
    const settings = {
      enabled: false,
      beforeExpiry: 300, // minutes
      checkInterval: 30,
      deleteExpiredAccounts: true
    };

    // If no settings found, create default ones
    if (!result.data || result.data.length === 0) {
      console.log('No auto assignment settings found, creating defaults...');
      
      const defaultSettings = [
        { key: 'auto_assignment_enabled', value: 'false', type: 'boolean' },
        { key: 'auto_assignment_before_expiry', value: '300', type: 'number' },
        { key: 'auto_assignment_check_interval', value: '30', type: 'number' },
        { key: 'auto_assignment_delete_expired', value: 'true', type: 'boolean' }
      ];
      
      for (const setting of defaultSettings) {
        await executeQuery(`
          INSERT INTO system_settings (setting_key, setting_value, setting_type, updated_by, created_at, updated_at) 
          VALUES (?, ?, ?, 1, NOW(), NOW())
        `, [setting.key, setting.value, setting.type]);
      }
      
      console.log('Default auto assignment settings created');
    } else {
      // Parse existing settings
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

    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    console.error('Get auto assignment settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/settings/auto-assignment
// @desc    Update auto assignment settings
// @access  Private
router.put('/auto-assignment', [
  body('enabled').optional().isBoolean().withMessage('Enabled must be boolean'),
  body('beforeExpiry').optional().isInt({ min: 1, max: 1440 }).withMessage('Before expiry must be between 1-1440 minutes'),
  body('checkInterval').optional().isInt({ min: 1, max: 360 }).withMessage('Check interval must be between 1-360 minutes'),
  body('deleteExpiredAccounts').optional().isBoolean().withMessage('Delete expired accounts must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { enabled, beforeExpiry, checkInterval, deleteExpiredAccounts } = req.body;
    console.log('Update auto assignment request body:', { enabled, beforeExpiry, checkInterval, deleteExpiredAccounts });
    console.log('Request body type checks:', {
      enabled: typeof enabled,
      beforeExpiry: typeof beforeExpiry,
      checkInterval: typeof checkInterval,
      deleteExpiredAccounts: typeof deleteExpiredAccounts
    });

    // Get current settings first
    const currentQuery = `
      SELECT setting_key, setting_value 
      FROM system_settings 
      WHERE setting_key IN ('auto_assignment_enabled', 'auto_assignment_before_expiry', 'auto_assignment_check_interval', 'auto_assignment_delete_expired')
    `;

    const currentResult = await executeQuery(currentQuery);
    
    const currentSettings = {
      enabled: false,
      beforeExpiry: 300,
      checkInterval: 30,
      deleteExpiredAccounts: true
    };

    if (currentResult.success) {
      currentResult.data.forEach(row => {
        switch (row.setting_key) {
          case 'auto_assignment_enabled':
            currentSettings.enabled = row.setting_value === 'true';
            break;
          case 'auto_assignment_before_expiry':
            currentSettings.beforeExpiry = parseInt(row.setting_value) || 300;
            break;
          case 'auto_assignment_check_interval':
            currentSettings.checkInterval = parseInt(row.setting_value) || 30;
            break;
          case 'auto_assignment_delete_expired':
            currentSettings.deleteExpiredAccounts = row.setting_value === 'true';
            break;
        }
      });
    }

    // Merge with new values
    const finalSettings = {
      enabled: enabled !== undefined ? enabled : currentSettings.enabled,
      beforeExpiry: beforeExpiry !== undefined ? beforeExpiry : currentSettings.beforeExpiry,
      checkInterval: checkInterval !== undefined ? checkInterval : currentSettings.checkInterval,
      deleteExpiredAccounts: deleteExpiredAccounts !== undefined ? deleteExpiredAccounts : currentSettings.deleteExpiredAccounts
    };

    console.log('Final settings to save:', finalSettings);

    // Update or insert settings
    const settings = [
      { key: 'auto_assignment_enabled', value: finalSettings.enabled.toString(), type: 'boolean' },
      { key: 'auto_assignment_before_expiry', value: finalSettings.beforeExpiry.toString(), type: 'number' },
      { key: 'auto_assignment_check_interval', value: finalSettings.checkInterval.toString(), type: 'number' },
      { key: 'auto_assignment_delete_expired', value: finalSettings.deleteExpiredAccounts.toString(), type: 'boolean' }
    ];

    for (const setting of settings) {
      const upsertQuery = `
        INSERT INTO system_settings (setting_key, setting_value, setting_type, updated_by) 
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
        setting_value = VALUES(setting_value),
        setting_type = VALUES(setting_type),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP
      `;

      const result = await executeQuery(upsertQuery, [
        setting.key,
        setting.value,
        setting.type,
        req.user?.id || 1
      ]);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: `Failed to update ${setting.key}`
        });
      }
    }

    // Restart auto assignment service with new settings
    if (finalSettings.enabled) {
      const autoAssignmentService = getAutoAssignmentService();
      autoAssignmentService.stop();
      setTimeout(() => {
        autoAssignmentService.start();
      }, 1000);
    } else {
      const autoAssignmentService = getAutoAssignmentService();
      autoAssignmentService.stop();
    }

    res.json({
      success: true,
      message: 'Auto assignment settings updated successfully'
    });

  } catch (error) {
    console.error('Update auto assignment settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/settings/auto-assignment/status
// @desc    Get auto assignment service status
// @access  Private
router.get('/auto-assignment/status', async (req, res) => {
  try {
    const autoAssignmentService = getAutoAssignmentService();
    const status = autoAssignmentService.getStatus();
    const settings = await autoAssignmentService.getSettings();
    
    res.json({
      success: true,
      data: {
        ...status,
        settings
      }
    });
  } catch (error) {
    console.error('Get auto assignment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/settings/auto-assignment/start
// @desc    Start auto assignment service manually
// @access  Private
router.post('/auto-assignment/start', async (req, res) => {
  try {
    const autoAssignmentService = getAutoAssignmentService();
    await autoAssignmentService.start();
    
    res.json({
      success: true,
      message: 'Auto assignment service started'
    });
  } catch (error) {
    console.error('Start auto assignment service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start auto assignment service'
    });
  }
});

// @route   POST /api/settings/auto-assignment/stop
// @desc    Stop auto assignment service manually
// @access  Private
router.post('/auto-assignment/stop', async (req, res) => {
  try {
    const autoAssignmentService = getAutoAssignmentService();
    autoAssignmentService.stop();
    
    res.json({
      success: true,
      message: 'Auto assignment service stopped'
    });
  } catch (error) {
    console.error('Stop auto assignment service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop auto assignment service'
    });
  }
});

// @route   POST /api/settings/auto-assignment/run-now
// @desc    Trigger auto assignment process immediately
// @access  Private
router.post('/auto-assignment/run-now', async (req, res) => {
  try {
    const autoAssignmentService = getAutoAssignmentService();
    const settings = await autoAssignmentService.getSettings();
    
    if (!settings.enabled) {
      return res.status(400).json({
        success: false,
        message: 'Auto assignment is disabled'
      });
    }

    // Run the process in background
    setTimeout(async () => {
      await autoAssignmentService.processExpiredAccounts(settings);
    }, 100);
    
    res.json({
      success: true,
      message: 'Auto assignment process started'
    });
  } catch (error) {
    console.error('Run auto assignment now error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run auto assignment'
    });
  }
});

// @route   POST /api/settings/auto-assignment/cleanup
// @desc    Manually cleanup expired accounts
// @access  Private
router.post('/auto-assignment/cleanup', async (req, res) => {
  try {
    const autoAssignmentService = getAutoAssignmentService();
    
    // Get current settings
    const settings = await autoAssignmentService.getSettings();
    
    console.log('Manual cleanup requested - current settings:', settings);

    if (!settings.deleteExpiredAccounts) {
      return res.json({
        success: false,
        message: 'Account deletion is disabled in settings'
      });
    }

    // Run cleanup in background
    setTimeout(async () => {
      await autoAssignmentService.forceCleanupNow();
    }, 100);
    
    res.json({
      success: true,
      message: 'Cleanup process started - check server logs for results'
    });
  } catch (error) {
    console.error('Manual cleanup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run cleanup process'
    });
  }
});

module.exports = router;
