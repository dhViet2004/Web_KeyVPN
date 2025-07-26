import { useState } from 'react'
import { Table, Button, Input, Space, Modal, DatePicker, Upload, Typography, Popconfirm, App } from 'antd'
import { EyeOutlined, EditOutlined, DeleteOutlined, UploadOutlined, PlusOutlined } from '@ant-design/icons'
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
  const [selectAll, setSelectAll] = useState(false)
  const [editing, setEditing] = useState(null) // {id, username, key, expire}
  const [viewing, setViewing] = useState(null) // {id, username, key, expire}
  const [uploading, setUploading] = useState(false)

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

  // Tự động xóa tài khoản hết hạn
  // const autoRemoveExpired = () => {
  //   setAccounts(accs => accs.filter(acc => dayjs(acc.expire).diff(dayjs(), 'second') > 0))
  // }

  // Tick chọn
  const handleSelect = id => setAccounts(accs => accs.map(a => a.id === id ? { ...a, selected: !a.selected } : a))
  const handleSelectAll = () => {
    setSelectAll(!selectAll)
    setAccounts(accs => accs.map(a => ({ ...a, selected: !selectAll })))
  }
  const handleDeleteSelected = () => {
    const selectedAccounts = accounts.filter(a => a.selected)
    if (selectedAccounts.length === 0) {
      messageApi.warning('Vui lòng chọn ít nhất một tài khoản để xóa!')
      return
    }
    setAccounts(accs => accs.filter(a => !a.selected))
    setSelectAll(false)
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
  const columns = [
    {
      title: <Input type="checkbox" checked={selectAll} onChange={handleSelectAll} />, dataIndex: 'selected', key: 'selected', width: 40,
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
      <Space className="mb-4 w-full" wrap>
        <Upload beforeUpload={handleUpload} showUploadList={false} accept=".txt">
          <Button icon={<UploadOutlined />} loading={uploading}>Tải lên file TXT</Button>
        </Upload>
        <Button icon={<PlusOutlined />} onClick={() => setEditing({id: null, username: '', password: 'xincamon', expire: dayjs().add(72, 'hour').toISOString()})}>Thêm tài khoản</Button>
        <Button icon={<DeleteOutlined />} danger onClick={handleDeleteSelected}>Xóa tài khoản đã chọn</Button>
      </Space>
      <div className="overflow-x-auto rounded-xl shadow-sm">
        <Table
          columns={columns}
          dataSource={accounts}
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
    </div>
  )
}

export default Account 