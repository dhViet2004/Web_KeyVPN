const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { executeQuery } = require('../config/database');
const { authenticateToken } = require('./auth');
const { createBulkKeys, getKeysStats } = require('../utils/keyHelpers');
const { cleanupAccountKeys, cleanupKeyAssignments } = require('../utils/cleanupHelpers');

const router = express.Router();

// Apply authentication to all routes (temporary bypass for testing)
router.use(authenticateToken);

// @route   GET /api/keys/:group
// @desc    Get keys by group with pagination and search
// @access  Private
router.get('/:group', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  query('status').optional().isIn(['chờ', 'đang hoạt động', 'hết hạn']).withMessage('Invalid status')
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

    const { group } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const offset = (page - 1) * limit;

    // Build dynamic WHERE conditions
    let whereConditions = ['kg.code = ?'];
    let queryParams = [group];
    let countParams = [group];

    // Search filter
    if (search && search.trim() !== '') {
      whereConditions.push('(vk.code LIKE ? OR vk.customer_name LIKE ?)');
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern);
      countParams.push(searchPattern, searchPattern);
    }

    // Status filter
    if (status && status !== '') {
      whereConditions.push('vk.status = ?');
      queryParams.push(status);
      countParams.push(status);
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    // Main query with proper JOIN
    const keysQuery = `
      SELECT 
        vk.id,
        vk.code,
        vk.status,
        vk.days_valid,
        vk.key_type,
        vk.account_count,
        vk.customer_name,
        vk.customer_info,
        vk.created_at,
        vk.updated_at,
        vk.expires_at,
        kg.code as group_code,
        kg.name as group_name,
        CASE 
          WHEN vk.expires_at IS NULL THEN vk.days_valid
          WHEN vk.expires_at > NOW() THEN DATEDIFF(vk.expires_at, NOW())
          ELSE 0
        END as days_remaining,
        (SELECT COUNT(*) FROM vpn_accounts va WHERE va.key_id = vk.id) as linked_accounts
      FROM vpn_keys vk
      INNER JOIN key_groups kg ON vk.group_id = kg.id
      ${whereClause}
      ORDER BY vk.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM vpn_keys vk
      INNER JOIN key_groups kg ON vk.group_id = kg.id
      ${whereClause}
    `;

    // countParams chỉ chứa các tham số WHERE, không có limit/offset

    // Debug logging
    console.log('Keys Query:', keysQuery);
    console.log('Query Params:', queryParams);
    console.log('Count Params:', countParams);

    const [keysResult, countResult] = await Promise.all([
      executeQuery(keysQuery, queryParams),
      executeQuery(countQuery, countParams)
    ]);

    // Log dữ liệu thực tế trả về từ SQL và tham số truy vấn
    console.log('--- DEBUG KEYS API ---');
    console.log('Keys Query:', keysQuery);
    console.log('Query Params:', queryParams);
    console.log('Keys Query Result:', keysResult.data);
    console.log('----------------------');

    // Nếu truy vấn không thành công nhưng không phải lỗi nghiêm trọng, trả về mảng rỗng
    if (!keysResult.success || !countResult.success) {
      return res.json({
        success: true,
        data: {
          keys: [],
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

    // Đảm bảo mỗi key đều có trường group (lấy từ group_code)
    const keysWithGroup = keysResult.data.map(k => ({
      ...k,
      group: k.group_code
    }));
    res.json({
      success: true,
      data: {
        keys: keysWithGroup,
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
    console.error('Get keys error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/keys/create
// @desc    Create new keys (bulk)
// @access  Private
router.post('/create', [
  body('group').isIn(['FBX', 'THX', 'CTV', 'TEST']).withMessage('Invalid group'),
  body('count').isInt({ min: 1, max: 100 }).withMessage('Count must be between 1 and 100'),
  body('days').isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365'),
  body('type').isIn(['1key', '2key', '3key']).withMessage('Invalid key type'),
  body('accountCount').isInt({ min: 1, max: 10 }).withMessage('Account count must be between 1 and 10'),
  body('customer').optional().trim()
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

    const { group, count, days, type, accountCount, customer } = req.body;

    // Create bulk keys using helper
    const result = await createBulkKeys(
      group, 
      count, 
      days, 
      type, 
      accountCount, 
      customer || '', 
      req.user.id
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || 'Failed to create keys'
      });
    }

    res.json({
      success: true,
      message: `Successfully created ${count} keys`,
      data: result.data
    });

  } catch (error) {
    console.error('Create keys error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create keys'
    });
  }
});

// @route   PUT /api/keys/:id/status
// @desc    Update key status
// @access  Private
router.put('/:id/status', [
  body('status').isIn(['chờ', 'đang hoạt động', 'hết hạn']).withMessage('Invalid status')
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

    const { id } = req.params;
    const { status } = req.body;

    // Clean up account_keys assignments when setting key to inactive status
    let cleanupResult = null;
    if (status === 'hết hạn') {
      console.log(`🧹 Cleaning up assignments for key ${id} (setting to expired)...`);
      cleanupResult = await cleanupKeyAssignments(id);
      
      if (cleanupResult.success) {
        console.log(`✅ Cleaned up ${cleanupResult.affectedRows} assignments for key ${id}`);
      } else {
        console.warn(`⚠️ Cleanup failed for key ${id}:`, cleanupResult.error);
      }
    }

    const result = await executeQuery(
      'UPDATE vpn_keys SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update key status'
      });
    }

    if (result.data.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Key not found'
      });
    }

    const response = {
      success: true,
      message: 'Key status updated successfully'
    };

    // Add cleanup info if cleanup was performed
    if (cleanupResult) {
      response.cleanup = {
        assignmentsRemoved: cleanupResult.success ? cleanupResult.affectedRows : 0
      };
    }

    res.json(response);

  } catch (error) {
    console.error('Update key status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/keys/reset/:id
// @desc    Reset key to waiting status
// @access  Private
router.post('/reset/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Clean up account_keys assignments BEFORE resetting the key
    console.log(`🧹 Cleaning up assignments for key ${id} before reset...`);
    const cleanupResult = await cleanupKeyAssignments(id);
    
    if (cleanupResult.success) {
      console.log(`✅ Cleaned up ${cleanupResult.affectedRows} assignments for key ${id}`);
    } else {
      console.warn(`⚠️ Cleanup failed for key ${id}:`, cleanupResult.error);
      // Continue with reset even if cleanup fails
    }

    const result = await executeQuery(
      'UPDATE vpn_keys SET status = "chờ", updated_at = NOW() WHERE id = ?',
      [id]
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to reset key'
      });
    }

    if (result.data.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Key not found'
      });
    }

    res.json({
      success: true,
      message: 'Key reset successfully',
      cleanup: {
        assignmentsRemoved: cleanupResult.success ? cleanupResult.affectedRows : 0
      }
    });

  } catch (error) {
    console.error('Reset key error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/keys/:id
// @desc    Delete key (soft delete)
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('--- DEBUG DELETE KEY ---');
    console.log('Delete key id:', id);

    // Clean up account_keys assignments BEFORE deleting the key
    console.log(`🧹 Cleaning up assignments for key ${id} before deletion...`);
    const cleanupResult = await cleanupKeyAssignments(id);
    
    if (cleanupResult.success) {
      console.log(`✅ Cleaned up ${cleanupResult.affectedRows} assignments for key ${id}`);
    } else {
      console.warn(`⚠️ Cleanup failed for key ${id}:`, cleanupResult.error);
      // Continue with deletion even if cleanup fails
    }

    const result = await executeQuery(
      'DELETE FROM vpn_keys WHERE id = ?',
      [id]
    );

    if (!result.success) {
      console.error('Delete key SQL error:', result.error);
    }

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete key'
      });
    }

    if (result.data.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Key not found'
      });
    }

    // Run general cleanup after deletion to ensure data consistency
    console.log('🧹 Running general account_keys cleanup after key deletion...');
    const generalCleanup = await cleanupAccountKeys();
    if (generalCleanup.success) {
      console.log('✅ General cleanup completed after key deletion');
    } else {
      console.warn('⚠️ General cleanup failed after key deletion:', generalCleanup.error);
    }

    res.json({
      success: true,
      message: 'Key deleted successfully',
      cleanup: {
        assignmentsRemoved: cleanupResult.success ? cleanupResult.affectedRows : 0,
        generalCleanup: generalCleanup.success
      }
    });

  } catch (error) {
    console.error('Delete key error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/keys/stats/overview
// @desc    Get keys statistics overview
// @access  Private
router.get('/stats/overview', async (req, res) => {
  try {
    const result = await getKeysStats();

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
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/keys/stats/groups
// @desc    Get keys statistics by groups
// @access  Private
router.get('/stats/groups', async (req, res) => {
  try {
    const query = `
      SELECT 
        kg.code as group_code,
        kg.name as group_name,
        COUNT(CASE WHEN vk.status = 'chờ' THEN 1 END) as waiting_keys,
        COUNT(CASE WHEN vk.status = 'đang hoạt động' THEN 1 END) as active_keys,
        COUNT(CASE WHEN vk.status = 'hết hạn' THEN 1 END) as expired_keys,
        COUNT(vk.id) as total_keys
      FROM key_groups kg
      LEFT JOIN vpn_keys vk ON kg.id = vk.group_id AND vk.status != 'đã xóa'
      GROUP BY kg.id, kg.code, kg.name
      ORDER BY kg.code
    `;

    const result = await executeQuery(query);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get statistics'
      });
    }

    res.json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
