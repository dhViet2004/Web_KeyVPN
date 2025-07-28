const express = require('express');
const { executeQuery, getConnection } = require('../config/database');
const { authenticateToken } = require('./auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// @route   GET /api/statistics/dashboard
// @desc    Get dashboard statistics
// @access  Private
router.get('/dashboard', async (req, res) => {
  try {
    // Use stored procedure to get dashboard stats
    const connection = await getConnection();

    try {
      const [_results] = await connection.execute(
        'CALL GetDashboardStats(@total_keys, @active_keys, @expired_keys, @total_accounts, @active_accounts, @expired_accounts, @today_keys, @today_accounts)'
      );

      // Get the output parameters
      const [output] = await connection.execute(`
        SELECT 
          @total_keys as total_keys,
          @active_keys as active_keys,
          @expired_keys as expired_keys,
          @total_accounts as total_accounts,
          @active_accounts as active_accounts,
          @expired_accounts as expired_accounts,
          @today_keys as today_keys_created,
          @today_accounts as today_accounts_created
      `);

      connection.release();

      res.json({
        success: true,
        data: output[0]
      });

    } catch (error) {
      connection.release();
      throw error;
    }

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
