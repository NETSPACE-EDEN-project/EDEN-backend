import { Server } from 'socket.io';
import { eq, and } from 'drizzle-orm';
import cookie from 'cookie';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { corsOptions, allowedOrigins } from '../../config/cors.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/responseUtils.js';
import { verifyAccessToken } from '../auth/tokenService.js';
import { db } from '../../config/db.js';
import { messagesTable, chatRoomsTable, chatMembersTable } from '../../models/tables/tables.js';

dotenv.config();

// ========== 狀態管理 ==========
const connectedUsers = new Map(); // userId -> { socketId, username, joinedAt }
const userRooms = new Map();      // userId -> Set(roomIds)

// ========== 狀態管理輔助函數 ==========
const addUser = (userId, socketId, username) => {
  connectedUsers.set(userId, {
    socketId,
    username,
    joinedAt: new Date()
  });
};

const removeUser = (userId) => {
  connectedUsers.delete(userId);
  const rooms = userRooms.get(userId) || new Set();
  userRooms.delete(userId);
  return rooms;
};

const addUserToRoom = (userId, roomId) => {
  if (!userRooms.has(userId)) {
    userRooms.set(userId, new Set());
  }
  userRooms.get(userId).add(roomId);
};

const getOnlineCount = () => {
  return connectedUsers.size;
};

const getUserSocketId = (userId) => {
  return connectedUsers.get(userId)?.socketId;
};

// ========== 資料庫輔助函數 ==========
const verifyRoomMembership = async (userId, roomId) => {
  try {
    const [membership] = await db
      .select()
      .from(chatMembersTable)
      .where(and(
        eq(chatMembersTable.userId, userId),
        eq(chatMembersTable.roomId, roomId)
      ))
      .limit(1);

    return !!membership;
  } catch (error) {
    console.error('驗證房間成員資格時發生錯誤:', error);
    return false;
  }
};

const getUserRooms = async (userId) => {
  try {
    const userRoomsData = await db
      .select({ roomId: chatMembersTable.roomId })
      .from(chatMembersTable)
      .where(eq(chatMembersTable.userId, userId));

    return userRoomsData.map(room => room.roomId);
  } catch (error) {
    console.error('獲取用戶房間時發生錯誤:', error);
    return [];
  }
};

// ========== 事件處理函數 ==========
const handleConnection = async (socket, io) => {
  console.log(`用戶 ${socket.username} (ID: ${socket.userId}) 已連線`);

  // 記錄用戶連線
  addUser(socket.userId, socket.id, socket.username);
  
  // 自動加入用戶房間
  await autoJoinUserRooms(socket, io);
};

const autoJoinUserRooms = async (socket, io) => {
  try {
    const roomIds = await getUserRooms(socket.userId);

    for (const roomId of roomIds) {
      const roomName = `room_${roomId}`;
      socket.join(roomName);
      addUserToRoom(socket.userId, roomId);
    }

    console.log(`用戶 ${socket.username} 加入了 ${roomIds.length} 個房間`);
  } catch (error) {
    console.error('自動加入用戶房間時發生錯誤:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.JOIN_ROOM_FAILED));
  }
};

const handleSendMessage = async (socket, io, data) => {
  try {
    const { roomId, content, messageType = 'text' } = data;

    // 基本驗證
    if (!roomId || !content?.trim()) {
      return socket.emit('error', createErrorResponse(
        null, 
        ERROR_TYPES.CHAT.MESSAGE.INVALID_PAGINATION,
        { details: ['roomId 和 content 為必填欄位'] }
      ));
    }

    // 驗證房間成員
    const isMember = await verifyRoomMembership(socket.userId, roomId);
    if (!isMember) {
      return socket.emit('error', createErrorResponse(null, ERROR_TYPES.CHAT.MEMBER.NOT_ROOM_MEMBER));
    }

    // 儲存訊息到資料庫
    const [savedMessage] = await db.insert(messagesTable).values({
      roomId: parseInt(roomId),
      senderId: socket.userId,
      content: content.trim(),
      messageType,
      isDeleted: false
    }).returning();

    // 更新房間最後訊息時間
    await db.update(chatRoomsTable)
      .set({ lastMessageAt: new Date() })
      .where(eq(chatRoomsTable.id, parseInt(roomId)));

    // 準備廣播的訊息資料
    const messageData = {
      id: savedMessage.id,
      roomId: savedMessage.roomId,
      senderId: socket.userId,
      senderUsername: socket.username,
      content: savedMessage.content,
      messageType: savedMessage.messageType,
      createdAt: savedMessage.createdAt,
      isDeleted: savedMessage.isDeleted
    };

    // 廣播訊息給房間內所有用戶
    io.to(`room_${roomId}`).emit('new_message', createSuccessResponse(messageData));

  } catch (error) {
    console.error('處理 send_message 發生錯誤:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.MESSAGE.GET_MESSAGES_FAILED));
  }
};

const handleJoinRoom = async (socket, io, data) => {
  try {
    const { roomId } = data;

    if (!roomId) {
      return socket.emit('error', createErrorResponse(null, ERROR_TYPES.CHAT.ROOM.INVALID_ROOM_ID));
    }

    // 驗證房間成員資格
    const isMember = await verifyRoomMembership(socket.userId, roomId);
    if (!isMember) {
      return socket.emit('error', createErrorResponse(null, ERROR_TYPES.CHAT.MEMBER.NOT_ROOM_MEMBER));
    }

    const roomName = `room_${roomId}`;
    socket.join(roomName);
    addUserToRoom(socket.userId, roomId);

    // 回傳成功訊息
    socket.emit('joined_room', createSuccessResponse({ roomId }));

  } catch (error) {
    console.error('處理加入房間時發生錯誤:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.JOIN_ROOM_FAILED));
  }
};

const handleLeaveRoom = (socket, io, data) => {
  try {
    const { roomId } = data;

    if (!roomId) {
      return socket.emit('error', createErrorResponse(null, ERROR_TYPES.CHAT.ROOM.INVALID_ROOM_ID));
    }

    const roomName = `room_${roomId}`;
    socket.leave(roomName);
    
    // 從用戶房間列表中移除
    userRooms.get(socket.userId)?.delete(roomId);

    socket.emit('left_room', createSuccessResponse({ roomId }));

  } catch (error) {
    console.error('處理離開房間時發生錯誤:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.JOIN_ROOM_FAILED));
  }
};

const handleDisconnect = (socket, io, reason) => {
  console.log(`用戶 ${socket.username} (ID: ${socket.userId}) 已斷線: ${reason}`);

  // 清理用戶狀態
  removeUser(socket.userId);
};

// ========== 認證處理 ==========
const setupAuthentication = (io) => {
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      
      if (!cookieHeader) {
        return next(new Error('缺少 cookie'));
      }

      const parsed = cookie.parse(cookieHeader);
      const signedCookies = cookieParser.signedCookies(parsed, process.env.COOKIE_SECRET);
      const token = signedCookies['auth_token'];

      if (!token) {
        return next(new Error('缺少 token 或簽名錯誤'));
      }

      const verifyResult = verifyAccessToken(token);
      if (!verifyResult.success) {
        return next(new Error('Token 驗證失敗'));
      }

      socket.userId = verifyResult.data.id;
      socket.username = verifyResult.data.username;
      socket.userRole = verifyResult.data.role;

      next();
    } catch (error) {
      console.error('Socket 認證錯誤:', error);
      next(new Error('認證過程發生錯誤'));
    }
  });
};

// ========== 主要初始化函數 ==========
const initSocketService = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: corsOptions.methods,
      allowedHeaders: corsOptions.allowedHeaders,
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // 設置認證
  setupAuthentication(io);

  // 設置事件監聽
  io.on('connection', async (socket) => {
    // 處理連線
    await handleConnection(socket, io);

    // 設置事件監聽器
    socket.on('send_message', (data) => handleSendMessage(socket, io, data));
    socket.on('join_room', (data) => handleJoinRoom(socket, io, data));
    socket.on('leave_room', (data) => handleLeaveRoom(socket, io, data));
    socket.on('disconnect', (reason) => handleDisconnect(socket, io, reason));
  });

  return io;
};

// ========== 對外 API ==========
const sendNotificationToUser = (io, userId, notification) => {
  const socketId = getUserSocketId(userId);
  if (socketId) {
    io.to(socketId).emit('notification', createSuccessResponse(notification));
  }
};

const sendMessageToRoom = (io, roomId, event, data) => {
  io.to(`room_${roomId}`).emit(event, createSuccessResponse(data));
};

const broadcastToAll = (io, event, data) => {
  io.emit(event, createSuccessResponse(data));
};

export {
  initSocketService,
  sendNotificationToUser,
  sendMessageToRoom,
  broadcastToAll,
  // 狀態管理
  connectedUsers,
  userRooms,
  // 輔助函數
  getOnlineCount
};