import express from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { validateRequest } from '../middlewares/validateRequestMiddleware.js';
import { createGroupChatSchema, startPrivateChatSchema } from '../utils/chatValidation.js';
import { getChatList, startPrivateChat, createGroupChat, getMessages, searchUsers } from '../controllers/chatController.js';

const router = express.Router();

// 獲取聊天列表
router.get('/chats', requireAuth, getChatList);

// 搜尋用戶 (query 參數驗證在 controller 內處理)
router.get('/search', requireAuth, searchUsers);

// 開始私人聊天
router.post('/private', 
  requireAuth, 
  validateRequest(startPrivateChatSchema), 
  startPrivateChat
);

// 創建群組聊天
router.post('/group', 
  requireAuth, 
  validateRequest(createGroupChatSchema), 
  createGroupChat
);

// 獲取聊天室訊息 (分頁參數在 controller 內處理)
router.get('/rooms/:roomId/messages', 
  requireAuth, 
  getMessages
);

export { router };