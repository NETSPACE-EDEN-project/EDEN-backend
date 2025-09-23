import { Server } from 'socket.io';
import { eq, and, desc } from 'drizzle-orm';
import cookie from 'cookie';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { corsOptions, allowedOrigins } from '../../config/cors.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/responseUtils.js';
import { verifyAccessToken } from '../auth/tokenService.js';
import { db } from '../../config/db.js';
import { messagesTable, chatRoomsTable, chatMembersTable, usersTable } from '../../models/tables/tables.js';

dotenv.config();

// ========== 狀態管理 ==========
const connectedUsers = new Map(); // userId -> { socketId, username, joinedAt }
const userRooms = new Map();      // userId -> Set(roomIds)
const roomUsers = new Map();      // roomId -> Set(userIds)
const typingUsers = new Map();    // roomId -> Set(userIds)

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
  
  // 從所有房間移除用戶
  for (const roomId of rooms) {
    roomUsers.get(roomId)?.delete(userId);
    typingUsers.get(roomId)?.delete(userId);
  }
  
  userRooms.delete(userId);
  return rooms;
};

const addUserToRoom = (userId, roomId) => {
  if (!userRooms.has(userId)) {
    userRooms.set(userId, new Set());
  }
  userRooms.get(userId).add(roomId);

  if (!roomUsers.has(roomId)) {
    roomUsers.set(roomId, new Set());
  }
  roomUsers.get(roomId).add(userId);
};

const removeUserFromRoom = (userId, roomId) => {
  userRooms.get(userId)?.delete(roomId);
  roomUsers.get(roomId)?.delete(userId);
  typingUsers.get(roomId)?.delete(userId);
};

const setTyping = (userId, roomId, isTyping) => {
  if (!typingUsers.has(roomId)) {
    typingUsers.set(roomId, new Set());
  }
  
  if (isTyping) {
    typingUsers.get(roomId).add(userId);
  } else {
    typingUsers.get(roomId).delete(userId);
  }
};

const getRoomUsers = (roomId) => {
  return Array.from(roomUsers.get(roomId) || []);
};

const getOnlineCount = () => {
  return connectedUsers.size;
};

const isUserOnline = (userId) => {
  return connectedUsers.has(userId);
};

const getUserSocketId = (userId) => {
  return connectedUsers.get(userId)?.socketId;
};

// ========== 資料庫輔助函數（僅用於必要的即時驗證）==========
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

  // 廣播用戶上線
  socket.broadcast.emit('user_online', createSuccessResponse({
    userId: socket.userId,
    username: socket.username,
    onlineAt: new Date()
  }));
};

const autoJoinUserRooms = async (socket, io) => {
  try {
    const roomIds = await getUserRooms(socket.userId);

    for (const roomId of roomIds) {
      const roomName = `room_${roomId}`;
      socket.join(roomName);
      addUserToRoom(socket.userId, roomId);

      // 通知房間內其他用戶
      socket.to(roomName).emit('user_joined_room', createSuccessResponse({
        userId: socket.userId,
        username: socket.username,
        roomId
      }));
    }

    console.log(`用戶 ${socket.username} 加入了 ${roomIds.length} 個房間`);
  } catch (error) {
    console.error('自動加入用戶房間時發生錯誤:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.JOIN_ROOM_FAILED));
  }
};

const handleSendMessage = async (socket, io, data) => {
  try {
    const { roomId, content, messageType = 'text', replyToId = null } = data;

    // 基本驗證
    if (!roomId || !content?.trim()) {
      console.warn('發送訊息失敗：缺少 roomId 或 content');
      return socket.emit('error', createErrorResponse(
        null, 
        ERROR_TYPES.CHAT.MESSAGE.INVALID_PAGINATION,
        { details: ['roomId 和 content 為必填欄位'] }
      ));
    }

    // 驗證房間成員
    const isMember = await verifyRoomMembership(socket.userId, roomId);
    console.log('驗證房間成員:', socket.userId, roomId, isMember);
    if (!isMember) {
      console.warn(`用戶 ${socket.username} 不是房間 ${roomId} 成員`);
      return socket.emit('error', createErrorResponse(null, ERROR_TYPES.CHAT.MEMBER.NOT_ROOM_MEMBER));
    }

    // 驗證回覆訊息（如果有的話）
    if (replyToId) {
      const [replyMessage] = await db
        .select({ id: messagesTable.id })
        .from(messagesTable)
        .where(and(
          eq(messagesTable.id, parseInt(replyToId)),
          eq(messagesTable.roomId, parseInt(roomId)),
          eq(messagesTable.isDeleted, false)
        ))
        .limit(1);

      if (!replyMessage) {
        console.warn(`回覆的訊息 ${replyToId} 不存在或已刪除`);
        return socket.emit('error', createErrorResponse(
          null, 
          ERROR_TYPES.CHAT.MESSAGE.GET_MESSAGES_FAILED,
          { details: ['回覆的訊息不存在'] }
        ));
      }
    }

    // 儲存訊息到資料庫
    const [savedMessage] = await db.insert(messagesTable).values({
      roomId: parseInt(roomId),
      senderId: socket.userId,
      content: content.trim(),
      messageType,
      replyToId: replyToId ? parseInt(replyToId) : null,
      isDeleted: false
    }).returning();

    console.log('訊息已儲存到資料庫:', savedMessage.id);

    // 更新房間最後訊息時間
    await db.update(chatRoomsTable)
      .set({ lastMessageAt: new Date() })
      .where(eq(chatRoomsTable.id, parseInt(roomId)));

    console.log('房間最後訊息時間已更新');

    // 準備廣播的訊息資料
    const messageData = {
      id: savedMessage.id,
      roomId: savedMessage.roomId,
      senderId: socket.userId,
      senderUsername: socket.username,
      content: savedMessage.content,
      messageType: savedMessage.messageType,
      replyToId: savedMessage.replyToId,
      createdAt: savedMessage.createdAt,
      isDeleted: savedMessage.isDeleted
    };

    // 檢查用戶是否已 join 房間
    const currentRoomUsers = getRoomUsers(roomId);
    console.log(`房間 ${roomId} 目前用戶:`, currentRoomUsers);

    // 廣播訊息給房間內所有用戶
    io.to(`room_${roomId}`).emit('new_message', createSuccessResponse(messageData));
    console.log(`用戶 ${socket.username} 在房間 ${roomId} 發送訊息並廣播成功:`, messageData);

    // 清除該用戶在此房間的打字狀態
    setTyping(socket.userId, roomId, false);
    socket.to(`room_${roomId}`).emit('user_stop_typing', createSuccessResponse({
      userId: socket.userId,
      roomId: parseInt(roomId)
    }));

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

    // 只回傳基本資訊，詳細資料由 HTTP API 取得
    socket.emit('joined_room', createSuccessResponse({
      roomId,
      onlineUsers: getRoomUsers(roomId)
    }));

    // 通知房間內其他用戶
    socket.to(roomName).emit('user_joined_room', createSuccessResponse({
      userId: socket.userId,
      username: socket.username,
      roomId
    }));

    console.log(`用戶 ${socket.username} 加入房間 ${roomId}`);

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
    removeUserFromRoom(socket.userId, roomId);

    socket.emit('left_room', createSuccessResponse({ roomId }));

    // 通知房間內其他用戶
    socket.to(roomName).emit('user_left_room', createSuccessResponse({
      userId: socket.userId,
      username: socket.username,
      roomId
    }));

    console.log(`用戶 ${socket.username} 離開房間 ${roomId}`);

  } catch (error) {
    console.error('處理離開房間時發生錯誤:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.JOIN_ROOM_FAILED));
  }
};

const handleTypingStart = (socket, io, data) => {
  const { roomId } = data;
  if (!roomId) return;

  setTyping(socket.userId, roomId, true);
  
  socket.to(`room_${roomId}`).emit('user_typing', createSuccessResponse({
    userId: socket.userId,
    username: socket.username,
    roomId
  }));
};

const handleTypingStop = (socket, io, data) => {
  const { roomId } = data;
  if (!roomId) return;

  setTyping(socket.userId, roomId, false);
  
  socket.to(`room_${roomId}`).emit('user_stop_typing', createSuccessResponse({
    userId: socket.userId,
    roomId
  }));
};

const handleGetOnlineUsers = (socket, data) => {
  try {
    const { roomId } = data || {};
    
    if (roomId) {
      socket.emit('online_users', createSuccessResponse({
        roomId,
        users: getRoomUsers(roomId)
      }));
    } else {
      socket.emit('online_users', createSuccessResponse({
        totalOnline: getOnlineCount(),
        users: Array.from(connectedUsers.keys())
      }));
    }
  } catch (error) {
    console.error('獲取線上用戶時發生錯誤:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.LIST.GET_ROOMS_FAILED));
  }
};

const handleMarkMessagesRead = async (socket, data) => {
  try {
    const { roomId } = data;
    if (!roomId) return;

    await markMessagesRead(socket.userId, roomId);
    
    socket.emit('messages_marked_read', createSuccessResponse({ roomId }));
  } catch (error) {
    console.error('標記訊息為已讀時發生錯誤:', error);
  }
};

const handleDisconnect = (socket, io, reason) => {
  console.log(`用戶 ${socket.username} (ID: ${socket.userId}) 已斷線: ${reason}`);

  // 清理用戶狀態並獲取用戶房間
  const userRoomIds = removeUser(socket.userId);

  // 通知所有房間用戶離開
  for (const roomId of userRoomIds) {
    socket.to(`room_${roomId}`).emit('user_left_room', createSuccessResponse({
      userId: socket.userId,
      username: socket.username,
      roomId
    }));
  }

  // 廣播用戶離線
  socket.broadcast.emit('user_offline', createSuccessResponse({
    userId: socket.userId,
    username: socket.username,
    offlineAt: new Date()
  }));
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
    socket.on('typing_start', (data) => handleTypingStart(socket, io, data));
    socket.on('typing_stop', (data) => handleTypingStop(socket, io, data));
    socket.on('get_online_users', (data) => handleGetOnlineUsers(socket, data));
    socket.on('mark_messages_read', (data) => handleMarkMessagesRead(socket, data));
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
  roomUsers,
  typingUsers,
  // 輔助函數
  getRoomUsers,
  getOnlineCount,
  isUserOnline
};