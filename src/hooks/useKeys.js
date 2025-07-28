import { useState, useEffect } from 'react';
import { keysAPI } from '../services/api';

export const useKeys = (group = 'FBX') => {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchKeys = async (targetGroup = group) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await keysAPI.getKeys(targetGroup);
      if (response.success) {
        // Đảm bảo luôn setKeys là một mảng
        if (response.data && Array.isArray(response.data.keys)) {
          setKeys(response.data.keys);
        } else {
          setKeys([]);
        }
      } else {
        throw new Error(response.message || 'Không thể tải danh sách key');
      }
    } catch (err) {
      console.error('Error fetching keys:', err);
      setError(err.message || 'Không thể tải danh sách key');
      // Fallback to empty array instead of mock data
      setKeys([]);
    } finally {
      setLoading(false);
    }
  };

  const createKeys = async (keyData) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await keysAPI.createKeys(keyData);
      if (response.success) {
        // Refresh keys after creation
        await fetchKeys(keyData.group || group);
        return response;
      } else {
        throw new Error(response.message || 'Không thể tạo key');
      }
    } catch (err) {
      console.error('Error creating keys:', err);
      setError(err.message || 'Không thể tạo key');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateKeyStatus = async (keyId, status) => {
    try {
      const response = await keysAPI.updateKeyStatus(keyId, status);
      if (response.success) {
        // Update local state
        setKeys(prevKeys => 
          prevKeys.map(key => 
            key.id === keyId ? { ...key, status } : key
          )
        );
        return response;
      } else {
        throw new Error(response.message || 'Không thể cập nhật trạng thái key');
      }
    } catch (err) {
      console.error('Error updating key status:', err);
      throw err;
    }
  };

  const deleteKey = async (keyId) => {
    try {
      const response = await keysAPI.deleteKey(keyId);
      if (response.success) {
        // Remove from local state
        setKeys(prevKeys => prevKeys.filter(key => key.id !== keyId));
        return response;
      } else {
        throw new Error(response.message || 'Không thể xóa key');
      }
    } catch (err) {
      console.error('Error deleting key:', err);
      throw err;
    }
  };

  useEffect(() => {
    fetchKeys(group);
  }, [group]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    keys,
    loading,
    error,
    fetchKeys,
    createKeys,
    updateKeyStatus,
    deleteKey,
    setKeys // For manual updates
  };
};
