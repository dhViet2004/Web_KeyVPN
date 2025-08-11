const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { testConnection } = require('./config/database');
// Import service after database config is loaded
let autoAssignmentService;

// Import routes
const authRoutes = require('./routes/auth');
const keyRoutes = require('./routes/keys');
const accountRoutes = require('./routes/accounts');
const giftRoutes = require('./routes/gift');
const settingsRoutes = require('./routes/settings');
const statisticsRoutes = require('./routes/statistics');
const publicRoutes = require('./routes/public');

const app = express();
const PORT = process.env.PORT || 5001;

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 phút
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // tăng lên 1000 request/15 phút
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

// API Routes
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/gift', giftRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/statistics', statisticsRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  res.status(error.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log(`🚀 KeyVPN API Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
      console.log(`💾 Database: ${process.env.DB_NAME}@${process.env.DB_HOST}`);
      
      // Start auto assignment service after 5 seconds
      setTimeout(async () => {
        try {
          console.log('Starting auto assignment service...');
          // Load service after database is ready
          autoAssignmentService = require('./services/autoAssignmentService');
          console.log('Service loaded successfully');
          console.log('Service type:', typeof autoAssignmentService);
          console.log('Service constructor:', autoAssignmentService.constructor.name);
          console.log('Service methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(autoAssignmentService)));
          console.log('Service loaded, starting...');
          await autoAssignmentService.start();
          console.log('Auto assignment service started successfully');
        } catch (error) {
          console.error('Failed to start auto assignment service:', error);
        }
      }, 5000);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  try {
    if (autoAssignmentService) {
      autoAssignmentService.stop();
    }
  } catch (error) {
    console.error('Error stopping auto assignment service:', error);
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  try {
    if (autoAssignmentService) {
      autoAssignmentService.stop();
    }
  } catch (error) {
    console.error('Error stopping auto assignment service:', error);
  }
  process.exit(0);
});

startServer();

module.exports = app;
