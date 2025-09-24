import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';

import { corsOptions } from './src/config/cors.js';
import { initSocketService } from './src/services/websocket/socketService.js';
import { router as authRoutes } from './src/routes/authRoutes.js';
import { router as chatRoutes } from './src/routes/chatRoutes.js';
import { logger } from './src/utils/logger.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use(cors(corsOptions));
app.use(cookieParser(process.env.COOKIE_SECRET));

logger.debug('服務器配置', {
  hasCookieSecret: !!process.env.COOKIE_SECRET,
  nodeEnv: process.env.NODE_ENV
});

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Social Chat API is running!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const io = initSocketService(httpServer);
logger.info('Socket.IO 服務初始化完成');

app.set('socketIO', io);

app.use((err, req, res, next) => {
  logger.error('服務器錯誤', err);
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: '伺服器內部錯誤'
  });
});

app.use((req, res) => {
  logger.debug('找不到 API 路徑', {
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent')?.substring(0, 50)
  });
  res.status(404).json({
    success: false,
    error: 'ROUTE_NOT_FOUND',
    message: '找不到此API路徑'
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  logger.info('服務器啟動成功', {
    port: PORT,
    nodeEnv: process.env.NODE_ENV,
    hasWebSocket: true
  });
});