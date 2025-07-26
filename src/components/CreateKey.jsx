import { useState } from 'react'
import { PlusOutlined, DeleteOutlined, SyncOutlined, FileTextOutlined, SearchOutlined, UserOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Button, Input, Select, Table, Radio, Space, Typography, Divider, Form, Tabs, Modal, App } from 'antd'
import { useSettings } from '../hooks/useSettings'

const { Title } = Typography
const { Option } = Select

function randomKey(prefix = 'FBX') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const nums = '0123456789'
  let str = ''
  for (let i = 0; i < 6; i++) str += chars[Math.floor(Math.random() * chars.length)]
  let num = ''
  for (let i = 0; i < 6; i++) num += nums[Math.floor(Math.random() * nums.length)]
  return `${prefix}-${str}${num}`
}

const keyGroups = [
  { label: 'FBX', value: 'FBX' },
  { label: 'THX', value: 'THX' },
  { label: 'CTV', value: 'CTV' },
  { label: 'TEST', value: 'TEST' },
]

const keyTypeOptions = [
  { value: '3key', label: '3 key/1 tài khoản' },
  { value: '2key', label: '2 key/1 tài khoản' },
  { value: '1key', label: '1 key/1 tài khoản' },
]

const mockKeys = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  code: randomKey(keyGroups[i % 4].value),
  group: keyGroups[i % 4].value,
  status: i % 3 === 0 ? 'chờ' : i % 3 === 1 ? 'đang hoạt động' : 'hết hạn',
  days: i % 4 === 0 ? 30 : i % 4 === 1 ? 5 : 2,
  customer: '',
  selected: false,
  accountCount: 1,
  type: '3key',
}))

const CreateKey = () => {
  const { message: messageApi } = App.useApp()
  const { settings } = useSettings()
  const [keys, setKeys] = useState(mockKeys)
  const [activeGroup, setActiveGroup] = useState('FBX')
  const [days, setDays] = useState(30)
  const [customDays, setCustomDays] = useState('')
  const [type, setType] = useState('2key')
  const [accountCount, setAccountCount] = useState(1)
  const [amount, setAmount] = useState(1)
  const [customer, setCustomer] = useState('')
  const [search, setSearch] = useState('')
  const [selectAll, setSelectAll] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [selectedKeyGroup, setSelectedKeyGroup] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [filteredKeysForDelete, setFilteredKeysForDelete] = useState([])
  const [selectedKeysForDelete, setSelectedKeysForDelete] = useState([])
  const [selectAllForDelete, setSelectAllForDelete] = useState(false)
  const [form] = Form.useForm()

  // Tạo key mới
  const handleCreate = () => {
    const n = Math.max(1, parseInt(amount) || 1)
    const prefix = activeGroup
    const time = activeGroup === 'TEST' ? 2 : (customDays ? parseInt(customDays) : days)
    const newKeys = Array.from({ length: n }, () => ({
      id: Date.now() + Math.random(),
      code: randomKey(prefix),
      group: prefix,
      status: 'chờ',
      days: time,
      customer,
      selected: false,
      accountCount,
      type,
    }))
    setKeys([...newKeys, ...keys])
    messageApi.success(`Đã tạo ${n} key mới cho nhóm ${prefix}!`)
    console.log('Thông báo tạo key được gọi') // Debug log
    setIsModalOpen(false)
    // Reset form
    setDays(30)
    setCustomDays('')
    setType('2key')
    setAccountCount(1)
    setAmount(1)
    setCustomer('')
    form.resetFields()
  }

  // Tạo key và xuất file txt
  const handleCreateAndExport = () => {
    const n = Math.max(1, parseInt(amount) || 1)
    const prefix = activeGroup
    const time = activeGroup === 'TEST' ? 2 : (customDays ? parseInt(customDays) : days)
    const newKeys = Array.from({ length: n }, () => ({
      id: Date.now() + Math.random(),
      code: randomKey(prefix),
      group: prefix,
      status: 'chờ',
      days: time,
      customer,
      selected: false,
      accountCount,
      type,
    }))
    
    // Thêm key vào danh sách
    setKeys([...newKeys, ...keys])
    
    // Xuất file txt
    const fileName = `${prefix}${customDays || time}ngay.txt`
    const linkTemplate = settings.keyExport?.linkTemplate || 'link nhập key:'
    const content = newKeys.map(k => `${k.code} | ${linkTemplate}`).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = fileName
    link.click()
    
    messageApi.success(`Đã tạo ${n} key mới và xuất file ${fileName}!`)
    console.log('Thông báo tạo key và xuất file được gọi') // Debug log
    setIsModalOpen(false)
    
    // Reset form
    setDays(30)
    setCustomDays('')
    setType('2key')
    setAccountCount(1)
    setAmount(1)
    setCustomer('')
    form.resetFields()
  }

  // Mở modal tạo key
  const showCreateModal = () => {
    setIsModalOpen(true)
    form.setFieldsValue({
      days: activeGroup === 'TEST' ? 2 : days,
      customDays,
      type,
      accountCount,
      amount,
      customer
    })
  }

  // Đóng modal
  const handleCancel = () => {
    setIsModalOpen(false)
  }

  // Mở modal lọc xóa
  const showFilterModal = () => {
    setIsFilterModalOpen(true)
    setSelectedKeyGroup('')
    setSelectedStatus('')
  }

  // Đóng modal lọc
  const handleFilterCancel = () => {
    setIsFilterModalOpen(false)
    setSelectedKeyGroup('')
    setSelectedStatus('')
    setFilteredKeysForDelete([])
    setSelectedKeysForDelete([])
    setSelectAllForDelete(false)
  }

  // Xóa key theo bộ lọc
  const handleFilterDelete = () => {
    // Xóa các key được chọn hoặc tất cả key được lọc
    const keysToDelete = selectedKeysForDelete.length > 0 ? selectedKeysForDelete : filteredKeysForDelete
    const deletedCount = keysToDelete.length
    const remainingKeys = keys.filter(k => !keysToDelete.some(d => d.id === k.id))
    setKeys(remainingKeys)
    
    messageApi.success(`Đã xóa ${deletedCount} key!`)
    console.log('Thông báo xóa key được gọi:', deletedCount) // Debug log
    setIsFilterModalOpen(false)
    setSelectedKeyGroup('')
    setSelectedStatus('')
    setFilteredKeysForDelete([])
    setSelectedKeysForDelete([])
    setSelectAllForDelete(false)
  }

  // Lọc key khi thay đổi trạng thái
  const handleStatusChange = (status) => {
    setSelectedStatus(selectedStatus === status ? '' : status)
    setSelectedKeysForDelete([])
    setSelectAllForDelete(false)
    
    if (selectedKeyGroup && status && selectedStatus !== status) {
      let statusFilter = status
      if (status === 'hết hạn') {
        statusFilter = 'hết hạn'
      } else if (status === 'còn hạn') {
        statusFilter = 'đang hoạt động'
      } else if (status === 'chưa gán tài khoản') {
        statusFilter = 'chờ'
      }
      
      const filtered = keys.filter(k => 
        k.group === selectedKeyGroup && k.status === statusFilter
      )
      setFilteredKeysForDelete(filtered)
    } else {
      setFilteredKeysForDelete([])
    }
  }

  // Chọn key để xóa
  const handleSelectKeyForDelete = (keyId) => {
    const isSelected = selectedKeysForDelete.some(k => k.id === keyId)
    if (isSelected) {
      setSelectedKeysForDelete(selectedKeysForDelete.filter(k => k.id !== keyId))
    } else {
      const keyToAdd = filteredKeysForDelete.find(k => k.id === keyId)
      if (keyToAdd) {
        setSelectedKeysForDelete([...selectedKeysForDelete, keyToAdd])
      }
    }
  }

  // Chọn tất cả key để xóa
  const handleSelectAllForDelete = () => {
    if (selectAllForDelete) {
      setSelectedKeysForDelete([])
    } else {
      setSelectedKeysForDelete([...filteredKeysForDelete])
    }
    setSelectAllForDelete(!selectAllForDelete)
  }

  // Chọn/xóa/reset key
  const handleSelect = id => setKeys(keys.map(k => k.id === id ? { ...k, selected: !k.selected } : k))
  const handleSelectAll = () => {
    setSelectAll(!selectAll)
    setKeys(keys.map(k => k.group === activeGroup ? { ...k, selected: !selectAll } : k))
  }
  const handleReset = id => {
    setKeys(keys.map(k => k.id === id ? { ...k, status: 'chờ' } : k))
    messageApi.success('Đã reset key thành công!')
  }
  const handleDeleteAccount = id => {
    setKeys(keys.map(k => k.id === id ? { ...k, status: 'chờ' } : k))
    messageApi.success('Đã xóa tài khoản thành công!')
  }

  // Xuất TXT
  const handleExport = () => {
    const selectedKeys = keys.filter(k => k.selected && k.group === activeGroup)
    if (selectedKeys.length === 0) {
      messageApi.warning('Vui lòng chọn ít nhất một key để xuất!')
      return
    }
    
    const fileName = `${activeGroup}${customDays || days}ngay.txt`
    const linkTemplate = settings.keyExport?.linkTemplate || 'link nhập key:'
    const content = selectedKeys.map(k => `${k.code} | ${linkTemplate}`).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = fileName
    link.click()
    messageApi.success(`Đã xuất ${selectedKeys.length} key vào file ${fileName}!`)
  }

  // Tìm kiếm
  const filteredKeys = keys.filter(k => {
    if (k.group !== activeGroup) return false
    if (search === '') return true
    if (['FBX', 'THX', 'CTV', 'TEST'].includes(search.toUpperCase())) return k.group === search.toUpperCase()
    if (search === 'it') return k.days <= 3
    return k.code.toLowerCase().includes(search.toLowerCase())
  })

  // Table columns
  const columns = [
    {
      title: <Input type="checkbox" checked={selectAll} onChange={handleSelectAll} />, dataIndex: 'selected', key: 'selected', width: 40,
      render: (_, record) => <Input type="checkbox" checked={record.selected} onChange={() => handleSelect(record.id)} />
    },
    { title: 'Mã key', dataIndex: 'code', key: 'code', render: v => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span> },
    { title: 'Nhóm', dataIndex: 'group', key: 'group' },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status' },
    { title: 'Ngày', dataIndex: 'days', key: 'days' },
    { title: 'Số tài khoản', dataIndex: 'accountCount', key: 'accountCount' },
    { title: 'Khách hàng', dataIndex: 'customer', key: 'customer' },
    {
      title: 'Thao tác', key: 'actions', render: (_, record) => (
        <Space>
          <Button icon={<SyncOutlined />} size="small" onClick={() => handleReset(record.id)} title="Reset" />
          <Button icon={<DeleteOutlined />} size="small" danger onClick={() => handleDeleteAccount(record.id)} title="Xóa tài khoản" />
        </Space>
      )
    }
  ]

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-2 sm:p-8 rounded-2xl shadow-md mt-2 sm:mt-6 transition-all">
      <Title level={3} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20 }}><UnorderedListOutlined /> Key VPN</Title>
      <Divider />
      <Tabs 
        activeKey={activeGroup} 
        onChange={setActiveGroup} 
        type="card" 
        className="mb-4"
        items={keyGroups.map(g => ({
          key: g.value,
          label: g.label,
          children: (
            <>
              <div className="flex flex-col md:flex-row gap-2 md:gap-4 mb-4 w-full">
                <Button type="primary" icon={<PlusOutlined />} onClick={showCreateModal} className="w-full md:w-auto">
                  Tạo key {g.label}
                </Button>
                <Button icon={<FileTextOutlined />} onClick={handleExport} className="w-full md:w-auto">Xuất TXT</Button>
                <Button icon={<DeleteOutlined />} danger onClick={showFilterModal} className="w-full md:w-auto">Xóa key</Button>
              </div>
              <Divider />
              <div className="flex flex-col md:flex-row gap-2 md:gap-4 mb-4 w-full">
                <Input prefix={<SearchOutlined />} placeholder="Tìm kiếm key, FBX, THX, CTV, TEST, it..." className="w-full md:w-80" value={search} onChange={e => setSearch(e.target.value)} />
                <Button onClick={handleSelectAll} className="w-full md:w-auto">{selectAll ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</Button>
              </div>
              <div className="overflow-x-auto rounded-xl shadow-sm">
                <Table
                  columns={columns}
                  dataSource={filteredKeys}
                  rowKey="id"
                  pagination={{ pageSize: 8 }}
                  scroll={{ x: true }}
                  bordered
                  size="middle"
                  style={{ borderRadius: 12, minWidth: 600 }}
                />
              </div>
            </>
          )
        }))}
      />

      {/* Modal tạo key */}
      <Modal
        title={`Tạo Key ${activeGroup}`}
        open={isModalOpen}
        onCancel={handleCancel}
        footer={null}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6 mb-4">
            <Form.Item label="Thời gian key" className="mb-0 md:col-span-2">
              <Space wrap>
                <Radio 
                  checked={activeGroup !== 'TEST' && days === 30} 
                  onChange={() => { setDays(30); setCustomDays('') }} 
                  disabled={activeGroup === 'TEST'}
                >
                  30 ngày
                </Radio>
                <Radio 
                  checked={activeGroup !== 'TEST' && days === 15} 
                  onChange={() => { setDays(15); setCustomDays('') }} 
                  disabled={activeGroup === 'TEST'}
                >
                  15 ngày
                </Radio>
                <Radio 
                  checked={activeGroup !== 'TEST' && days === 5} 
                  onChange={() => { setDays(5); setCustomDays('') }} 
                  disabled={activeGroup === 'TEST'}
                >
                  5 ngày
                </Radio>
                <Input 
                  type="number" 
                  min={1} 
                  style={{ width: 80 }} 
                  placeholder="Tùy chỉnh" 
                  value={customDays} 
                  onChange={e => setCustomDays(e.target.value)} 
                  disabled={activeGroup === 'TEST'} 
                />
                {activeGroup === 'TEST' && <span className="text-xs text-gray-500">(2 ngày cố định)</span>}
              </Space>
            </Form.Item>
            
            <Form.Item label="Loại key" className="mb-0">
              <Space wrap>
                <Select value={type} onChange={v => setType(v)} style={{ width: 160 }}>
                  {keyTypeOptions.map(opt => <Option key={opt.value} value={opt.value}>{opt.label}</Option>)}
                </Select>
                <span className="text-sm text-gray-500">Số tài khoản:</span>
                <Input 
                  type="number" 
                  min={1} 
                  style={{ width: 60 }} 
                  value={accountCount} 
                  onChange={e => setAccountCount(Number(e.target.value))} 
                />
              </Space>
            </Form.Item>
            
            <Form.Item label="Số lượng key" className="mb-0">
              <Input 
                type="number" 
                min={1} 
                className="w-full" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
              />
            </Form.Item>
            
            <Form.Item label={<span><UserOutlined /> Thông tin khách hàng (tùy chọn)</span>} className="mb-0 md:col-span-2">
              <Input 
                placeholder="Tên, link Facebook..." 
                className="w-full" 
                value={customer} 
                onChange={e => setCustomer(e.target.value)} 
              />
            </Form.Item>
          </div>
          
          <div className="flex gap-2 justify-end">
            <Button onClick={handleCancel}>
              Hủy
            </Button>
            <Button type="default" icon={<FileTextOutlined />} onClick={handleCreateAndExport}>
              Tạo key và xuất TXT
            </Button>
            <Button type="primary" icon={<PlusOutlined />} htmlType="submit">
              Tạo key
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal lọc xóa key */}
      <Modal
        title="Lọc và Xóa Key"
        open={isFilterModalOpen}
        onCancel={handleFilterCancel}
        footer={null}
        width={600}
      >
        <div className="space-y-6">
          {/* Chọn dạng key */}
          <div>
            <h4 className="text-base font-semibold mb-3">Chọn dạng key:</h4>
            <div className="grid grid-cols-2 gap-3">
              {keyGroups.map(group => (
                <Button
                  key={group.value}
                  type={selectedKeyGroup === group.value ? 'primary' : 'default'}
                  onClick={() => setSelectedKeyGroup(selectedKeyGroup === group.value ? '' : group.value)}
                  className="h-10"
                >
                  {group.label}
                </Button>
              ))}
            </div>
            {selectedKeyGroup && (
              <p className="text-sm text-gray-500 mt-2">Đã chọn: {selectedKeyGroup}</p>
            )}
          </div>

          {/* Chọn trạng thái (chỉ hiện khi đã chọn dạng key) */}
          {selectedKeyGroup && (
            <div>
              <h4 className="text-base font-semibold mb-3">Chọn trạng thái:</h4>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { value: 'hết hạn', label: 'Hết hạn', color: 'red' },
                  { value: 'còn hạn', label: 'Còn hạn', color: 'green' },
                  { value: 'chưa gán tài khoản', label: 'Chưa gán tài khoản', color: 'blue' }
                ].map(status => (
                  <Button
                    key={status.value}
                    type={selectedStatus === status.value ? 'primary' : 'default'}
                    onClick={() => handleStatusChange(status.value)}
                    className="h-10 text-left justify-start"
                    style={{
                      borderColor: selectedStatus === status.value ? undefined : status.color,
                      color: selectedStatus === status.value ? undefined : status.color
                    }}
                  >
                    {status.label}
                  </Button>
                ))}
              </div>
              {selectedStatus && (
                <p className="text-sm text-gray-500 mt-2">Đã chọn: {selectedStatus}</p>
              )}
            </div>
          )}

          {/* Hiển thị danh sách key được lọc */}
          {filteredKeysForDelete.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-base font-semibold">
                  Danh sách key ({filteredKeysForDelete.length} key):
                </h4>
                <div className="flex gap-2">
                  <Button 
                    size="small" 
                    onClick={handleSelectAllForDelete}
                    type={selectAllForDelete ? 'primary' : 'default'}
                  >
                    {selectAllForDelete ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </Button>
                </div>
              </div>
              
              <div className="max-h-60 overflow-y-auto border rounded-lg">
                <Table
                  size="small"
                  pagination={false}
                  rowKey="id"
                  dataSource={filteredKeysForDelete}
                  columns={[
                    {
                      title: (
                        <input
                          type="checkbox"
                          checked={selectAllForDelete}
                          onChange={handleSelectAllForDelete}
                        />
                      ),
                      width: 50,
                      render: (_, record) => (
                        <input
                          type="checkbox"
                          checked={selectedKeysForDelete.some(k => k.id === record.id)}
                          onChange={() => handleSelectKeyForDelete(record.id)}
                        />
                      )
                    },
                    {
                      title: 'Mã key',
                      dataIndex: 'code',
                      render: (text) => (
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '12px' }}>
                          {text}
                        </span>
                      )
                    },
                    {
                      title: 'Trạng thái',
                      dataIndex: 'status',
                      render: (status) => (
                        <span className={`px-2 py-1 rounded text-xs ${
                          status === 'hết hạn' ? 'bg-red-100 text-red-600' :
                          status === 'đang hoạt động' ? 'bg-green-100 text-green-600' :
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {status}
                        </span>
                      )
                    },
                    {
                      title: 'Ngày',
                      dataIndex: 'days',
                      width: 60
                    },
                    {
                      title: 'Khách hàng',
                      dataIndex: 'customer',
                      render: (text) => text || '-'
                    }
                  ]}
                />
              </div>
              
              {selectedKeysForDelete.length > 0 && (
                <p className="text-sm text-blue-600 mt-2">
                  Đã chọn {selectedKeysForDelete.length} key để xóa
                </p>
              )}
            </div>
          )}

          {/* Thông tin xem trước */}
          {selectedKeyGroup && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h5 className="font-semibold mb-2">Xem trước:</h5>
              {filteredKeysForDelete.length > 0 ? (
                <div>
                  <p className="text-sm text-gray-600">
                    {selectedKeysForDelete.length > 0 ? (
                      <>Sẽ xóa <strong>{selectedKeysForDelete.length}</strong> key đã chọn</>
                    ) : (
                      <>Sẽ xóa <strong>tất cả {filteredKeysForDelete.length}</strong> key <strong>{selectedKeyGroup}</strong> có trạng thái <strong>{selectedStatus}</strong></>
                    )}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  Sẽ xóa tất cả key <strong>{selectedKeyGroup}</strong>
                  {selectedStatus && (
                    <span> có trạng thái <strong>{selectedStatus}</strong></span>
                  )}
                </p>
              )}
              <p className="text-sm text-red-500 mt-2">
                ⚠️ Hành động này không thể hoàn tác!
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button onClick={handleFilterCancel}>
              Hủy
            </Button>
            <Button 
              type="primary" 
              danger 
              icon={<DeleteOutlined />}
              onClick={handleFilterDelete}
              disabled={!selectedKeyGroup || (filteredKeysForDelete.length === 0 && selectedKeysForDelete.length === 0)}
            >
              {selectedKeysForDelete.length > 0 
                ? `Xóa ${selectedKeysForDelete.length} key đã chọn`
                : filteredKeysForDelete.length > 0
                ? `Xóa tất cả ${filteredKeysForDelete.length} key`
                : 'Xóa key'
              }
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default CreateKey 