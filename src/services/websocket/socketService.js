import { Server } from 'socket.io';
import { eq, and, desc } from 'drizzle-orm';
import { corsOptions } from '../../config/cors.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/responseUtils.js';
import { verifyAccessToken } from '../auth/tokenService.js';
import { db } from '../../config/db.js';
import { messagesTable, chatRoomsTable, chatMembersTable, usersTable } from '../../models/tables/tables.js';

// ========== 全域狀態管理 ==========
// 追蹤所有連線的用戶
const connectedUsers = new Map(); // userId -> { socketId, username, joinedAt }

// 追蹤用戶加入的房間
const userRooms = new Map(); // userId -> Set(roomIds)

// 追蹤房間內的用戶
const roomUsers = new Map(); // roomId -> Set(userIds)

// 追蹤正在輸入的用戶
const typingUsers = new Map(); // roomId -> Set(userIds)

// ========== 主要初始化函數 ==========
const initSocketService = (httpServer) => {
  // 創建 Socket.IO 服務器
  const io = new Server(httpServer, {
    cors: {
      origin: corsOptions.origin,
      methods: corsOptions.methods,
      allowedHeaders: corsOptions.allowedHeaders,
      credentials: corsOptions.credentials
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // 設置認證中間件
  setupAuthentication(io);
  
  // 設置事件處理
  setupEventHandlers(io);

  return io;
};

// ========== 認證中間件 ==========
const setupAuthentication = (io) => {
  io.use(async (socket, next) => {
    try {
      // 從連接握手中獲取 Token
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        return next(new Error('缺少認證 Token'));
      }

      // 驗證 Token
      const verifyResult = verifyAccessToken(token);
      if (!verifyResult.success) {
        return next(new Error('Token 驗證失敗'));
      }

      // 檢查用戶狀態
      if (verifyResult.data.status !== 'active') {
        return next(new Error('用戶帳號狀態異常'));
      }

      // 將用戶資訊附加到 socket 物件
      socket.userId = verifyResult.data.id;
      socket.username = verifyResult.data.username;
      socket.userRole = verifyResult.data.role;

      next(); // 認證成功，繼續連接
      
    } catch (error) {
      console.error('Socket 認證錯誤:', error);
      next(new Error('認證過程發生錯誤'));
    }
  });
};

// ========== 事件處理設置 ==========
const setupEventHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`用戶 ${socket.username} (ID: ${socket.userId}) 已連線`);

    // 1. 記錄用戶連線
    recordUserConnection(socket);
    
    // 2. 自動加入用戶的聊天室
    autoJoinUserRooms(socket, io);

    // 3. 設置各種事件監聽器
    socket.on('send_message', (data) => handleSendMessage(socket, io, data));
    socket.on('join_room', (data) => handleJoinRoom(socket, io, data));
    socket.on('leave_room', (data) => handleLeaveRoom(socket, io, data));
    socket.on('typing_start', (data) => handleTypingStart(socket, io, data));
    socket.on('typing_stop', (data) => handleTypingStop(socket, io, data));
    socket.on('get_online_users', (data) => handleGetOnlineUsers(socket, data));
    socket.on('mark_messages_read', (data) => handleMarkMessagesRead(socket, data));

    // 4. 處理斷線
    socket.on('disconnect', (reason) => {
      handleDisconnect(socket, io, reason);
    });
  });
};

// ========== 用戶連線管理 ==========
const recordUserConnection = (socket) => {
  // 記錄到全域狀態
  connectedUsers.set(socket.userId, {
    socketId: socket.id,
    username: socket.username,
    joinedAt: new Date()
  });
};

const autoJoinUserRooms = async (socket, io) => {
  try {
    // 從資料庫查詢用戶所屬的聊天室
    const userRoomsData = await db
      .select({
        roomId: chatMembersTable.roomId
      })
      .from(chatMembersTable)
      .where(eq(chatMembersTable.userId, socket.userId));

    const roomIds = new Set();

    // 讓用戶加入每個聊天室
    for (const room of userRoomsData) {
      const roomName = `room_${room.roomId}`;
      socket.join(roomName); // Socket.IO 的加入房間功能
      roomIds.add(room.roomId);

      // 更新房間用戶列表
      if (!roomUsers.has(room.roomId)) {
        roomUsers.set(room.roomId, new Set());
      }
      roomUsers.get(room.roomId).add(socket.userId);

      // 通知房間內其他用戶
      socket.to(roomName).emit('user_joined_room', createSuccessResponse({
        userId: socket.userId,
        username: socket.username,
        roomId: room.roomId
      }));
    }

    // 記錄用戶所屬房間
    userRooms.set(socket.userId, roomIds);

    // 廣播用戶上線消息
    socket.broadcast.emit('user_online', createSuccessResponse({
      userId: socket.userId,
      username: socket.username,
      onlineAt: new Date()
    }));

    console.log(`用戶 ${socket.username} 加入了 ${roomIds.size} 個房間`);
    
  } catch (error) {
    console.error('自動加入用戶房間時發生錯誤:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.JOIN_ROOM_FAILED));
  }
};

// ========== 訊息處理 ==========
const handleSendMessage = async (socket, io, data) => {
  try {
    const { roomId, content, messageType = 'text', replyToId = null } = data;

    // 驗證輸入
    if (!roomId || !content?.trim()) {
      socket.emit('error', createErrorResponse(null, ERROR_TYPES.CHAT.MESSAGE.INVALID_PAGINATION));
      return;
    }

    // 檢查用戶是否為房間成員
    const isMember = await verifyRoomMembership(socket.userId, roomId);
    if (!isMember) {
      socket.emit('error', createErrorResponse(null, ERROR_TYPES.CHAT.MEMBER.NOT_ROOM_MEMBER));
      return;
    }

    // 將訊息儲存到資料庫
    const [newMessage] = await db
      .insert(messagesTable)
      .values({
        roomId: parseInt(roomId),
        senderId: socket.userId,
        content: content.trim(),
        messageType,
        replyToId: replyToId ? parseInt(replyToId) : null
      })
      .returning({
        id: messagesTable.id,
        content: messagesTable.content,
        messageType: messagesTable.messageType,
        createdAt: messagesTable.createdAt,
        replyToId: messagesTable.replyToId
      });

    // 準備要廣播的訊息資料
    const messageData = {
      id: newMessage.id,
      roomId: parseInt(roomId),
      senderId: socket.userId,
      senderUsername: socket.username,
      content: newMessage.content,
      messageType: newMessage.messageType,
      replyToId: newMessage.replyToId,
      createdAt: newMessage.createdAt
    };

    // 廣播給房間內所有用戶
    io.to(`room_${roomId}`).emit('new_message', createSuccessResponse(messageData));

    // 更新房間最後訊息時間
    await updateRoomLastMessage(roomId);

    console.log(`用戶 ${socket.username} 在房間 ${roomId} 發送了訊息`);

  } catch (error) {
    console.error('處理發送訊息時發生錯誤:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.MESSAGE.GET_MESSAGES_FAILED));
  }
};

// ========== 房間管理 ==========
const handleJoinRoom = async (socket, io, data) => {
  try {
    const { roomId } = data;

    if (!roomId) {
      socket.emit('error', createErrorResponse(null, ERROR_TYPES.CHAT.ROOM.INVALID_ROOM_ID));
      return;
    }

    // 驗證房間成員資格
    const isMember = await verifyRoomMembership(socket.userId, roomId);
    if (!isMember) {
      socket.emit('error', createErrorResponse(null, ERROR_TYPES.CHAT.MEMBER.NOT_ROOM_MEMBER));
      return;
    }

    const roomName = `room_${roomId}`;
    socket.join(roomName);

    // 更新房間用戶列表
    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, new Set());
    }
    roomUsers.get(roomId).add(socket.userId);

    // 獲取房間資訊和近期訊息
    const [roomInfo, recentMessages] = await Promise.all([
      getRoomInfo(roomId),
      getRoomMessages(roomId, 50)
    ]);

    // 回傳房間資訊給用戶
    socket.emit('joined_room', createSuccessResponse({
      roomId,
      roomInfo,
      messages: recentMessages,
      onlineUsers: Array.from(roomUsers.get(roomId) || [])
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
      socket.emit('error', createErrorResponse(null, ERROR_TYPES.CHAT.ROOM.INVALID_ROOM_ID));
      return;
    }

    const roomName = `room_${roomId}`;
    socket.leave(roomName);

    // 更新房間用戶列表
    if (roomUsers.has(roomId)) {
      roomUsers.get(roomId).delete(socket.userId);
    }

    // 清除正在輸入狀態
    if (typingUsers.has(roomId)) {
      typingUsers.get(roomId).delete(socket.userId);
      socket.to(roomName).emit('user_stop_typing', createSuccessResponse({
        userId: socket.userId,
        roomId
      }));
    }

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

// ========== 輸入狀態管理 ==========
const handleTypingStart = (socket, io, data) => {
  try {
    const { roomId } = data;
    if (!roomId) return;

    const roomName = `room_${roomId}`;
    
    // 記錄正在輸入的用戶
    if (!typingUsers.has(roomId)) {
      typingUsers.set(roomId, new Set());
    }
    typingUsers.get(roomId).add(socket.userId);

    // 通知房間內其他用戶
    socket.to(roomName).emit('user_typing', createSuccessResponse({
      userId: socket.userId,
      username: socket.username,
      roomId
    }));

  } catch (error) {
    console.error('處理開始輸入時發生錯誤:', error);
  }
};

const handleTypingStop = (socket, io, data) => {
  try {
    const { roomId } = data;
    if (!roomId) return;

    const roomName = `room_${roomId}`;
    
    // 移除正在輸入的用戶
    if (typingUsers.has(roomId)) {
      typingUsers.get(roomId).delete(socket.userId);
    }

    socket.to(roomName).emit('user_stop_typing', createSuccessResponse({
      userId: socket.userId,
      roomId
    }));

  } catch (error) {
    console.error('處理停止輸入時發生錯誤:', error);
  }
};

// ========== 線上用戶管理 ==========
const handleGetOnlineUsers = (socket, data) => {
  try {
    const { roomId } = data;
    
    if (roomId) {
      // 獲取特定房間的線上用戶
      const roomOnlineUsers = roomUsers.get(roomId) || new Set();
      socket.emit('online_users', createSuccessResponse({
        roomId,
        users: Array.from(roomOnlineUsers)
      }));
    } else {
      // 獲取所有線上用戶
      socket.emit('online_users', createSuccessResponse({
        totalOnline: connectedUsers.size,
        users: Array.from(connectedUsers.keys())
      }));
    }

  } catch (error) {
    console.error('獲取線上用戶時發生錯誤:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.LIST.GET_ROOMS_FAILED));
  }
};

// ========== 訊息已讀狀態 ==========
const handleMarkMessagesRead = async (socket, data) => {
  try {
    const { roomId, messageIds } = data;
    
    if (!roomId) return;

    // 更新最後閱讀時間
    await db
      .update(chatMembersTable)
      .set({ lastReadAt: new Date() })
      .where(and(
        eq(chatMembersTable.userId, socket.userId),
        eq(chatMembersTable.roomId, roomId)
      ));

    socket.emit('messages_marked_read', createSuccessResponse({
      roomId,
      messageIds: messageIds || []
    }));

  } catch (error) {
    console.error('標記訊息為已讀時發生錯誤:', error);
  }
};

// ========== 斷線處理 ==========
const handleDisconnect = (socket, io, reason) => {
  console.log(`用戶 ${socket.username} (ID: ${socket.userId}) 已斷線: ${reason}`);

  // 清理用戶狀態
  connectedUsers.delete(socket.userId);
  
  // 從所有房間移除用戶
  const userRoomIds = userRooms.get(socket.userId) || new Set();
  for (const roomId of userRoomIds) {
    if (roomUsers.has(roomId)) {
      roomUsers.get(roomId).delete(socket.userId);
    }
    
    // 清除正在輸入狀態
    if (typingUsers.has(roomId)) {
      typingUsers.get(roomId).delete(socket.userId);
      socket.to(`room_${roomId}`).emit('user_stop_typing', createSuccessResponse({
        userId: socket.userId,
        roomId
      }));
    }

    // 通知房間內其他用戶
    socket.to(`room_${roomId}`).emit('user_left_room', createSuccessResponse({
      userId: socket.userId,
      username: socket.username,
      roomId
    }));
  }

  userRooms.delete(socket.userId);

  // 廣播用戶離線
  socket.broadcast.emit('user_offline', createSuccessResponse({
    userId: socket.userId,
    username: socket.username,
    offlineAt: new Date()
  }));
};

// ========== 輔助函數 ==========
// 驗證用戶是否為房間成員
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

// 獲取房間資訊
const getRoomInfo = async (roomId) => {
  try {
    const [roomInfo] = await db
      .select({
        id: chatRoomsTable.id,
        roomName: chatRoomsTable.roomName,
        description: chatRoomsTable.description,
        roomType: chatRoomsTable.roomType,
        isPrivate: chatRoomsTable.isPrivate,
        maxMembers: chatRoomsTable.maxMembers,
        createdAt: chatRoomsTable.createdAt
      })
      .from(chatRoomsTable)
      .where(eq(chatRoomsTable.id, roomId))
      .limit(1);

    return roomInfo || null;
  } catch (error) {
    console.error('獲取房間資訊時發生錯誤:', error);
    return null;
  }
};

// 獲取房間訊息
const getRoomMessages = async (roomId, limit = 50) => {
  try {
    const messages = await db
      .select({
        id: messagesTable.id,
        content: messagesTable.content,
        messageType: messagesTable.messageType,
        senderId: messagesTable.senderId,
        replyToId: messagesTable.replyToId,
        isEdited: messagesTable.isEdited,
        createdAt: messagesTable.createdAt
      })
      .from(messagesTable)
      .leftJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
      .where(and(
        eq(messagesTable.roomId, roomId),
        eq(messagesTable.isDeleted, false)
      ))
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit);

    return messages.reverse(); // 反轉以顯示最舊的訊息在前
  } catch (error) {
    console.error('獲取房間訊息時發生錯誤:', error);
    return [];
  }
};

// 更新房間最後訊息時間
const updateRoomLastMessage = async (roomId) => {
  try {
    await db
      .update(chatRoomsTable)
      .set({ 
        lastMessageAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(chatRoomsTable.id, roomId));
  } catch (error) {
    console.error('更新房間最後訊息時間時發生錯誤:', error);
  }
};

// ========== 對外 API ==========
// 發送通知給特定用戶
const sendNotificationToUser = (io, userId, notification) => {
  const user = connectedUsers.get(userId);
  if (user) {
    io.to(user.socketId).emit('notification', createSuccessResponse(notification));
  }
};

// 發送訊息到特定房間
const sendMessageToRoom = (io, roomId, event, data) => {
  io.to(`room_${roomId}`).emit(event, createSuccessResponse(data));
};

// 廣播給所有用戶
const broadcastToAll = (io, event, data) => {
  io.emit(event, createSuccessResponse(data));
};

// 獲取線上用戶數量
const getOnlineUsersCount = () => {
  return connectedUsers.size;
};

// 獲取房間線上用戶
const getRoomOnlineUsers = (roomId) => {
  return Array.from(roomUsers.get(roomId) || []);
};

// 檢查用戶是否線上
const isUserOnline = (userId) => {
  return connectedUsers.has(userId);
};

export {
  initSocketService,
  sendNotificationToUser,
  sendMessageToRoom,
  broadcastToAll,
  getOnlineUsersCount,
  getRoomOnlineUsers,
  isUserOnline
};