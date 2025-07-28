const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'keyvpn_db',
  charset: 'utf8mb4'
};

async function runMigration() {
  let connection;
  
  try {
    console.log('Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('Connected to database successfully!');
    
    // Read migration file
    const migrationPath = path.join(__dirname, '../database/migrations/add_account_keys_table.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');
    
    // Split SQL statements (handle DELIMITER)
    const statements = migrationSQL
      .split(/DELIMITER.*?\n/g)
      .join('')
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('DELIMITER'));
    
    console.log(`Running ${statements.length} SQL statements...`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`Executing statement ${i + 1}/${statements.length}...`);
          await connection.execute(statement);
          console.log(`✓ Statement ${i + 1} executed successfully`);
        } catch (err) {
          // Skip if table already exists or trigger already exists
          if (err.code === 'ER_TABLE_EXISTS_ERROR' || 
              err.code === 'ER_TRG_ALREADY_EXISTS' ||
              err.code === 'ER_DUP_KEYNAME') {
            console.log(`⚠ Statement ${i + 1} skipped (already exists)`);
            continue;
          }
          throw err;
        }
      }
    }
    
    console.log('✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed.');
    }
  }
}

// Run migration
runMigration();
