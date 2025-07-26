import { Modal, Button, Typography } from 'antd'
import { NotificationOutlined } from '@ant-design/icons'
import { useSettings } from '../hooks/useSettings'

const { Title, Paragraph } = Typography

function NotificationModal({ show, onClose, position = 'before' }) {
  const { settings } = useSettings()

  const handleClose = () => {
    if (onClose) onClose()
  }

  const isVisible = show && 
    settings?.notification?.enabled && 
    settings?.notification?.position === position

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <NotificationOutlined className="text-blue-500" />
          <span className="text-blue-600 font-bold">
            {settings?.notification?.title || 'THÔNG BÁO HỆ THỐNG'}
          </span>
        </div>
      }
      open={isVisible}
      onCancel={handleClose}
      footer={[
        <Button key="ok" type="primary" onClick={handleClose}>
          Đã hiểu
        </Button>
      ]}
      centered
      width={500}
      className="notification-modal"
    >
      <div className="py-4">
        <Paragraph className="text-gray-700 text-base leading-relaxed mb-0">
          {settings?.notification?.content || 'Chào mừng bạn đến với KeyVPN Tool!'}
        </Paragraph>
        {settings?.notification?.hasLink && settings?.notification?.linkUrl && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <Button 
              type="link" 
              href={settings.notification.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="!p-0 !text-blue-500 hover:!text-blue-700 !font-medium"
              size="small"
            >
              {settings.notification.linkText || 'Xem thêm'} →
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default NotificationModal
