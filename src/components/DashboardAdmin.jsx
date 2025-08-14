import { Card, Statistic, Row, Col, Typography, Divider } from 'antd';
import { useDashboard } from '../hooks/useDashboard';
import {
  KeyOutlined,
  UserOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  PlusCircleOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

const statsConfig = [
  {
    title: 'Tổng Key',
    valueKey: 'total_keys',
    color: '#1677ff',
    icon: <KeyOutlined style={{ color: '#1677ff', fontSize: 32 }} />,
    bg: 'linear-gradient(90deg,#e3f0ff 0%,#f6fbff 100%)'
  },
  {
    title: 'Key đang hoạt động',
    valueKey: 'active_keys',
    color: '#52c41a',
    icon: <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 32 }} />,
    bg: 'linear-gradient(90deg,#eaffea 0%,#f6fff6 100%)'
  },
  {
    title: 'Key đã hết hạn',
    valueKey: 'expired_keys',
    color: '#ff4d4f',
    icon: <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 32 }} />,
    bg: 'linear-gradient(90deg,#ffeaea 0%,#fff6f6 100%)'
  },
  {
    title: 'Tài khoản VPN',
    valueKey: 'total_accounts',
    color: '#faad14',
    icon: <UserOutlined style={{ color: '#faad14', fontSize: 32 }} />,
    bg: 'linear-gradient(90deg,#fffbe3 0%,#fffdf6 100%)'
  },
  {
    title: 'Tài khoản đang hoạt động',
    valueKey: 'active_accounts',
    color: '#13c2c2',
    icon: <CheckCircleOutlined style={{ color: '#13c2c2', fontSize: 32 }} />,
    bg: 'linear-gradient(90deg,#e3fff9 0%,#f6fffd 100%)'
  },
  {
    title: 'Tài khoản đã hết hạn',
    valueKey: 'expired_accounts',
    color: '#b37feb',
    icon: <CloseCircleOutlined style={{ color: '#b37feb', fontSize: 32 }} />,
    bg: 'linear-gradient(90deg,#f3eaff 0%,#faf6ff 100%)'
  },
  {
    title: 'Key tạo hôm nay',
    valueKey: 'today_keys_created',
    color: '#1890ff',
    icon: <PlusCircleOutlined style={{ color: '#1890ff', fontSize: 32 }} />,
    bg: 'linear-gradient(90deg,#e3f4ff 0%,#f6fbff 100%)'
  },
  {
    title: 'Tài khoản tạo hôm nay',
    valueKey: 'today_accounts_created',
    color: '#ffc53d',
    icon: <ClockCircleOutlined style={{ color: '#ffc53d', fontSize: 32 }} />,
    bg: 'linear-gradient(90deg,#fffbe3 0%,#fffdf6 100%)'
  }
];

export default function DashboardAdmin() {
  const { data, error } = useDashboard();

  return (
    <div className="w-full max-w-6xl mx-auto bg-white p-4 sm:p-8 rounded-2xl shadow-md mt-2 sm:mt-6">
      <Title level={2} style={{ textAlign: 'center', marginBottom: 24, color: '#1677ff' }}>
        <KeyOutlined style={{ fontSize: 36, marginRight: 12 }} /> Dashboard Admin
      </Title>
      <Divider />
      <Row gutter={[24, 24]} justify="center">
        {statsConfig.map((stat) => (
          <Col xs={24} sm={12} md={8} lg={6} key={stat.valueKey}>
            <Card
              variant="outlined"
              hoverable
              style={{
                background: stat.bg,
                borderRadius: 16,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                transition: 'transform 0.2s',
                cursor: 'pointer',
                minHeight: 160
              }}
              bodyStyle={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
            >
              <div style={{ marginBottom: 12 }}>{stat.icon}</div>
              <Statistic
                title={<span style={{ color: stat.color, fontWeight: 600 }}>{stat.title}</span>}
                value={data[stat.valueKey] || 0}
                valueStyle={{ color: stat.color, fontSize: 28, fontWeight: 700 }}
              />
            </Card>
          </Col>
        ))}
      </Row>
      {error && <Text type="danger">{error}</Text>}
    </div>
  );
}
