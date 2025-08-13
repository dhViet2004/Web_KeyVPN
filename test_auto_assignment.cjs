#!/usr/bin/env node

/**
 * Test Auto Assignment Service
 * Test the force auto assignment endpoint
 */

const http = require('http');

// Test configuration
const BASE_URL = 'http://localhost:5001';
const TEST_ADMIN = {
  username: 'admin',
  password: 'admin123'
};

/**
 * Make HTTP request
 */
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({ statusCode: res.statusCode, data: result });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

/**
 * Login and get token
 */
async function login() {
  const options = {
    hostname: 'localhost',
    port: 5001,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const response = await makeRequest(options, TEST_ADMIN);
  
  if (response.statusCode === 200 && response.data.success) {
    console.log('✅ Login successful');
    return response.data.token;
  } else {
    throw new Error(`Login failed: ${response.data.message}`);
  }
}

/**
 * Force run auto assignment
 */
async function forceAutoAssignment(token) {
  const options = {
    hostname: 'localhost',
    port: 5001,
    path: '/api/auth/force-auto-assignment',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };

  const response = await makeRequest(options, {});
  
  if (response.statusCode === 200 && response.data.success) {
    console.log('🚀 Force auto assignment completed successfully!');
    console.log('📊 Result:', response.data.message);
    return response.data;
  } else {
    console.error('❌ Force auto assignment failed:', response.data.message);
    if (response.data.error) {
      console.error('Error details:', response.data.error);
    }
    return response.data;
  }
}

/**
 * Main test function
 */
async function testAutoAssignment() {
  try {
    console.log('🧪 Testing Auto Assignment Service...\n');

    // Step 1: Login
    console.log('Step 1: Authenticating...');
    const token = await login();
    console.log('');

    // Step 2: Force run auto assignment
    console.log('Step 2: Running force auto assignment...');
    const result = await forceAutoAssignment(token);
    console.log('');

    if (result.success) {
      console.log('✅ Auto assignment test completed successfully!');
      console.log('📋 Check the console output above for key transfer details.');
    } else {
      console.log('❌ Auto assignment test failed');
      console.log('📋 Check server logs for more details');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testAutoAssignment();
}

module.exports = { testAutoAssignment };
