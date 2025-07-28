import { useState, useEffect, useCallback } from 'react';
import { accountsAPI } from '../services/api';

export const useAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sử dụng useCallback để fetchAccounts không bị thay đổi tham chiếu
  const fetchAccounts = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await accountsAPI.getAccounts(params);
      
      if (response.success) {
        // Đảm bảo luôn setAccounts là mảng tài khoản
        if (Array.isArray(response.data?.accounts)) {
          setAccounts(response.data.accounts);
        } else if (Array.isArray(response.data)) {
          setAccounts(response.data);
        } else if (response.accounts && Array.isArray(response.accounts)) {
          setAccounts(response.accounts);
        } else {
          setAccounts([]);
        }
      } else {
        setAccounts([]);
        throw new Error(response.message || 'Không thể tải danh sách tài khoản');
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
      setError(err.message || 'Không thể tải danh sách tài khoản');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Chỉ gọi fetchAccounts một lần khi mount
  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const createAccount = async (accountData) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await accountsAPI.createAccount(accountData);
      if (response.success) {
        // Refresh accounts after creation
        await fetchAccounts();
        return response;
      } else {
        throw new Error(response.message || 'Không thể tạo tài khoản');
      }
    } catch (err) {
      console.error('Error creating account:', err);
      setError(err.message || 'Không thể tạo tài khoản');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateAccount = async (accountId, accountData) => {
    try {
      const response = await accountsAPI.updateAccount(accountId, accountData);
      if (response.success) {
        // Update local state
        setAccounts(prevAccounts => 
          prevAccounts.map(account => 
            account.id === accountId ? { ...account, ...accountData } : account
          )
        );
        return response;
      } else {
        throw new Error(response.message || 'Không thể cập nhật tài khoản');
      }
    } catch (err) {
      console.error('Error updating account:', err);
      throw err;
    }
  };

  const deleteAccount = async (accountId) => {
    try {
      const response = await accountsAPI.deleteAccount(accountId);
      if (response.success) {
        // Remove from local state
        setAccounts(prevAccounts => prevAccounts.filter(account => account.id !== accountId));
        return response;
      } else {
        throw new Error(response.message || 'Không thể xóa tài khoản');
      }
    } catch (err) {
      console.error('Error deleting account:', err);
      throw err;
    }
  };

  const bulkExtend = async (accountIds, expiresAt) => {
    try {
      setLoading(true);
      const response = await accountsAPI.bulkExtend(accountIds, expiresAt);
      if (response.success) {
        // Refresh accounts after bulk operation
        await fetchAccounts();
        return response;
      } else {
        throw new Error(response.message || 'Không thể gia hạn tài khoản');
      }
    } catch (err) {
      console.error('Error bulk extending accounts:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const assignKey = async (accountId, keyId) => {
    try {
      const response = await accountsAPI.assignKey(accountId, keyId);
      if (response.success) {
        // Refresh accounts after assignment
        await fetchAccounts();
        return response;
      } else {
        throw new Error(response.message || 'Không thể gán key cho tài khoản');
      }
    } catch (err) {
      console.error('Error assigning key:', err);
      throw err;
    }
  };

  const unassignKey = async (accountId, keyId) => {
    try {
      const response = await accountsAPI.unassignKey(accountId, keyId);
      if (response.success) {
        // Refresh accounts after unassignment
        await fetchAccounts();
        return response;
      } else {
        throw new Error(response.message || 'Không thể bỏ gán key');
      }
    } catch (err) {
      console.error('Error unassigning key:', err);
      throw err;
    }
  };

  const getAccountKeys = async (accountId) => {
    try {
      const response = await accountsAPI.getAccountKeys(accountId);
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.message || 'Không thể lấy danh sách key');
      }
    } catch (err) {
      console.error('Error getting account keys:', err);
      throw err;
    }
  };

  return {
    accounts,
    loading,
    error,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    bulkExtend,
    assignKey,
    unassignKey,
    getAccountKeys,
    setAccounts // For manual updates
  };
};
