import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';

import { corsOptions } from './src/config/cors.js';
import { initSocketService } from './src/services/websocket/socketService.js';
import { router as authRoutes } from './src/routes/authRoutes.js';
import { router as chatRoutes } from './src/routes/chatRoutes.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use(cors(corsOptions));
app.use(cookieParser(process.env.COOKIE_SECRET));
console.log('Cookie secret exists:', !!process.env.COOKIE_SECRET);

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Social Chat API is running!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const io = initSocketService(httpServer);
console.log('Socket.io instance created:', !!io);

app.set('socketIO', io);

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: '伺服器內部錯誤'
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'ROUTE_NOT_FOUND',
    message: '找不到此API路徑'
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server is ready`);
});