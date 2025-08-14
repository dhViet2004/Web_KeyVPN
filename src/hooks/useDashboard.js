import { useState, useEffect } from 'react';
import { statisticsAPI, keysAPI } from '../services/api';

export const useDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    total_keys: 0,
    active_keys: 0,
    expired_keys: 0,
    total_accounts: 0,
    active_accounts: 0,
    expired_accounts: 0,
    today_keys_created: 0,
    today_accounts_created: 0,
    keysByGroup: []
  });
  const [error, setError] = useState(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Gọi API dashboard statistics và keys by groups
      const [dashboardStats, keysByGroup] = await Promise.all([
        statisticsAPI.getDashboard().catch(err => {
          console.warn('Dashboard API error:', err);
          return { success: false, data: null };
        }),
        keysAPI.getStatsByGroups?.() || keysAPI.getStats?.() || Promise.resolve({ success: false, data: [] })
      ]);

      // Set dashboard data
      if (dashboardStats.success && dashboardStats.data) {
        setData(prevData => ({
          ...prevData,
          ...dashboardStats.data
        }));
      }

      // Set keys by group data if available
      if (keysByGroup.success && keysByGroup.data) {
        setData(prevData => ({
          ...prevData,
          keysByGroup: Array.isArray(keysByGroup.data) ? keysByGroup.data : []
        }));
      }

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message || 'Không thể tải dữ liệu dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchDashboardData
  };
};
