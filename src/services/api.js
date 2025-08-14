// API configuration and utilities for frontend
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// Create axios-like fetch wrapper
class ApiClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('admin_token');
  }

  // Set authorization token
  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('admin_token', token);
    } else {
      localStorage.removeItem('admin_token');
    }
  }

  // Get authorization headers
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  // Generic request method
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: this.getHeaders(),
      credentials: 'include', // Đảm bảo luôn gửi cookie/session khi CORS
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        // Handle authentication errors - both 401 and 403
        if (response.status === 401 || response.status === 403) {
          console.warn(`Authentication failed (${response.status}): ${data.message || 'Token invalid'}`);
          this.setToken(null);
          // Force redirect to login page
          window.location.href = '/admin-login';
          throw new Error('Session expired. Please login again.');
        }
        
        // Log detailed error for debugging
        console.log('API Error Details:', data);
        throw new Error(data.details || data.message || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // HTTP methods
  async get(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this.request(url, { method: 'GET' });
  }

  async post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
}

// Create API client instance
const apiClient = new ApiClient();

// Authentication API
export const authAPI = {
  // Admin login
  login: async (username, password) => {
    const response = await apiClient.post('/auth/login', { username, password });
    if (response.success && response.data.token) {
      apiClient.setToken(response.data.token);
    }
    return response;
  },

  // Admin logout
  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      apiClient.setToken(null);
      localStorage.removeItem('isAdmin');
      localStorage.removeItem('adminUsername');
    }
  },

  // Get current admin info
  getMe: () => apiClient.get('/auth/me'),

  // Change password
  changePassword: (currentPassword, newPassword) =>
    apiClient.post('/auth/change-password', { currentPassword, newPassword }),
};

// Keys API
export const keysAPI = {
  // Get keys by group
  getKeys: (group, params = {}) => apiClient.get(`/keys/${group}`, params),

  // Create new keys
  createKeys: (keyData) => apiClient.post('/keys/create', keyData),

  // Update key status
  updateKeyStatus: (keyId, status) =>
    apiClient.put(`/keys/${keyId}/status`, { status }),

  // Update key expiry date
  updateKeyExpiry: (keyId, expiresAt) =>
    apiClient.put(`/keys/${keyId}/expiry`, { expires_at: expiresAt }),

  // Delete key
  deleteKey: (keyId) => apiClient.delete(`/keys/${keyId}`),

  // Get keys statistics
  getStats: () => apiClient.get('/keys/stats/overview'),

  // Get key account details
  getKeyAccountDetails: (keyId) => apiClient.get(`/keys/${keyId}/accounts`),
};

// Accounts API
export const accountsAPI = {
  // Get accounts
  getAccounts: (params = {}) => apiClient.get('/accounts', params),

  // Create account
  createAccount: (accountData) => apiClient.post('/accounts', accountData),

  // Update account
  updateAccount: (accountId, accountData) =>
    apiClient.put(`/accounts/${accountId}`, accountData),

  // Delete account
  deleteAccount: (accountId) => apiClient.delete(`/accounts/${accountId}`),

  // Get accounts statistics
  getStats: () => apiClient.get('/accounts/stats'),

  // Bulk extend accounts
  bulkExtend: (accountIds, expiresAt) =>
    apiClient.post('/accounts/bulk-extend', { accountIds, expiresAt }),

  // Assign key to account
  assignKey: (accountId, keyId) =>
    apiClient.post(`/accounts/${accountId}/assign-key`, { keyId }),

  // Unassign key from account
  unassignKey: (accountId, keyId) =>
    apiClient.delete(`/accounts/${accountId}/unassign-key/${keyId}`),

  // Get keys assigned to account
  getAccountKeys: (accountId) =>
    apiClient.get(`/accounts/${accountId}/keys`),

  // Get available keys for assignment
  getAvailableKeys: () =>
    apiClient.get('/accounts/available-keys'),
};

// Gift API
export const giftAPI = {
  // Validate gift code
  validateGift: (code) => apiClient.post('/gift/validate', { code }),

  // Apply gift code to key
  applyGift: (code, key_code) => apiClient.post('/gift/apply', { code, key_code }),

  // Use gift code (deprecated - use applyGift instead)
  useGift: (giftCode, keyCode) =>
    apiClient.post('/gift/use', { giftCode, keyCode }),

  // Get gift codes list (admin)
  getGiftCodes: () => apiClient.get('/gift'),

  // Create gift code (admin)
  createGift: (giftData) => apiClient.post('/gift/create', giftData),

  // Get gift settings
  getGiftSettings: () => apiClient.get('/gift/settings'),

  // Update gift settings  
  updateGiftSettings: (settings) => apiClient.put('/gift/settings', settings),
};

// Settings API
export const settingsAPI = {
  // Get all settings
  getSettings: () => apiClient.get('/settings'),

  // Update setting
  updateSetting: (key, value, type = 'string') =>
    apiClient.put('/settings', { key, value, type }),

  // Get notifications
  getNotifications: () => apiClient.get('/settings/notifications'),

  // Update notification
  updateNotification: (notificationData) =>
    apiClient.put('/settings/notifications', notificationData),

  // Update notification enabled status
  updateNotificationEnabled: (enabled) =>
    apiClient.put('/settings/notifications/enabled', { enabled }),

  // Disable all notifications
  disableNotifications: () => apiClient.put('/settings/notifications/disable'),

  // Update auto assignment settings
  updateAutoAssignment: (autoAssignmentData) =>
    apiClient.put('/settings/auto-assignment', autoAssignmentData),

  // Get auto assignment settings
  getAutoAssignment: () => apiClient.get('/settings/auto-assignment'),
};

// Statistics API
export const statisticsAPI = {
  // Get dashboard stats
  getDashboard: () => apiClient.get('/statistics/dashboard'),

  // Get statistics by date range
  getStats: (startDate, endDate) =>
    apiClient.get('/statistics', { startDate, endDate }),
};

// Key validation API (public)
export const publicAPI = {
  // Check key validity (no auth required)
  checkKey: async (keyCode) => {
    const response = await fetch(`${API_BASE_URL}/public/check-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keyCode }),
    });
    return response.json();
  },

  // Auto assign key to available account (no auth required)
  autoAssignKey: async (keyCode) => {
    const response = await fetch(`${API_BASE_URL}/public/auto-assign-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keyCode }),
    });
    return response.json();
  },

  // Activate key and create VPN account (no auth required)
  activateKey: async (keyCode) => {
    const response = await fetch(`${API_BASE_URL}/public/activate-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keyCode }),
    });
    return response.json();
  },

  // Use gift code (no auth required)
  useGiftCode: async (giftCode, keyCode) => {
    const response = await fetch(`${API_BASE_URL}/public/use-gift`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ giftCode, keyCode }),
    });
    return response.json();
  },
};

// Export API client for direct use
export { apiClient };

// Utility functions
export const utils = {
  // Format date
  formatDate: (date) => {
    return new Date(date).toLocaleString('vi-VN');
  },

  // Calculate days remaining
  getDaysRemaining: (expiresAt) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  },

  // Get status color
  getStatusColor: (status) => {
    switch (status) {
      case 'đang hoạt động':
        return 'green';
      case 'hết hạn':
        return 'red';
      case 'chờ':
        return 'orange';
      default:
        return 'gray';
    }
  },

  // Handle API errors
  handleError: (error) => {
    console.error('API Error:', error);
    
    if (error.message.includes('401')) {
      // Redirect to login
      window.location.href = '/admin-login';
      return 'Authentication required';
    }
    
    if (error.message.includes('403')) {
      return 'Access denied';
    }
    
    if (error.message.includes('404')) {
      return 'Resource not found';
    }
    
    if (error.message.includes('500')) {
      return 'Server error. Please try again later.';
    }
    
    return error.message || 'An unexpected error occurred';
  },
};

// Auto Assignment API methods
export const autoAssignmentAPI = {
  // Get service status
  getStatus: async () => {
    return await apiClient.request('/settings/auto-assignment/status');
  },

  // Get settings
  getSettings: async () => {
    return await apiClient.request('/settings/auto-assignment');
  },

  // Update settings
  updateSettings: async (settings) => {
    return await apiClient.request('/settings/auto-assignment', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },

  // Start service
  start: async () => {
    return await apiClient.request('/settings/auto-assignment/start', {
      method: 'POST',
    });
  },

  // Stop service
  stop: async () => {
    return await apiClient.request('/settings/auto-assignment/stop', {
      method: 'POST',
    });
  },

  // Run now
  runNow: async () => {
    return await apiClient.request('/settings/auto-assignment/run-now', {
      method: 'POST',
    });
  },
};
