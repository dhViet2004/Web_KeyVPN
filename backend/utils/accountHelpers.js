const { executeQuery } = require('../config/database');

// Get accounts statistics
async function getAccountsStats() {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN expires_at > NOW() THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN expires_at <= NOW() THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN TIMESTAMPDIFF(HOUR, NOW(), expires_at) <= 24 AND expires_at > NOW() THEN 1 ELSE 0 END) as expiring_soon
      FROM vpn_accounts 
      WHERE is_active = 1
    `;

    const result = await executeQuery(statsQuery);

    if (!result.success) {
      throw new Error('Database query failed');
    }

    return {
      success: true,
      data: result.data[0]
    };

  } catch (error) {
    console.error('Get accounts stats error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Generate random username
function generateUsername(prefix = 'vpnuser') {
  const nums = '0123456789';
  let num = '';
  for (let i = 0; i < 6; i++) {
    num += nums[Math.floor(Math.random() * nums.length)];
  }
  return `${prefix}${num}`;
}

// Generate random password
function generatePassword(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

module.exports = {
  getAccountsStats,
  generateUsername,
  generatePassword
};
