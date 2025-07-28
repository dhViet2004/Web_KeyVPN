import { useState, useEffect } from 'react'
import { Table, Button, Input, Space, Modal, DatePicker, Upload, Typography, Popconfirm, App, Select, InputNumber, Checkbox, Spin, Alert, Tag } from 'antd'
import { EyeOutlined, EditOutlined, DeleteOutlined, UploadOutlined, PlusOutlined, FilterOutlined, CalendarOutlined, ClockCircleOutlined, ReloadOutlined, KeyOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAccounts } from '../hooks/useAccounts'
import { accountsAPI } from '../services/api'

const { Title } = Typography

const Account = () => {
  const { message: messageApi } = App.useApp()
  const { 
    accounts: backendAccounts, 
    loading: accountsLoading, 
    error: accountsError, 
    fetchAccounts, 
    createAccount, 
    updateAccount, 
    deleteAccount, 
    bulkExtend,
    assignKey,
    unassignKey,
    getAccountKeys
  } = useAccounts()
  
  // Transform backend accounts to match frontend structure
  const [accounts, setAccounts] = useState([])
  const [editing, setEditing] = useState(null) // {id, username, key, expire}
  const [viewing, setViewing] = useState(null) // {id, username, key, expire}
  const [uploading, setUploading] = useState(false)
  const [timeFilter, setTimeFilter] = useState('all') // 'all', 'expired', '1hour', '6hours', '12hours', '1day', '3days', '7days', '30days', 'custom', 'flexible'
  const [customTimeRange, setCustomTimeRange] = useState({ start: null, end: null })
  const [flexibleTime, setFlexibleTime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const [batchEditModal, setBatchEditModal] = useState(false)
  const [batchExpireTime, setBatchExpireTime] = useState(dayjs().add(72, 'hour'))
  const [keyManageModal, setKeyManageModal] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [accountKeys, setAccountKeys] = useState([])
  const [availableKeys, setAvailableKeys] = useState([])
  const [keyLoading, setKeyLoading] = useState(false)

  // Transform backend accounts to frontend format
  useEffect(() => {
    let rawAccounts = [];
    if (Array.isArray(backendAccounts)) {
      rawAccounts = backendAccounts;
    } else if (backendAccounts && Array.isArray(backendAccounts.accounts)) {
      rawAccounts = backendAccounts.accounts;
    } else if (backendAccounts && Array.isArray(backendAccounts.data)) {
      rawAccounts = backendAccounts.data;
    }
    
    if (rawAccounts && rawAccounts.length > 0) {
      const transformedAccounts = rawAccounts.map(acc => ({
        id: acc.id,
        username: acc.username,
        password: acc.password,
        expire: acc.expires_at,
        selected: false,
        status: acc.status || 'hoạt động',
        isActive: acc.is_active,
        keyCode: acc.key_code || '',
        keyGroup: acc.group_code || '',
        secondsRemaining: acc.seconds_remaining || 0,
        createdAt: acc.created_at,
        lastUsed: acc.last_used,
        usageCount: acc.usage_count || 0,
        assigned_keys: acc.assigned_keys || '0/3' // Add assigned_keys to the transformed account
      }))
      setAccounts(transformedAccounts)
    } else {
      setAccounts([])
    }
  }, [backendAccounts])

  // Refresh accounts periodically
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAccounts({ timeFilter })
    }, 30000) // Refresh every 30 seconds
    
    return () => clearInterval(interval)
  }, [fetchAccounts, timeFilter])

  // Initial fetch on component mount
  useEffect(() => {
    fetchAccounts({ timeFilter: 'all' });
  }, [fetchAccounts])

  // Đếm ngược thời gian
  const getCountdown = (expire) => {
    const now = dayjs()
    const end = dayjs(expire)
    const diff = end.diff(now, 'second')
    if (diff <= 0) return 'Đã hết hạn'
    const d = Math.floor(diff / 86400)
    const h = Math.floor((diff % 86400) / 3600)
    const m = Math.floor((diff % 3600) / 60)
    const s = diff % 60
    return `${d} ngày ${h} giờ ${m} phút ${s} giây`
  }

  // Lọc tài khoản theo thời gian - now using backend API
  const getFilteredAccounts = () => {
    // For 'flexible' and 'custom' filters, we still need client-side filtering
    // as the backend doesn't support these complex filters yet
    const now = dayjs()
    switch (timeFilter) {
      case 'custom':
        if (!customTimeRange.start || !customTimeRange.end) return accounts
        return accounts.filter(acc => {
          const expireDate = dayjs(acc.expire)
          return expireDate.isAfter(customTimeRange.start) && expireDate.isBefore(customTimeRange.end)
        })
      case 'flexible': {
        const totalSeconds = flexibleTime.days * 86400 + flexibleTime.hours * 3600 + flexibleTime.minutes * 60 + flexibleTime.seconds
        if (totalSeconds === 0) return accounts
        return accounts.filter(acc => {
          const diff = dayjs(acc.expire).diff(now, 'second')
          return diff > 0 && diff <= totalSeconds
        })
      }
      default:
        // For standard filters, backend already filtered the data
        return accounts
    }
  }

  // Fetch accounts when time filter changes (for backend-supported filters)
  useEffect(() => {
    if (['all', 'expired', '1hour', '6hours', '12hours', '1day', '3days', '7days', '30days'].includes(timeFilter)) {
      fetchAccounts({ timeFilter })
    }
  }, [timeFilter, fetchAccounts])

  const filteredAccounts = getFilteredAccounts()

  // Thống kê tài khoản theo thời gian - calculate from current data
  const getAccountStats = () => {
    const now = dayjs()
    const stats = {
      total: accounts.length,
      expired: accounts.filter(acc => dayjs(acc.expire).diff(now, 'second') <= 0).length,
      hour1: accounts.filter(acc => {
        const diff = dayjs(acc.expire).diff(now, 'minute')
        return diff > 0 && diff <= 60
      }).length,
      hour6: accounts.filter(acc => {
        const diff = dayjs(acc.expire).diff(now, 'hour')
        return diff > 0 && diff <= 6
      }).length,
      hour12: accounts.filter(acc => {
        const diff = dayjs(acc.expire).diff(now, 'hour')
        return diff > 0 && diff <= 12
      }).length,
      day1: accounts.filter(acc => {
        const diff = dayjs(acc.expire).diff(now, 'hour')
        return diff > 0 && diff <= 24
      }).length,
      day3: accounts.filter(acc => {
        const diff = dayjs(acc.expire).diff(now, 'hour')
        return diff > 0 && diff <= 72
      }).length,
      day7: accounts.filter(acc => {
        const diff = dayjs(acc.expire).diff(now, 'day')
        return diff > 0 && diff <= 7
      }).length,
      day30: accounts.filter(acc => {
        const diff = dayjs(acc.expire).diff(now, 'day')
        return diff > 0 && diff <= 30
      }).length,
      flexible: (() => {
        const totalSeconds = flexibleTime.days * 86400 + flexibleTime.hours * 3600 + flexibleTime.minutes * 60 + flexibleTime.seconds
        if (totalSeconds === 0) return 0
        return accounts.filter(acc => {
          const diff = dayjs(acc.expire).diff(now, 'second')
          return diff > 0 && diff <= totalSeconds
        }).length
      })(),
    }
    return stats
  }

  // Recalculate stats when accounts or flexible time changes
  const accountStats = getAccountStats()

  // Chỉnh sửa hàng loạt thời gian hết hạn
  const handleBatchEditExpire = () => {
    const selectedAccounts = filteredAccounts.filter(a => a.selected)
    if (selectedAccounts.length === 0) {
      messageApi.warning('Vui lòng chọn ít nhất một tài khoản để chỉnh sửa!')
      return
    }
    setBatchEditModal(true)
  }

  const handleBatchEditSave = async () => {
    try {
      const selectedIds = filteredAccounts.filter(a => a.selected).map(a => a.id)
      await bulkExtend(selectedIds, batchExpireTime.format('YYYY-MM-DD HH:mm:ss'))
      setBatchEditModal(false)
      setAccounts(accs => accs.map(a => ({ ...a, selected: false })))
      messageApi.success(`Đã cập nhật thời gian hết hạn cho ${selectedIds.length} tài khoản!`)
    } catch (error) {
      messageApi.error(error.message || 'Lỗi khi cập nhật thời gian hết hạn!')
    }
  }

  // Tự động xóa tài khoản hết hạn
  // const autoRemoveExpired = () => {
  //   setAccounts(accs => accs.filter(acc => dayjs(acc.expire).diff(dayjs(), 'second') > 0))
  // }

  // Tick chọn
  const handleSelect = id => setAccounts(accs => accs.map(a => a.id === id ? { ...a, selected: !a.selected } : a))
  const handleSelectAll = () => {
    const allFilteredSelected = filteredAccounts.length > 0 && filteredAccounts.every(a => a.selected)
    const newSelectState = !allFilteredSelected
    
    // Chỉ chọn/bỏ chọn tài khoản trong danh sách đã lọc
    const filteredIds = filteredAccounts.map(a => a.id)
    setAccounts(accs => accs.map(a => 
      filteredIds.includes(a.id) ? { ...a, selected: newSelectState } : a
    ))
  }
  const handleDeleteSelected = async () => {
    const selectedAccounts = filteredAccounts.filter(a => a.selected)
    if (selectedAccounts.length === 0) {
      messageApi.warning('Vui lòng chọn ít nhất một tài khoản để xóa!')
      return
    }
    
    try {
      
      // Delete each selected account sequentially to better handle errors
      let successCount = 0
      let errorCount = 0
      const errors = []
      
      for (const account of selectedAccounts) {
        try {
          await deleteAccount(account.id)
          successCount++
        } catch (error) {
          errorCount++
          errors.push(`${account.username}: ${error.message}`)
          console.error(`❌ Failed to delete account ${account.username}:`, error.message)
        }
      }
      
      // Clear selection regardless of results
      setAccounts(accs => accs.map(a => ({ ...a, selected: false })))
      
      // Refresh account list
      fetchAccounts({ timeFilter })
      
      // Show appropriate message
      if (errorCount === 0) {
        messageApi.success(`Đã xóa thành công ${successCount} tài khoản!`)
      } else if (successCount === 0) {
        messageApi.error(`Không thể xóa tài khoản nào. Lỗi: ${errors.join(', ')}`)
      } else {
        messageApi.warning(`Đã xóa ${successCount} tài khoản, ${errorCount} tài khoản lỗi.`)
        console.warn('Delete errors:', errors)
      }
      
    } catch (error) {
      console.error('Batch delete error:', error)
      messageApi.error('Lỗi không xác định khi xóa tài khoản!')
    }
  }
  
  const handleDelete = async (id) => {
    try {
      await deleteAccount(id)
      
      // Refresh account list after successful deletion
      fetchAccounts({ timeFilter })
      
      messageApi.success('Đã xóa tài khoản thành công!')
    } catch (error) {
      console.error('Single delete error:', error)
      messageApi.error(error.message || 'Lỗi khi xóa tài khoản!')
    }
  }

  // Xem/chỉnh sửa
  const handleView = acc => setViewing(acc)
  const handleEdit = acc => setEditing(acc)
  const handleEditSave = async () => {
    try {
      // Kiểm tra tên tài khoản khi thêm mới
      if (!editing.id && (!editing.username || editing.username.trim() === '')) {
        messageApi.error('Vui lòng nhập tên tài khoản!')
        return
      }
      
      if (!editing.id) {
        // Thêm tài khoản mới
        await createAccount({
          username: editing.username.trim(),
          password: editing.password,
          expires_at: dayjs(editing.expire).format('YYYY-MM-DD HH:mm:ss')
        })
        messageApi.success('Đã thêm tài khoản mới!')
      } else {
        // Cập nhật tài khoản hiện có
        await updateAccount(editing.id, {
          password: editing.password,
          expires_at: dayjs(editing.expire).format('YYYY-MM-DD HH:mm:ss')
        })
        messageApi.success('Đã cập nhật tài khoản!')
      }
      setEditing(null)
    } catch (error) {
      messageApi.error(error.message || 'Lỗi khi lưu tài khoản!')
    }
  }

  // Upload file txt
  const handleUpload = async (file) => {
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const lines = e.target.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        
        let successCount = 0
        let skipCount = 0
        let errorCount = 0
        const errors = []
        
        // Process accounts one by one to handle duplicates
        for (let i = 0; i < lines.length; i++) {
          const username = lines[i]
          try {
            await createAccount({
              username,
              password: 'xincamon',
              expires_at: dayjs().add(72, 'hour').format('YYYY-MM-DD HH:mm:ss')
            })
            successCount++
          } catch (error) {
            if (error.message.includes('already exists') || error.message.includes('DUPLICATE_USERNAME')) {
              skipCount++
            } else {
              errorCount++
              errors.push(`${username}: ${error.message}`)
              console.error(`❌ Failed to create account ${username}:`, error.message)
            }
          }
        }
        
        setUploading(false)
        
        // Show detailed result message
        let message = `Kết quả: `
        if (successCount > 0) message += `${successCount} tài khoản mới được tạo. `
        if (skipCount > 0) message += `${skipCount} tài khoản đã tồn tại (bỏ qua). `
        if (errorCount > 0) message += `${errorCount} tài khoản lỗi.`
        
        if (errorCount === 0) {
          messageApi.success(message)
        } else {
          messageApi.warning(message)
          if (errors.length > 0) {
            console.warn('Upload errors:', errors)
          }
        }
        
      } catch (error) {
        setUploading(false)
        messageApi.error(error.message || 'Lỗi khi tải lên file!')
        console.error('Upload file error:', error)
      }
    }
    reader.readAsText(file)
    return false
  }

  // Key management functions
  const handleManageKeys = async (account) => {
    setSelectedAccount(account)
    setKeyLoading(true)
    setKeyManageModal(true)
    
    try {
      // Get keys assigned to this account
      const keysResponse = await getAccountKeys(account.id)
      setAccountKeys(keysResponse || [])
      
      // Get available keys from backend API
      try {
        const response = await accountsAPI.getAvailableKeys()
        setAvailableKeys(response.data || [])
      } catch (error) {
        console.warn('Could not load available keys:', error);
        setAvailableKeys([])
      }
    } catch (error) {
      console.error('Get account keys error:', error)
      if (error.message.includes('not fully configured') || error.message.includes('503')) {
        messageApi.warning('Hệ thống quản lý key chưa được cấu hình đầy đủ. Chỉ hiển thị dữ liệu mẫu.')
        // Set empty data when system is not configured
        setAccountKeys([])
        setAvailableKeys([])
      } else {
        messageApi.error(error.message || 'Lỗi khi tải danh sách key!')
        setAccountKeys([])
        setAvailableKeys([])
      }
    } finally {
      setKeyLoading(false)
    }
  }

  const handleAssignKey = async (keyId) => {
    try {
      await assignKey(selectedAccount.id, keyId)
      messageApi.success('Đã gán key thành công!')
      
      // Refresh account keys
      const keys = await getAccountKeys(selectedAccount.id)
      setAccountKeys(keys)
      
      // Refresh account list to update assigned_keys count
      fetchAccounts({ timeFilter })
    } catch (error) {
      console.error('Assign key error:', error)
      if (error.message.includes('not fully configured') || error.message.includes('503')) {
        messageApi.warning('Hệ thống quản lý key chưa được cấu hình đầy đủ. Vui lòng liên hệ quản trị viên.')
      } else if (error.message.includes('Account not found') || error.message.includes('404')) {
        messageApi.error('Không tìm thấy tài khoản hoặc key. Vui lòng thử lại.')
      } else {
        messageApi.error(error.message || 'Lỗi khi gán key!')
      }
    }
  }

  const handleUnassignKey = async (keyId) => {
    try {
      await unassignKey(selectedAccount.id, keyId)
      messageApi.success('Đã bỏ gán key thành công!')
      
      // Refresh account keys
      const keys = await getAccountKeys(selectedAccount.id)
      setAccountKeys(keys)
      
      // Refresh account list to update assigned_keys count
      fetchAccounts({ timeFilter })
    } catch (error) {
      console.error('Unassign key error:', error)
      if (error.message.includes('not fully configured') || error.message.includes('503')) {
        messageApi.warning('Hệ thống quản lý key chưa được cấu hình đầy đủ. Vui lòng liên hệ quản trị viên.')
      } else if (error.message.includes('not found') || error.message.includes('404')) {
        messageApi.error('Không tìm thấy key assignment. Vui lòng thử lại.')
      } else {
        messageApi.error(error.message || 'Lỗi khi bỏ gán key!')
      }
    }
  }

  // Table columns
  const allFilteredSelected = filteredAccounts.length > 0 && filteredAccounts.every(a => a.selected)
  const someFilteredSelected = filteredAccounts.some(a => a.selected)
  
  const columns = [
    {
      title: <Checkbox 
        checked={allFilteredSelected} 
        indeterminate={someFilteredSelected && !allFilteredSelected}
        onChange={handleSelectAll} 
      />, 
      dataIndex: 'selected', 
      key: 'selected', 
      width: 40,
      render: (_, record) => <Checkbox checked={record.selected} onChange={() => handleSelect(record.id)} />
    },
    { title: 'Tài khoản', dataIndex: 'username', key: 'username', render: v => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span> },
    { title: 'Mật khẩu', dataIndex: 'password', key: 'password', render: v => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: 'Thời gian còn lại', dataIndex: 'expire', key: 'expire', render: v => getCountdown(v) },
    // Thêm cột Key đã gán
    { title: 'Key đã gán', dataIndex: 'assigned_keys', key: 'assigned_keys', render: v => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span> },
    {
      title: 'Thao tác', key: 'actions', render: (_, record) => (
        <Space>
          <Button icon={<EyeOutlined />} size="small" onClick={() => handleView(record)} title="Xem" />
          <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)} title="Chỉnh sửa" />
          <Button icon={<KeyOutlined />} size="small" onClick={() => handleManageKeys(record)} title="Quản lý Key" />
          <Popconfirm title="Xóa tài khoản này?" onConfirm={() => handleDelete(record.id)} okText="Xóa" cancelText="Hủy">
            <Button icon={<DeleteOutlined />} size="small" danger title="Xóa" />
          </Popconfirm>
        </Space>
      )
    }
  ]

  // Auto remove expired accounts mỗi 10s
  // (chỉ chạy khi component mount, không cần setInterval thực tế ở đây)
  // useEffect(() => { const t = setInterval(autoRemoveExpired, 10000); return () => clearInterval(t) }, [])

  return (
    <div className="w-full max-w-3xl mx-auto bg-white p-2 sm:p-8 rounded-2xl shadow-md mt-2 sm:mt-6 transition-all">
      <Title level={3} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20 }}>
        Quản lý tài khoản VPN
        <Button 
          icon={<ReloadOutlined />} 
          size="small" 
          onClick={() => {
            fetchAccounts({ timeFilter });
          }}
          loading={accountsLoading}
          title="Tải lại danh sách"
        />
        <Button 
          size="small" 
          type="dashed"
          onClick={() => {
            console.log('Debug info:');
            console.log('accounts:', accounts);
            console.log('backendAccounts:', backendAccounts);
            console.log('accountsLoading:', accountsLoading);
            console.log('accountsError:', accountsError);
          }}
          title="Debug Info"
        >
          Debug
        </Button>
      </Title>
      
      {/* Error Alert */}
      {accountsError && (
        <Alert
          message="Lỗi kết nối"
          description={accountsError}
          type="error"
          action={
            <Button 
              size="small" 
              danger 
              onClick={() => fetchAccounts({ timeFilter })}
            >
              Thử lại
            </Button>
          }
          className="mb-4"
          closable
        />
      )}
      
      {/* Loading Spinner */}
      {accountsLoading && accounts.length === 0 && (
        <div className="flex justify-center items-center h-40">
          <Spin size="large" />
        </div>
      )}
      
      {/* Bộ lọc theo thời gian */}
      <div className="mb-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <FilterOutlined />
          <span className="font-medium">Lọc theo thời gian:</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <Select
            value={timeFilter}
            onChange={setTimeFilter}
            style={{ width: 220 }}
            options={[
              { value: 'all', label: 'Tất cả tài khoản' },
              { value: 'expired', label: '🔴 Đã hết hạn' },
              { value: '1hour', label: '⚠️ Còn ≤ 1 giờ' },
              { value: '6hours', label: '🟡 Còn ≤ 6 giờ' },
              { value: '12hours', label: '🟠 Còn ≤ 12 giờ' },
              { value: '1day', label: '🟢 Còn ≤ 1 ngày' },
              { value: '3days', label: '🔵 Còn ≤ 3 ngày' },
              { value: '7days', label: '🟣 Còn ≤ 7 ngày' },
              { value: '30days', label: '⚪ Còn ≤ 30 ngày' },
              { value: 'flexible', label: '⏱️ Tùy chỉnh thời gian linh hoạt' },
              { value: 'custom', label: '🎯 Tùy chỉnh khoảng thời gian' },
            ]}
          />
          {timeFilter !== 'all' && (
            <Button 
              size="small" 
              onClick={() => {
                setTimeFilter('all')
                setCustomTimeRange({ start: null, end: null })
                setFlexibleTime({ days: 0, hours: 0, minutes: 0, seconds: 0 })
                fetchAccounts({ timeFilter: 'all' })
              }}
              title="Reset bộ lọc"
            >
              Hiển thị tất cả
            </Button>
          )}
          <span className="text-gray-600">
            Hiển thị <strong className="text-blue-600">{filteredAccounts.length}</strong>/<strong>{accounts.length}</strong> tài khoản
          </span>
        </div>
        
        {/* Thống kê nhanh */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-2 text-xs">
          <div 
            className={`bg-red-50 p-2 rounded text-center border-l-2 border-red-400 cursor-pointer hover:bg-red-100 transition-colors ${timeFilter === 'expired' ? 'ring-2 ring-red-300' : ''}`}
            onClick={() => setTimeFilter('expired')}
            title="Click để lọc tài khoản đã hết hạn"
          >
            <div className="font-bold text-red-600">{accountStats.expired}</div>
            <div className="text-red-500">Hết hạn</div>
          </div>
          <div 
            className={`bg-orange-50 p-2 rounded text-center border-l-2 border-orange-400 cursor-pointer hover:bg-orange-100 transition-colors ${timeFilter === '1hour' ? 'ring-2 ring-orange-300' : ''}`}
            onClick={() => setTimeFilter('1hour')}
            title="Click để lọc tài khoản còn ≤ 1 giờ"
          >
            <div className="font-bold text-orange-600">{accountStats.hour1}</div>
            <div className="text-orange-500">≤ 1h</div>
          </div>
          <div 
            className={`bg-yellow-50 p-2 rounded text-center border-l-2 border-yellow-400 cursor-pointer hover:bg-yellow-100 transition-colors ${timeFilter === '6hours' ? 'ring-2 ring-yellow-300' : ''}`}
            onClick={() => setTimeFilter('6hours')}
            title="Click để lọc tài khoản còn ≤ 6 giờ"
          >
            <div className="font-bold text-yellow-600">{accountStats.hour6}</div>
            <div className="text-yellow-600">≤ 6h</div>
          </div>
          <div 
            className={`bg-amber-50 p-2 rounded text-center border-l-2 border-amber-400 cursor-pointer hover:bg-amber-100 transition-colors ${timeFilter === '12hours' ? 'ring-2 ring-amber-300' : ''}`}
            onClick={() => setTimeFilter('12hours')}
            title="Click để lọc tài khoản còn ≤ 12 giờ"
          >
            <div className="font-bold text-amber-600">{accountStats.hour12}</div>
            <div className="text-amber-600">≤ 12h</div>
          </div>
          <div 
            className={`bg-green-50 p-2 rounded text-center border-l-2 border-green-400 cursor-pointer hover:bg-green-100 transition-colors ${timeFilter === '1day' ? 'ring-2 ring-green-300' : ''}`}
            onClick={() => setTimeFilter('1day')}
            title="Click để lọc tài khoản còn ≤ 1 ngày"
          >
            <div className="font-bold text-green-600">{accountStats.day1}</div>
            <div className="text-green-600">≤ 1d</div>
          </div>
          <div 
            className={`bg-blue-50 p-2 rounded text-center border-l-2 border-blue-400 cursor-pointer hover:bg-blue-100 transition-colors ${timeFilter === '3days' ? 'ring-2 ring-blue-300' : ''}`}
            onClick={() => setTimeFilter('3days')}
            title="Click để lọc tài khoản còn ≤ 3 ngày"
          >
            <div className="font-bold text-blue-600">{accountStats.day3}</div>
            <div className="text-blue-600">≤ 3d</div>
          </div>
          <div 
            className={`bg-purple-50 p-2 rounded text-center border-l-2 border-purple-400 cursor-pointer hover:bg-purple-100 transition-colors ${timeFilter === '7days' ? 'ring-2 ring-purple-300' : ''}`}
            onClick={() => setTimeFilter('7days')}
            title="Click để lọc tài khoản còn ≤ 7 ngày"
          >
            <div className="font-bold text-purple-600">{accountStats.day7}</div>
            <div className="text-purple-600">≤ 7d</div>
          </div>
          <div 
            className={`bg-gray-50 p-2 rounded text-center border-l-2 border-gray-400 cursor-pointer hover:bg-gray-100 transition-colors ${timeFilter === '30days' ? 'ring-2 ring-gray-300' : ''}`}
            onClick={() => setTimeFilter('30days')}
            title="Click để lọc tài khoản còn ≤ 30 ngày"
          >
            <div className="font-bold text-gray-600">{accountStats.day30}</div>
            <div className="text-gray-600">≤ 30d</div>
          </div>
        </div>
        
        {/* Bộ lọc thời gian linh hoạt */}
        {timeFilter === 'flexible' && (
          <div className="mt-3 p-3 bg-white rounded border border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <ClockCircleOutlined />
              <span className="text-sm font-medium">Tùy chỉnh thời gian còn lại:</span>
            </div>
            
            {/* Preset thời gian nhanh */}
            <div className="mb-3">
              <span className="text-xs text-gray-500 mb-1 block">Preset nhanh:</span>
              <Space wrap size="small">
                <Button 
                  size="small" 
                  onClick={() => setFlexibleTime({ days: 0, hours: 0, minutes: 30, seconds: 0 })}
                >
                  30 phút
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setFlexibleTime({ days: 0, hours: 1, minutes: 0, seconds: 0 })}
                >
                  1 giờ
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setFlexibleTime({ days: 0, hours: 2, minutes: 0, seconds: 0 })}
                >
                  2 giờ
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setFlexibleTime({ days: 0, hours: 6, minutes: 0, seconds: 0 })}
                >
                  6 giờ
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setFlexibleTime({ days: 0, hours: 12, minutes: 0, seconds: 0 })}
                >
                  12 giờ
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setFlexibleTime({ days: 1, hours: 0, minutes: 0, seconds: 0 })}
                >
                  1 ngày
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setFlexibleTime({ days: 3, hours: 0, minutes: 0, seconds: 0 })}
                >
                  3 ngày
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setFlexibleTime({ days: 7, hours: 0, minutes: 0, seconds: 0 })}
                >
                  7 ngày
                </Button>
              </Space>
            </div>
            
            {/* Input tùy chỉnh */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ngày</label>
                <InputNumber
                  min={0}
                  max={365}
                  value={flexibleTime.days}
                  onChange={value => setFlexibleTime(prev => ({ ...prev, days: value || 0 }))}
                  className="w-full"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Giờ</label>
                <InputNumber
                  min={0}
                  max={23}
                  value={flexibleTime.hours}
                  onChange={value => setFlexibleTime(prev => ({ ...prev, hours: value || 0 }))}
                  className="w-full"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phút</label>
                <InputNumber
                  min={0}
                  max={59}
                  value={flexibleTime.minutes}
                  onChange={value => setFlexibleTime(prev => ({ ...prev, minutes: value || 0 }))}
                  className="w-full"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Giây</label>
                <InputNumber
                  min={0}
                  max={59}
                  value={flexibleTime.seconds}
                  onChange={value => setFlexibleTime(prev => ({ ...prev, seconds: value || 0 }))}
                  className="w-full"
                  placeholder="0"
                />
              </div>
            </div>
            
            <div className="mt-3 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {flexibleTime.days > 0 || flexibleTime.hours > 0 || flexibleTime.minutes > 0 || flexibleTime.seconds > 0 ? (
                  <span>
                    Lọc tài khoản còn lại ≤ {' '}
                    <span className="font-medium text-blue-600">
                      {flexibleTime.days > 0 && `${flexibleTime.days} ngày `}
                      {flexibleTime.hours > 0 && `${flexibleTime.hours} giờ `}
                      {flexibleTime.minutes > 0 && `${flexibleTime.minutes} phút `}
                      {flexibleTime.seconds > 0 && `${flexibleTime.seconds} giây`}
                    </span>
                    {' '}→ <span className="font-bold text-green-600">{accountStats.flexible} tài khoản</span>
                  </span>
                ) : (
                  <span className="text-gray-400">Chưa thiết lập thời gian</span>
                )}
              </div>
              <Button 
                size="small" 
                onClick={() => setFlexibleTime({ days: 0, hours: 0, minutes: 0, seconds: 0 })}
                title="Reset thời gian"
                disabled={flexibleTime.days === 0 && flexibleTime.hours === 0 && flexibleTime.minutes === 0 && flexibleTime.seconds === 0}
              >
                Reset
              </Button>
            </div>
          </div>
        )}
        
        {/* Bộ lọc tùy chỉnh */}
        {timeFilter === 'custom' && (
          <div className="mt-3 p-3 bg-white rounded border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium">Khoảng thời gian tùy chỉnh:</span>
            </div>
            
            {/* Preset thời gian nhanh */}
            <div className="mb-3">
              <span className="text-xs text-gray-500 mb-1 block">Preset nhanh:</span>
              <Space wrap size="small">
                <Button 
                  size="small" 
                  onClick={() => setCustomTimeRange({ 
                    start: dayjs().startOf('day'), 
                    end: dayjs().endOf('day') 
                  })}
                >
                  Hôm nay
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setCustomTimeRange({ 
                    start: dayjs().subtract(1, 'day').startOf('day'), 
                    end: dayjs().subtract(1, 'day').endOf('day') 
                  })}
                >
                  Hôm qua
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setCustomTimeRange({ 
                    start: dayjs().startOf('week'), 
                    end: dayjs().endOf('week') 
                  })}
                >
                  Tuần này
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setCustomTimeRange({ 
                    start: dayjs().startOf('month'), 
                    end: dayjs().endOf('month') 
                  })}
                >
                  Tháng này
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setCustomTimeRange({ 
                    start: dayjs(), 
                    end: dayjs().add(7, 'day') 
                  })}
                >
                  7 ngày tới
                </Button>
              </Space>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Từ:</span>
              <DatePicker
                showTime
                value={customTimeRange.start}
                onChange={date => setCustomTimeRange(prev => ({ ...prev, start: date }))}
                format="DD/MM/YYYY HH:mm"
                placeholder="Chọn thời gian bắt đầu"
                style={{ width: 180 }}
              />
              <span className="text-sm">Đến:</span>
              <DatePicker
                showTime
                value={customTimeRange.end}
                onChange={date => setCustomTimeRange(prev => ({ ...prev, end: date }))}
                format="DD/MM/YYYY HH:mm"
                placeholder="Chọn thời gian kết thúc"
                style={{ width: 180 }}
              />
              {customTimeRange.start && customTimeRange.end && (
                <Button 
                  size="small" 
                  onClick={() => setCustomTimeRange({ start: null, end: null })}
                  title="Xóa bộ lọc"
                >
                  Xóa
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <Space className="mb-4 w-full" wrap>
        <Upload beforeUpload={handleUpload} showUploadList={false} accept=".txt">
          <Button icon={<UploadOutlined />} loading={uploading}>Tải lên file TXT</Button>
        </Upload>
        <Button icon={<PlusOutlined />} onClick={() => setEditing({id: null, username: '', password: 'xincamon', expire: dayjs().add(72, 'hour').toISOString()})}>Thêm tài khoản</Button>
        <Button icon={<DeleteOutlined />} danger onClick={handleDeleteSelected}>Xóa tài khoản đã chọn</Button>
        <Button icon={<CalendarOutlined />} type="primary" onClick={handleBatchEditExpire}>Chỉnh sửa thời gian hàng loạt</Button>
      </Space>
      <div className="overflow-x-auto rounded-xl shadow-sm">
        <Table
          columns={columns}
          dataSource={filteredAccounts}
          rowKey="id"
          pagination={{ pageSize: 8 }}
          scroll={{ x: true }}
          bordered
          size="middle"
          style={{ borderRadius: 12, minWidth: 600 }}
          loading={accountsLoading}
          locale={{
            emptyText: accountsError ? 'Không thể tải dữ liệu' : 'Chưa có tài khoản nào'
          }}
        />
      </div>
      {/* Modal xem tài khoản */}
      <Modal open={!!viewing} onCancel={() => setViewing(null)} footer={null} title="Xem tài khoản">
        {viewing && (
          <div className="space-y-2">
            <div><b>Tài khoản:</b> <span className="font-mono">{viewing.username}</span></div>
            <div><b>Mật khẩu:</b> <span className="font-mono">{viewing.password}</span></div>
            <div><b>Trạng thái:</b> <span className={`font-medium ${viewing.status === 'active' ? 'text-green-600' : viewing.status === 'expired' ? 'text-red-600' : 'text-orange-600'}`}>
              {viewing.status === 'active' ? 'Hoạt động' : viewing.status === 'expired' ? 'Đã hết hạn' : 'Sắp hết hạn'}
            </span></div>
            <div><b>Thời gian còn lại:</b> {getCountdown(viewing.expire)}</div>
            {viewing.keyCode && <div><b>Key code:</b> <span className="font-mono">{viewing.keyCode}</span></div>}
            {viewing.keyGroup && <div><b>Nhóm key:</b> <span className="font-mono">{viewing.keyGroup}</span></div>}
            {viewing.usageCount !== undefined && <div><b>Số lần sử dụng:</b> {viewing.usageCount}</div>}
            {viewing.lastUsed && <div><b>Lần sử dụng cuối:</b> {dayjs(viewing.lastUsed).format('DD/MM/YYYY HH:mm:ss')}</div>}
            <div><b>Ngày tạo:</b> {dayjs(viewing.createdAt).format('DD/MM/YYYY HH:mm:ss')}</div>
          </div>
        )}
      </Modal>
      
      {/* Modal chỉnh sửa tài khoản */}
      <Modal open={!!editing} onCancel={() => setEditing(null)} onOk={handleEditSave} title={editing && editing.id ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản'}>
        {editing && (
          <Space direction="vertical" className="w-full">
            <Input value={editing.username} disabled={!!editing.id} onChange={e => setEditing(ed => ({ ...ed, username: e.target.value }))} placeholder="Tên tài khoản" />
            <Input value={editing.password} onChange={e => setEditing(ed => ({ ...ed, password: e.target.value }))} placeholder="Mật khẩu" />
            <DatePicker
              showTime
              value={dayjs(editing.expire)}
              onChange={d => setEditing(ed => ({ ...ed, expire: d.toISOString() }))}
              format="YYYY-MM-DD HH:mm:ss"
              className="w-full"
            />
          </Space>
        )}
      </Modal>

      {/* Modal chỉnh sửa thời gian hàng loạt */}
      <Modal 
        open={batchEditModal} 
        onCancel={() => setBatchEditModal(false)} 
        onOk={handleBatchEditSave} 
        title="Chỉnh sửa thời gian hết hạn hàng loạt"
        okText="Cập nhật"
        cancelText="Hủy"
      >
        <div className="space-y-4">
          <div>
            <p>Bạn đang chỉnh sửa thời gian hết hạn cho <strong>{filteredAccounts.filter(a => a.selected).length}</strong> tài khoản đã chọn.</p>
          </div>
          <div>
            <label className="block mb-2 font-medium">Thời gian hết hạn mới:</label>
            <DatePicker
              showTime
              value={batchExpireTime}
              onChange={setBatchExpireTime}
              format="YYYY-MM-DD HH:mm:ss"
              className="w-full"
            />
          </div>
        </div>
      </Modal>

      {/* Modal quản lý Key */}
      <Modal 
        open={keyManageModal} 
        onCancel={() => setKeyManageModal(false)} 
        footer={null}
        title={`Quản lý Key - ${selectedAccount?.username}`}
        width={800}
      >
        {selectedAccount && (
          <div className="space-y-6">
            {/* Thông tin tài khoản */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Thông tin tài khoản:</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><strong>Tài khoản:</strong> {selectedAccount.username}</div>
                <div><strong>Key đã gán:</strong> {selectedAccount.assigned_keys}</div>
                <div><strong>Trạng thái:</strong> 
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${
                    selectedAccount.status === 'hoạt động' ? 'bg-green-100 text-green-600' :
                    selectedAccount.status === 'hết hạn' ? 'bg-red-100 text-red-600' :
                    'bg-orange-100 text-orange-600'
                  }`}>
                    {selectedAccount.status}
                  </span>
                </div>
                <div><strong>Hết hạn:</strong> {dayjs(selectedAccount.expire).format('DD/MM/YYYY HH:mm:ss')}</div>
              </div>
            </div>

            <Spin spinning={keyLoading}>
              {/* Keys đã gán */}
              <div>
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <KeyOutlined />
                  Keys đã gán ({accountKeys.length}/3)
                </h4>
                {accountKeys.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {accountKeys.map(key => (
                      <div key={key.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-4">
                          <Tag color={key.status === 'đang hoạt động' ? 'green' : key.status === 'hết hạn' ? 'red' : 'orange'}>
                            {key.code}
                          </Tag>
                          <span className="text-sm text-gray-600">{key.group_name}</span>
                          <span className="text-xs text-gray-400">
                            Gán lúc: {dayjs(key.assigned_at).format('DD/MM/YYYY HH:mm')}
                          </span>
                        </div>
                        <Popconfirm 
                          title="Bỏ gán key này?" 
                          onConfirm={() => handleUnassignKey(key.id)}
                          okText="Bỏ gán" 
                          cancelText="Hủy"
                        >
                          <Button size="small" danger>Bỏ gán</Button>
                        </Popconfirm>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Chưa có key nào được gán
                  </div>
                )}
              </div>

              {/* Keys có sẵn để gán */}
              {accountKeys.length < 3 && (
                <div>
                  <h4 className="font-medium mb-4">Keys có sẵn để gán:</h4>
                  {availableKeys.length > 0 ? (
                    <div className="space-y-2">
                      {availableKeys
                        .filter(key => !accountKeys.some(ak => ak.id === key.id))
                        .map(key => (
                          <div key={key.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-4">
                              <Tag color={key.status === 'chờ' ? 'blue' : 'green'}>
                                {key.code}
                              </Tag>
                              <span className="text-sm text-gray-600">{key.group_name}</span>
                              <span className="text-xs text-gray-400">Trạng thái: {key.status}</span>
                            </div>
                            <Button 
                              size="small" 
                              type="primary"
                              onClick={() => handleAssignKey(key.id)}
                            >
                              Gán Key
                            </Button>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      Không có key nào có sẵn
                    </div>
                  )}
                </div>
              )}

              {accountKeys.length >= 3 && (
                <Alert 
                  message="Đã đạt giới hạn tối đa" 
                  description="Tài khoản này đã được gán tối đa 3 keys. Vui lòng bỏ gán một số key trước khi gán key mới."
                  type="warning" 
                  showIcon 
                />
              )}
            </Spin>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Account 