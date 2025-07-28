const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'keyvpn_db',
  charset: 'utf8mb4'
};

async function checkDatabase() {
  let connection;
  
  try {
    console.log('Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database successfully!');
    
    // Check if tables exist
    const tables = ['vpn_accounts', 'vpn_keys', 'key_groups', 'account_keys'];
    
    for (const table of tables) {
      try {
        const [rows] = await connection.execute(`SHOW TABLES LIKE '${table}'`);
        if (rows.length > 0) {
          console.log(`✅ Table '${table}' exists`);
          
          // Show table structure
          const [columns] = await connection.execute(`DESCRIBE ${table}`);
          console.log(`   Columns: ${columns.map(col => col.Field).join(', ')}`);
        } else {
          console.log(`❌ Table '${table}' does not exist`);
        }
      } catch (err) {
        console.log(`❌ Error checking table '${table}':`, err.message);
      }
    }
    
    // Check if assigned_key_count column exists
    try {
      const [columns] = await connection.execute(`DESCRIBE vpn_accounts`);
      const hasAssignedKeyCount = columns.some(col => col.Field === 'assigned_key_count');
      console.log(`assigned_key_count column exists: ${hasAssignedKeyCount ? '✅' : '❌'}`);
    } catch (err) {
      console.log('❌ Error checking assigned_key_count column:', err.message);
    }
    
    // Test basic query
    try {
      const [rows] = await connection.execute(`
        SELECT COUNT(*) as count FROM vpn_accounts WHERE is_active = 1
      `);
      console.log(`✅ Total active accounts: ${rows[0].count}`);
    } catch (err) {
      console.log('❌ Error counting accounts:', err.message);
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed.');
    }
  }
}

// Run check
checkDatabase();
