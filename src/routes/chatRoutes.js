import express from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { validateRequest } from '../middlewares/validateRequestMiddleware.js';
import { createGroupChatSchema, startPrivateChatSchema } from '../utils/chatTableValidation.js';
import { getChatList, startPrivateChat, createGroupChat, getMessages, searchUsers, getRoomInfo } from '../controllers/chatController.js';

const router = express.Router();

// 獲取聊天列表
router.get('/chats', requireAuth, getChatList);

// 搜尋用戶
router.get('/search', requireAuth, searchUsers);

// 創建私人聊天室
router.post('/private', 
  requireAuth, 
  validateRequest(startPrivateChatSchema), 
  startPrivateChat
);

// 創建群組聊天室
router.post('/group', 
  requireAuth, 
  validateRequest(createGroupChatSchema), 
  createGroupChat
);

// 獲取聊天室訊息
router.get('/rooms/:roomId/messages', 
  requireAuth, 
  getMessages
);

// 獲取聊天室資訊
router.get('/rooms/:roomId/info', 
  requireAuth, 
  getRoomInfo
);

export { router };