import { useState } from 'react'
import { Form, Input, Button, Card, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'

const AdminLogin = () => {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onFinish = async (values) => {
    setLoading(true)
    
    try {
      const response = await authAPI.login(values.username, values.password)
      
      if (response.success) {
        message.success('Đăng nhập thành công!')
        
        // Lưu trạng thái đăng nhập
        localStorage.setItem('isAdmin', 'true')
        localStorage.setItem('adminUsername', values.username)
        
        // Trigger re-render NavBar
        window.dispatchEvent(new Event('admin-status-changed'))
        
        // Chuyển hướng đến dashboard
        navigate('/dashboard')
      } else {
        message.error(response.message || 'Đăng nhập thất bại!')
      }
    } catch (error) {
      console.error('Login error:', error)
      message.error(error.message || 'Lỗi kết nối server!')
    }
    
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Đăng nhập Admin
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Vui lòng đăng nhập để truy cập vào panel quản trị
          </p>
        </div>
        
        <Card className="shadow-lg">
          <Form
            name="admin-login"
            onFinish={onFinish}
            autoComplete="off"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[
                {
                  required: true,
                  message: 'Vui lòng nhập tên đăng nhập!',
                },
              ]}
            >
              <Input
                prefix={<UserOutlined className="text-gray-400" />}
                placeholder="Tên đăng nhập"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                {
                  required: true,
                  message: 'Vui lòng nhập mật khẩu!',
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="Mật khẩu"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                className="w-full h-12 text-lg font-semibold"
              >
                Đăng nhập
              </Button>
            </Form.Item>
          </Form>
          {/* Đã xóa thông báo lưu ý server backend */}
        </Card>
      </div>
    </div>
  )
}

export default AdminLogin
