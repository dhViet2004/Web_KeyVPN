const { executeQuery } = require('../config/database');

const getKeysStats = async () => {
  try {
    const query = `
      SELECT
        COUNT(*) as total_keys,
        COUNT(CASE WHEN status = 'đang hoạt động' THEN 1 END) as active_keys,
        COUNT(CASE WHEN status = 'hết hạn' THEN 1 END) as expired_keys,
        COUNT(CASE WHEN status = 'chờ' THEN 1 END) as waiting_keys
      FROM vpn_keys
      WHERE status != 'đã xóa'
    `;
    const result = await executeQuery(query);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Hàm tạo key random
function generateKeyCode(group) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${group}-${code}`;
}

// Hàm tạo nhiều key
const createBulkKeys = async (group, count, days, type, accountCount, customer, createdBy) => {
  try {
    // Lấy group_id từ bảng key_groups
    const groupResult = await executeQuery('SELECT id FROM key_groups WHERE code = ?', [group]);
    if (!groupResult.success || !groupResult.data.length) {
      return { success: false, error: 'Nhóm key không tồn tại' };
    }
    const groupId = groupResult.data[0].id;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const createdKeys = [];
    for (let i = 0; i < count; i++) {
      const code = generateKeyCode(group);
      const insertResult = await executeQuery(
        `INSERT INTO vpn_keys (code, group_id, status, days_valid, key_type, account_count, customer_name, created_by, created_at, updated_at, expires_at)
         VALUES (?, ?, 'chờ', ?, ?, ?, ?, ?, NOW(), NOW(), ?)`,
        [code, groupId, days, type, accountCount, customer, createdBy, expiresAt]
      );
      if (!insertResult.success) {
        return { success: false, error: insertResult.error || 'Lỗi khi tạo key' };
      }
      createdKeys.push({ code, group, days, type, accountCount, customer, expiresAt });
    }
    return { success: true, data: createdKeys };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = { getKeysStats, createBulkKeys };
