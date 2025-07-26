import { useState } from 'react'
import { Table, Button, Input, Space, Modal, DatePicker, Upload, Typography, Popconfirm, App, Select, InputNumber } from 'antd'
import { EyeOutlined, EditOutlined, DeleteOutlined, UploadOutlined, PlusOutlined, FilterOutlined, CalendarOutlined, ClockCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { Title } = Typography

// Tạo dữ liệu mẫu
const mockAccounts = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  username: `vpnuser${i + 1}`,
  password: 'xincamon',
  expire: dayjs().add(72 - i * 10, 'hour').toISOString(),
  selected: false,
}))

const Account = () => {
  const { message: messageApi } = App.useApp()
  const [accounts, setAccounts] = useState(mockAccounts)
  const [editing, setEditing] = useState(null) // {id, username, key, expire}
  const [viewing, setViewing] = useState(null) // {id, username, key, expire}
  const [uploading, setUploading] = useState(false)
  const [timeFilter, setTimeFilter] = useState('all') // 'all', 'expired', '1hour', '6hours', '12hours', '1day', '3days', '7days', '30days', 'custom', 'flexible'
  const [customTimeRange, setCustomTimeRange] = useState({ start: null, end: null })
  const [flexibleTime, setFlexibleTime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const [batchEditModal, setBatchEditModal] = useState(false)
  const [batchExpireTime, setBatchExpireTime] = useState(dayjs().add(72, 'hour'))

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

  // Lọc tài khoản theo thời gian
  const getFilteredAccounts = () => {
    const now = dayjs()
    switch (timeFilter) {
      case 'expired':
        return accounts.filter(acc => dayjs(acc.expire).diff(now, 'second') <= 0)
      case '1hour':
        return accounts.filter(acc => {
          const diff = dayjs(acc.expire).diff(now, 'minute')
          return diff > 0 && diff <= 60
        })
      case '6hours':
        return accounts.filter(acc => {
          const diff = dayjs(acc.expire).diff(now, 'hour')
          return diff > 0 && diff <= 6
        })
      case '12hours':
        return accounts.filter(acc => {
          const diff = dayjs(acc.expire).diff(now, 'hour')
          return diff > 0 && diff <= 12
        })
      case '1day':
        return accounts.filter(acc => {
          const diff = dayjs(acc.expire).diff(now, 'hour')
          return diff > 0 && diff <= 24
        })
      case '3days':
        return accounts.filter(acc => {
          const diff = dayjs(acc.expire).diff(now, 'hour')
          return diff > 0 && diff <= 72
        })
      case '7days':
        return accounts.filter(acc => {
          const diff = dayjs(acc.expire).diff(now, 'day')
          return diff > 0 && diff <= 7
        })
      case '30days':
        return accounts.filter(acc => {
          const diff = dayjs(acc.expire).diff(now, 'day')
          return diff > 0 && diff <= 30
        })
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
        return accounts
    }
  }

  const filteredAccounts = getFilteredAccounts()

  // Thống kê tài khoản theo thời gian
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

  const handleBatchEditSave = () => {
    const selectedIds = filteredAccounts.filter(a => a.selected).map(a => a.id)
    setAccounts(accs => accs.map(a => 
      selectedIds.includes(a.id) 
        ? { ...a, expire: batchExpireTime.toISOString() }
        : a
    ))
    setBatchEditModal(false)
    setAccounts(accs => accs.map(a => ({ ...a, selected: false })))
    messageApi.success(`Đã cập nhật thời gian hết hạn cho ${selectedIds.length} tài khoản!`)
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
  const handleDeleteSelected = () => {
    const selectedAccounts = filteredAccounts.filter(a => a.selected)
    if (selectedAccounts.length === 0) {
      messageApi.warning('Vui lòng chọn ít nhất một tài khoản để xóa!')
      return
    }
    setAccounts(accs => accs.filter(a => !a.selected))
    messageApi.success(`Đã xóa ${selectedAccounts.length} tài khoản đã chọn!`)
  }
  const handleDelete = id => {
    setAccounts(accs => accs.filter(a => a.id !== id))
    messageApi.success('Đã xóa tài khoản!')
  }

  // Xem/chỉnh sửa
  const handleView = acc => setViewing(acc)
  const handleEdit = acc => setEditing(acc)
  const handleEditSave = () => {
    // Kiểm tra tên tài khoản khi thêm mới
    if (!editing.id && (!editing.username || editing.username.trim() === '')) {
      messageApi.error('Vui lòng nhập tên tài khoản!')
      return
    }
    
    if (!editing.id) {
      // Thêm tài khoản mới
      const newAccount = {
        id: Date.now(),
        username: editing.username.trim(),
        password: editing.password,
        expire: editing.expire,
        selected: false
      }
      setAccounts(accs => [newAccount, ...accs])
      messageApi.success('Đã thêm tài khoản mới!')
    } else {
      // Cập nhật tài khoản hiện có
      setAccounts(accs => accs.map(a => a.id === editing.id ? { ...a, password: editing.password, expire: editing.expire } : a))
      messageApi.success('Đã cập nhật tài khoản!')
    }
    setEditing(null)
  }

  // Upload file txt
  const handleUpload = (file) => {
    setUploading(true)
    const reader = new FileReader()
    reader.onload = (e) => {
      const lines = e.target.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      const newAccs = lines.map((username, idx) => ({
        id: Date.now() + idx,
        username,
        password: 'xincamon',
        key: '',
        expire: dayjs().add(72, 'hour').toISOString(),
        selected: false,
      }))
      setAccounts(accs => [...newAccs, ...accs])
      setUploading(false)
      messageApi.success('Đã thêm tài khoản từ file!')
    }
    reader.readAsText(file)
    return false
  }

  // Table columns
  const allFilteredSelected = filteredAccounts.length > 0 && filteredAccounts.every(a => a.selected)
  const someFilteredSelected = filteredAccounts.some(a => a.selected)
  
  const columns = [
    {
      title: <Input 
        type="checkbox" 
        checked={allFilteredSelected} 
        indeterminate={someFilteredSelected && !allFilteredSelected}
        onChange={handleSelectAll} 
      />, 
      dataIndex: 'selected', 
      key: 'selected', 
      width: 40,
      render: (_, record) => <Input type="checkbox" checked={record.selected} onChange={() => handleSelect(record.id)} />
    },
    { title: 'Tài khoản', dataIndex: 'username', key: 'username', render: v => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span> },
    { title: 'Mật khẩu', dataIndex: 'password', key: 'password', render: v => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: 'Thời gian còn lại', dataIndex: 'expire', key: 'expire', render: v => getCountdown(v) },
    {
      title: 'Thao tác', key: 'actions', render: (_, record) => (
        <Space>
          <Button icon={<EyeOutlined />} size="small" onClick={() => handleView(record)} title="Xem" />
          <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)} title="Chỉnh sửa" />
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
      <Title level={3} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20 }}>Quản lý tài khoản VPN</Title>
      
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
        />
      </div>
      {/* Modal xem tài khoản */}
      <Modal open={!!viewing} onCancel={() => setViewing(null)} footer={null} title="Xem tài khoản">
        {viewing && (
          <div className="space-y-2">
            <div><b>Tài khoản:</b> <span className="font-mono">{viewing.username}</span></div>
            <div><b>Mật khẩu:</b> <span className="font-mono">xincamon</span></div>
            <div><b>Thời gian còn lại:</b> {getCountdown(viewing.expire)}</div>
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
    </div>
  )
}

export default Account 