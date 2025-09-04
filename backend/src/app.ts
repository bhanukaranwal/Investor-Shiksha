import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { createServer } from 'http';
import { Server } from 'socket.io';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import RedisStore from 'connect-redis';
import { PrismaClient } from '@prisma/client';

import { corsConfig } from './config/cors';
import { redisClient } from './config/redis';
import { swaggerOptions } from './config/swagger';
import { sessionConfig } from './config/auth';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error.middleware';
import { authMiddleware } from './middleware/auth.middleware';
import { validationMiddleware } from './middleware/validation.middleware';
import { loggerMiddleware } from './middleware/logger.middleware';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import courseRoutes from './routes/course.routes';
import assessmentRoutes from './routes/assessment.routes';
import tradingRoutes from './routes/trading.routes';
import portfolioRoutes from './routes/portfolio.routes';
import marketRoutes from './routes/market.routes';
import analyticsRoutes from './routes/analytics.routes';
import communityRoutes from './routes/community.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';
import uploadRoutes from './routes/upload.routes';

// Import WebSocket handlers
import { setupWebSocket } from './services/websocket.service';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: corsConfig,
  transports: ['websocket', 'polling'],
});

// Initialize Prisma
export const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "wss:", "ws:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors(corsConfig));

// Compression
app.use(compression());

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session configuration
app.use(session({
  ...sessionConfig,
  store: new RedisStore({
    client: redisClient,
    prefix: 'sess:',
  }),
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
}));
app.use(loggerMiddleware);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/courses', authMiddleware, courseRoutes);
app.use('/api/assessments', authMiddleware, assessmentRoutes);
app.use('/api/trading', authMiddleware, tradingRoutes);
app.use('/api/portfolio', authMiddleware, portfolioRoutes);
app.use('/api/market', authMiddleware, marketRoutes);
app.use('/api/analytics', authMiddleware, analyticsRoutes);
app.use('/api/community', authMiddleware, communityRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);
app.use('/api/upload', authMiddleware, uploadRoutes);

// Swagger documentation
const specs = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// WebSocket setup
setupWebSocket(io);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, gracefully shutting down...');
  
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  await prisma.$disconnect();
  await redisClient.quit();
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, gracefully shutting down...');
  
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  await prisma.$disconnect();
  await redisClient.quit();
  
  process.exit(0);
});

export { app, server, io };
