import { Server } from 'socket.io';
import { corsOptions } from '../../config/cors.js';
import { createErrorResponse, createSuccessResponse } from '../../utils/errorUtils.js';
import { verifyAccessToken } from '../auth/tokenService.js';
import { db } from '../../config/db.js';
import { messagesTable, chatRoomsTable, chatMembersTable } from '../../models/chat/chatSchema.js';
import { eq, and, desc } from 'drizzle-orm';

const connectedUsers = new Map();
const userRooms = new Map();

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
		cors: createSocketCorsOptions()
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
				const error = createErrorResponse(
          null, 
          'No authentication token provided', 
          'NO_TOKEN'
        );
        return next(new Error(JSON.stringify(error)));
			}

			const verifyResult = verifyAccessToken(token);
			if (!verifyResult.success) {
        const error = createErrorResponse(
          null, 
          verifyResult.message || 'Invalid token', 
          'INVALID_TOKEN'
        );
        return next(new Error(JSON.stringify(error)));
      }

			if (verifyResult.data.status !== 'active') {
        const error = createErrorResponse(
          null, 
          '帳號狀態異常，無法使用聊天功能', 
          'ACCOUNT_INACTIVE'
        );
        return next(new Error(JSON.stringify(error)));
      }

			socket.userId = verifyResult.data.id;
      socket.username = verifyResult.data.username;
      socket.userRole = verifyResult.data.role;

			next();
		} catch (error) {
			console.error('Socket authentication error:', error);
      const errorResponse = createErrorResponse(
        error, 
        'Authentication failed', 
        'AUTH_ERROR'
      );
      next(new Error(JSON.stringify(errorResponse)));
		}
	});
};

const setupSocketEvents = (io) => {
  io.on('connection', (socket) => {
    console.log(`User ${socket.username} (ID: ${socket.userId}) connected to socket`);

    connectedUsers.set(socket.userId, socket.id);

    joinUserRooms(socket, io);

    socket.on('send_message', (data) => handleSendMessage(socket, io, data));
    socket.on('join_room', (data) => handleJoinRoom(socket, data));
    socket.on('leave_room', (data) => handleLeaveRoom(socket, data));
    socket.on('typing_start', (data) => handleTypingStart(socket, data));
    socket.on('typing_stop', (data) => handleTypingStop(socket, data));

    socket.on('disconnect', () => {
      console.log(`User ${socket.username} (ID: ${socket.userId}) disconnected from socket`);
      connectedUsers.delete(socket.userId);
      userRooms.delete(socket.userId);

      socket.broadcast.emit('user_offline', {
        userId: socket.userId,
        username: socket.username
      });
    });
  });
};

const joinUserRooms = async (socket, io) => {
	try {
		const [userRoomsData] = await db
      .select(chatMembersTable.roomId)
			.from(chatMembersTable)
			.where(eq(chatMembersTable.userId, socket.userId));

		const roomIds = new Set();

		for (const room of userRoomsData) {
			socket.join(`room_${room.roomId}`);
      roomIds.add(room.roomId);
		}

		userRooms.set(socket.userId, roomIds);

		socket.broadcast.emit('user_online', {
      userId: socket.userId,
      username: socket.username
    });
		console.log(`User ${socket.username} joined ${roomIds.size} rooms`);
	} catch (error) {
		console.error('Error joining user rooms:', error);
    socket.emit('error', createErrorResponse(
      error,
      '加入聊天室失敗',
      'JOIN_ROOMS_FAILED'
    ));
	};
};

const handleJoinRoom = async (socket, data) => {
	try {
		const { roomId } = data;
		if (!roomId) {
      socket.emit('error', createErrorResponse(
        null,
        '聊天室 ID 不能為空',
        'INVALID_ROOM_ID'
      ));
      return;
    }

		const isMember = await verifyRoomMembership(socket.userId, roomId);
		if (!isMember) {
      socket.emit('error', createErrorResponse(
        null,
        '您不是此聊天室的成員',
        'NOT_ROOM_MEMBER'
      ));
      return;
    }

		socket.join(`room_${roomId}`);

		const recentMessages = await getRoomMessages(roomId, 50);

		socket.emit('joined_room', createSuccessResponse({
      roomId,
      messages: recentMessages
    }, '成功加入聊天室'));

    console.log(`User ${socket.username} joined room ${roomId}`);
	} catch (error) {
		console.error('Error handling join room:', error);
    socket.emit('error', createErrorResponse(
      error,
      '加入聊天室失敗',
      'JOIN_ROOM_FAILED'
    ));
	};
};

const handleLeaveRoom = (socket, data) => {
  try {
    const { roomId } = data;
    
    if (!roomId) {
      socket.emit('error', createErrorResponse(
        null,
        '聊天室 ID 不能為空',
        'INVALID_ROOM_ID'
      ));
      return;
    }

    socket.leave(`room_${roomId}`);
    socket.emit('left_room', createSuccessResponse({
      roomId
    }, '已離開聊天室'));
    
    console.log(`User ${socket.username} left room ${roomId}`);
    
  } catch (error) {
    console.error('Error handling leave room:', error);
    socket.emit('error', createErrorResponse(
      error,
      '離開聊天室失敗',
      'LEAVE_ROOM_FAILED'
    ));
  }
};

const handleTypingStart = (socket, data) => {
  try {
    const { roomId } = data;
    
    if (!roomId) return;

    socket.to(`room_${roomId}`).emit('user_typing', {
      userId: socket.userId,
      username: socket.username,
      roomId
    });
  } catch (error) {
    console.error('Error handling typing start:', error);
  }
};

const handleTypingStop = (socket, data) => {
  try {
    const { roomId } = data;
    
    if (!roomId) return;

    socket.to(`room_${roomId}`).emit('user_stop_typing', {
      userId: socket.userId,
      roomId
    });
  } catch (error) {
    console.error('Error handling typing stop:', error);
  }
};

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

const sendNotificationToUser = (io, userId, notification) => {
  const socketId = connectedUsers.get(userId);
  if (socketId) {
    io.to(socketId).emit('notification', createSuccessResponse(
      notification,
      'New notification'
    ));
  }
};

const broadcastToAll = (io, event, data) => {
  io.emit(event, createSuccessResponse(data));
};

const getOnlineUsersCount = () => {
  return connectedUsers.size;
};

const isUserOnline = (userId) => {
  return connectedUsers.has(userId);
};

export {
  initSocketService,
  sendNotificationToUser,
  broadcastToAll,
  getOnlineUsersCount,
  isUserOnline
};