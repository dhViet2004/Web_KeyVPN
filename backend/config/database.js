const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'sapassword',
  database: process.env.DB_NAME || 'keyvpn_db',
  port: process.env.DB_PORT || 3307,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  ssl: false
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

// Execute query with error handling
const executeQuery = async (query, params = []) => {
  try {
    const [results] = await pool.execute(query, params);
    return { success: true, data: results };
  } catch (error) {
    console.error('Database query error:', error.message);
    return { success: false, error: error.message };
  }
};

// Execute transaction
const executeTransaction = async (queries) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const results = [];
    for (const { query, params } of queries) {
      const [result] = await connection.execute(query, params);
      results.push(result);
    }
    
    await connection.commit();
    return { success: true, data: results };
  } catch (error) {
    await connection.rollback();
    console.error('Transaction error:', error.message);
    return { success: false, error: error.message };
  } finally {
    connection.release();
  }
};

// Get connection for stored procedures
const getConnection = async () => {
  return await pool.getConnection();
};

module.exports = {
  pool,
  testConnection,
  executeQuery,
  executeTransaction,
  getConnection
};
