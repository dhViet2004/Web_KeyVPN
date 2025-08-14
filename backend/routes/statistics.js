const express = require('express');
const { executeQuery } = require('../config/database');
const { authenticateToken } = require('./auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// @route   GET /api/statistics/dashboard
// @desc    Get dashboard statistics
// @access  Private
router.get('/dashboard', async (req, res) => {
  try {
    // Truy vấn tổng hợp trực tiếp thay vì gọi procedure
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM vpn_keys) AS total_keys,
        (SELECT COUNT(*) FROM vpn_keys WHERE status = 'đang hoạt động') AS active_keys,
        (SELECT COUNT(*) FROM vpn_keys WHERE status = 'hết hạn') AS expired_keys,
        (SELECT COUNT(*) FROM vpn_accounts) AS total_accounts,
        (SELECT COUNT(*) FROM vpn_accounts WHERE is_active = 1) AS active_accounts,
        (SELECT COUNT(*) FROM vpn_accounts WHERE is_active = 0) AS expired_accounts,
        (SELECT COUNT(*) FROM vpn_keys WHERE DATE(created_at) = CURDATE()) AS today_keys_created,
        (SELECT COUNT(*) FROM vpn_accounts WHERE DATE(created_at) = CURDATE()) AS today_accounts_created
    `;
    const result = await executeQuery(statsQuery);
    if (!result.success || !result.data || !result.data.length) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get dashboard stats'
      });
    }
    res.json({
      success: true,
      data: result.data[0]
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/statistics
// @desc    Get statistics by date range
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Default to last 30 days if no dates provided
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const query = `
      SELECT 
        stat_date,
        keys_created,
        keys_used,
        accounts_created,
        accounts_expired,
        gift_codes_used,
        unique_visitors,
        admin_logins
      FROM statistics
      WHERE stat_date BETWEEN ? AND ?
      ORDER BY stat_date DESC
    `;

    const result = await executeQuery(query, [start, end]);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get statistics'
      });
    }

    // Calculate totals
    const totals = result.data.reduce((acc, row) => {
      acc.total_keys_created += row.keys_created;
      acc.total_keys_used += row.keys_used;
      acc.total_accounts_created += row.accounts_created;
      acc.total_accounts_expired += row.accounts_expired;
      acc.total_gift_codes_used += row.gift_codes_used;
      acc.total_unique_visitors += row.unique_visitors;
      acc.total_admin_logins += row.admin_logins;
      return acc;
    }, {
      total_keys_created: 0,
      total_keys_used: 0,
      total_accounts_created: 0,
      total_accounts_expired: 0,
      total_gift_codes_used: 0,
      total_unique_visitors: 0,
      total_admin_logins: 0
    });

    res.json({
      success: true,
      data: {
        statistics: result.data,
        totals,
        date_range: {
          start,
          end
        }
      }
    });

  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/statistics/update
// @desc    Update daily statistics (internal use)
// @access  Private
router.post('/update', async (req, res) => {
  try {
    const {
      keys_created = 0,
      keys_used = 0,
      accounts_created = 0,
      accounts_expired = 0,
      gift_codes_used = 0,
      unique_visitors = 0,
      admin_logins = 0
    } = req.body;

    const query = `
      INSERT INTO statistics (stat_date, keys_created, keys_used, accounts_created, accounts_expired, gift_codes_used, unique_visitors, admin_logins)
      VALUES (CURDATE(), ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        keys_created = keys_created + VALUES(keys_created),
        keys_used = keys_used + VALUES(keys_used),
        accounts_created = accounts_created + VALUES(accounts_created),
        accounts_expired = accounts_expired + VALUES(accounts_expired),
        gift_codes_used = gift_codes_used + VALUES(gift_codes_used),
        unique_visitors = VALUES(unique_visitors),
        admin_logins = admin_logins + VALUES(admin_logins),
        updated_at = NOW()
    `;

    const result = await executeQuery(query, [
      keys_created,
      keys_used,
      accounts_created,
      accounts_expired,
      gift_codes_used,
      unique_visitors,
      admin_logins
    ]);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update statistics'
      });
    }

    res.json({
      success: true,
      message: 'Statistics updated successfully'
    });

  } catch (error) {
    console.error('Update statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
