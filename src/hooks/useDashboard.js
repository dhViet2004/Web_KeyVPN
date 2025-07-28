import { useState, useEffect } from 'react';
import { keysAPI, accountsAPI } from '../services/api';

export const useDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    totalKeys: 0,
    activeKeys: 0,
    totalAccounts: 0,
    pendingKeys: 0,
    expiredKeys: 0
  });
  const [error, setError] = useState(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Gọi các API để lấy dữ liệu thống kê
      const [keysStats, accountsStats] = await Promise.all([
        keysAPI.getStats().catch(() => ({ data: { total: 0, active: 0, pending: 0, expired: 0 } })),
        accountsAPI.getStats().catch(() => ({ data: { total: 0 } }))
      ]);

      setData({
        totalKeys: keysStats.data?.total || 0,
        activeKeys: keysStats.data?.active || 0,
        pendingKeys: keysStats.data?.pending || 0,
        expiredKeys: keysStats.data?.expired || 0,
        totalAccounts: accountsStats.data?.total || 0
      });
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
