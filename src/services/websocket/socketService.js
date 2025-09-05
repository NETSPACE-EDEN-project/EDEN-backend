import { Server } from 'socket.io';
import { eq, and, desc } from 'drizzle-orm';
import { corsOptions } from '../../config/cors.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/responseUtils.js';
import { verifyAccessToken } from '../auth/tokenService.js';
import { db } from '../../config/db.js';
import { messagesTable, chatRoomsTable, chatMembersTable, usersTable } from '../../models/schema.js';

// 全域狀態管理
const connectedUsers = new Map(); // userId -> { socketId, username, joinedAt }
const userRooms = new Map(); // userId -> Set(roomIds)
const roomUsers = new Map(); // roomId -> Set(userIds) 
const typingUsers = new Map(); // roomId -> Set(userIds)

const createSocketCorsOptions = () => {
  return {
    origin: corsOptions.origin,
    methods: corsOptions.methods,
    allowedHeaders: corsOptions.allowedHeaders,
    credentials: corsOptions.credentials
  };
};

const initSocketService = (httpServer) => {
  const io = new Server(httpServer, {
    cors: createSocketCorsOptions(),
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  setupSocketMiddleware(io);
  setupSocketEvents(io);

  return io;
};

const setupSocketMiddleware = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error(JSON.stringify(
          createErrorResponse(null, ERROR_TYPES.AUTH.TOKEN.AUTH_VERIFICATION_FAILED)
        )));
      }

      const verifyResult = verifyAccessToken(token);
      if (!verifyResult.success) {
        return next(new Error(JSON.stringify(
          createErrorResponse(null, ERROR_TYPES.AUTH.TOKEN.AUTH_VERIFICATION_FAILED)
        )));
      }

      if (verifyResult.data.status !== 'active') {
        return next(new Error(JSON.stringify(
          createErrorResponse(null, ERROR_TYPES.AUTH.USER.ACCOUNT_STATUS_INVALID)
        )));
      }

      // 設置 socket 用戶資訊
      socket.userId = verifyResult.data.id;
      socket.username = verifyResult.data.username;
      socket.userRole = verifyResult.data.role;

      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error(JSON.stringify(
        createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.AUTH_VERIFICATION_FAILED)
      )));
    }
  });
};

const setupSocketEvents = (io) => {
  io.on('connection', (socket) => {
    console.log(`User ${socket.username} (ID: ${socket.userId}) connected`);

    // 記錄用戶連接
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      username: socket.username,
      joinedAt: new Date()
    });

    // 自動加入用戶的聊天室
    joinUserRooms(socket, io);

    // 事件處理
    socket.on('send_message', (data) => handleSendMessage(socket, io, data));
    socket.on('join_room', (data) => handleJoinRoom(socket, io, data));
    socket.on('leave_room', (data) => handleLeaveRoom(socket, io, data));
    socket.on('typing_start', (data) => handleTypingStart(socket, io, data));
    socket.on('typing_stop', (data) => handleTypingStop(socket, io, data));
    socket.on('get_online_users', (data) => handleGetOnlineUsers(socket, data));
    socket.on('mark_messages_read', (data) => handleMarkMessagesRead(socket, data));

    // 斷線處理
    socket.on('disconnect', (reason) => {
      handleDisconnect(socket, io, reason);
    });
  });
};

const joinUserRooms = async (socket, io) => {
  try {
    const userRoomsData = await db
      .select({
        roomId: chatMembersTable.roomId
      })
      .from(chatMembersTable)
      .where(eq(chatMembersTable.userId, socket.userId));

    const roomIds = new Set();

    // 加入每個聊天室
    for (const room of userRoomsData) {
      const roomName = `room_${room.roomId}`;
      socket.join(roomName);
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

    userRooms.set(socket.userId, roomIds);

    // 廣播用戶上線
    socket.broadcast.emit('user_online', createSuccessResponse({
      userId: socket.userId,
      username: socket.username,
      onlineAt: new Date()
    }));

    console.log(`User ${socket.username} joined ${roomIds.size} rooms`);
  } catch (error) {
    console.error('Error joining user rooms:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.JOIN_ROOM_FAILED));
  }
};

const handleSendMessage = async (socket, io, data) => {
  try {
    const { roomId, content, messageType = 'text', replyToId = null } = data;

    // 驗證輸入
    if (!roomId || !content?.trim()) {
      socket.emit('error', createErrorResponse(
        null, 
        ERROR_TYPES.CHAT.MESSAGE.INVALID_PAGINATION
      ));
      return;
    }

    // 驗證房間成員資格
    const isMember = await verifyRoomMembership(socket.userId, roomId);
    if (!isMember) {
      socket.emit('error', createErrorResponse(
        null, 
        ERROR_TYPES.CHAT.MEMBER.NOT_ROOM_MEMBER
      ));
      return;
    }

    // 儲存訊息到資料庫
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

    // 準備廣播的訊息資料
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

    console.log(`Message sent in room ${roomId} by ${socket.username}`);

  } catch (error) {
    console.error('Error handling send message:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.MESSAGE.GET_MESSAGES_FAILED));
  }
};

const handleJoinRoom = async (socket, io, data) => {
  try {
    const { roomId } = data;

    if (!roomId) {
      socket.emit('error', createErrorResponse(
        null, 
        ERROR_TYPES.CHAT.ROOM.INVALID_ROOM_ID
      ));
      return;
    }

    // 驗證房間成員資格
    const isMember = await verifyRoomMembership(socket.userId, roomId);
    if (!isMember) {
      socket.emit('error', createErrorResponse(
        null, 
        ERROR_TYPES.CHAT.MEMBER.NOT_ROOM_MEMBER
      ));
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

    console.log(`User ${socket.username} joined room ${roomId}`);

  } catch (error) {
    console.error('Error handling join room:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.JOIN_ROOM_FAILED));
  }
};

const handleLeaveRoom = (socket, io, data) => {
  try {
    const { roomId } = data;

    if (!roomId) {
      socket.emit('error', createErrorResponse(
        null, 
        ERROR_TYPES.CHAT.ROOM.INVALID_ROOM_ID
      ));
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

    console.log(`User ${socket.username} left room ${roomId}`);

  } catch (error) {
    console.error('Error handling leave room:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.JOIN_ROOM_FAILED));
  }
};

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

    socket.to(roomName).emit('user_typing', createSuccessResponse({
      userId: socket.userId,
      username: socket.username,
      roomId
    }));

  } catch (error) {
    console.error('Error handling typing start:', error);
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
    console.error('Error handling typing stop:', error);
  }
};

const handleGetOnlineUsers = (socket, data) => {
  try {
    const { roomId } = data;
    
    if (roomId) {
      // 獲取特定房間的在線用戶
      const roomOnlineUsers = roomUsers.get(roomId) || new Set();
      socket.emit('online_users', createSuccessResponse({
        roomId,
        users: Array.from(roomOnlineUsers)
      }));
    } else {
      // 獲取所有在線用戶
      socket.emit('online_users', createSuccessResponse({
        totalOnline: connectedUsers.size,
        users: Array.from(connectedUsers.keys())
      }));
    }

  } catch (error) {
    console.error('Error getting online users:', error);
    socket.emit('error', createErrorResponse(error, ERROR_TYPES.CHAT.LIST.GET_ROOMS_FAILED));
  }
};

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
    console.error('Error marking messages as read:', error);
  }
};

const handleDisconnect = (socket, io, reason) => {
  console.log(`User ${socket.username} (ID: ${socket.userId}) disconnected: ${reason}`);

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

// 輔助函數
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
    console.error('Error verifying room membership:', error);
    return false;
  }
};

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
    console.error('Error getting room info:', error);
    return null;
  }
};

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

    return messages.reverse();
  } catch (error) {
    console.error('Error getting room messages:', error);
    return [];
  }
};

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
    console.error('Error updating room last message:', error);
  }
};

// 對外 API
const sendNotificationToUser = (io, userId, notification) => {
  const user = connectedUsers.get(userId);
  if (user) {
    io.to(user.socketId).emit('notification', createSuccessResponse(notification));
  }
};

const sendMessageToRoom = (io, roomId, event, data) => {
  io.to(`room_${roomId}`).emit(event, createSuccessResponse(data));
};

const broadcastToAll = (io, event, data) => {
  io.emit(event, createSuccessResponse(data));
};

const getOnlineUsersCount = () => {
  return connectedUsers.size;
};

const getRoomOnlineUsers = (roomId) => {
  return Array.from(roomUsers.get(roomId) || []);
};

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