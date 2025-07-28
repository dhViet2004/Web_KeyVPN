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
  body('bonus_days').isInt({ min: 1 }).withMessage('Bonus days must be a positive integer'),
  body('max_uses').isInt({ min: 1 }).withMessage('Max uses must be a positive integer'),
  body('expires_at').optional().isISO8601().withMessage('Valid expiration date required')
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

module.exports = router;
