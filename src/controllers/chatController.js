import { eq, and, desc } from 'drizzle-orm';
import { chatRoomsTable, chatMembersTable, messagesTable, usersTable } from '../models/schema.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../utils/errorUtils.js';
import { db } from '../config/db.js';

const createChatRoom = async (req, res) => {
	try {
		const { name, description, roomType = 'group', memberIds = [] } = req.validatedData;
    const createdBy = req.user.id;

		if (!Array.isArray(memberIds)) {
      return res.status(400).json(createErrorResponse(
        null,
        '成員列表格式不正確',
        'INVALID_MEMBER_IDS'
      ));
    }

		const result = await db.transaction(async (tx) => {
			const [newRoom] = await tx.insert(chatRoomsTable).values({
        name,
        description,
        roomType,
        createdBy
      }).returning();

			await tx.insert(chatMembersTable).values({
        roomId: newRoom.id,
        userId: createdBy,
        role: 'admin'
      });

			if (memberIds.length > 0) {
        const memberValues = memberIds.map(userId => ({
          roomId: newRoom.id,
          userId: parseInt(userId),
          role: 'member'
        }));
        await tx.insert(chatMembersTable).values(memberValues);
      }

			return newRoom;
		});

		return res.status(201).json(createSuccessResponse({
      room: result,
      memberCount: memberIds.length + 1
    }, '聊天室創建成功'));
	} catch (error) {
		console.error('Create chat room error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      '創建聊天室失敗',
      ERROR_TYPES.CREATE_ROOM_FAILED
    ));
	}
};

const getUserChatRooms = async (req, res) => {
	try {
		const userId = req.user.id;

		const rooms = await db
      .select({
        id: chatRoomsTable.id,
        name: chatRoomsTable.name,
        description: chatRoomsTable.description,
        roomType: chatRoomsTable.roomType,
        createdAt: chatRoomsTable.createdAt,
        memberRole: chatMembersTable.role,
        lastReadAt: chatMembersTable.lastReadAt
      })
      .from(chatRoomsTable)
      .innerJoin(chatMembersTable, eq(chatRoomsTable.id, chatMembersTable.roomId))
      .where(and(
        eq(chatMembersTable.userId, userId),
        eq(chatRoomsTable.isActive, true)
      ))
      .orderBy(desc(chatRoomsTable.updatedAt));

		return res.json(createSuccessResponse({ 
      rooms,
      totalCount: rooms.length
    }, '獲取聊天室列表成功'));
	} catch (error) {
		console.error('Get user chat rooms error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      '獲取聊天室列表失敗',
      ERROR_TYPES.GET_ROOMS_FAILED
    ));
	};
};

const getRoomMessages = async (req, res) => {
	try {
		const { roomId } = req.params;
		const { page = 1, limit = 50 } = req.query;
		const userId = req.user.id;
		const roomIdInt = parseInt(roomId);
    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);

		if (isNaN(roomIdInt) || roomIdInt <= 0) {
      return res.status(400).json(createErrorResponse(
        null,
        '無效的聊天室 ID',
        'INVALID_ROOM_ID'
      ));
    }

		if (pageInt < 1 || limitInt < 1 || limitInt > 100) {
      return res.status(400).json(createErrorResponse(
        null,
        '無效的分頁參數',
        'INVALID_PAGINATION'
      ));
    }

		const [membership] = await db
      .select()
      .from(chatMembersTable)
      .where(and(
        eq(chatMembersTable.userId, userId),
        eq(chatMembersTable.roomId, roomIdInt)
      ))
      .limit(1);

			if (!membership) {
      return res.status(403).json(createErrorResponse(
        null,
        '您不是此聊天室的成員',
        'NOT_ROOM_MEMBER'
      ));
    }

		const offset = (pageInt - 1) * limitInt;

			const messages = await db
      .select({
        id: messagesTable.id,
        content: messagesTable.content,
        type: messagesTable.type,
        replyToId: messagesTable.replyToId,
        isEdited: messagesTable.isEdited,
        createdAt: messagesTable.createdAt,
        sender: {
          id: usersTable.id,
          username: usersTable.username,
          avatarUrl: usersTable.avatarUrl,
          role: usersTable.role
        }
      })
      .from(messagesTable)
      .innerJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
      .where(and(
        eq(messagesTable.roomId, roomIdInt),
        eq(messagesTable.isDeleted, false)
      ))
      .orderBy(desc(messagesTable.createdAt))
      .limit(limitInt)
      .offset(offset);

			return res.json(createSuccessResponse({
      messages: messages.reverse(),
      pagination: {
        page: pageInt,
        limit: limitInt,
        hasMore: messages.length === limitInt
      }
    }, '獲取訊息成功'));
	} catch (error) {
		console.error('Get room messages error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      '獲取訊息失敗',
      'GET_MESSAGES_FAILED'
    ));
	};
};

const joinChatRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;
    const roomIdInt = parseInt(roomId);

    if (isNaN(roomIdInt) || roomIdInt <= 0) {
      return res.status(400).json(createErrorResponse(
        null,
        '無效的聊天室 ID',
        'INVALID_ROOM_ID'
      ));
    }

    const [room] = await db
      .select()
      .from(chatRoomsTable)
      .where(and(
        eq(chatRoomsTable.id, roomIdInt),
        eq(chatRoomsTable.isActive, true)
      ))
      .limit(1);

    if (!room) {
      return res.status(404).json(createErrorResponse(
        null,
        '聊天室不存在',
        'ROOM_NOT_FOUND'
      ));
    }

    const [existingMember] = await db
      .select()
      .from(chatMembersTable)
      .where(and(
        eq(chatMembersTable.roomId, roomIdInt),
        eq(chatMembersTable.userId, userId)
      ))
      .limit(1);

    if (existingMember) {
      return res.status(400).json(createErrorResponse(
        null,
        '您已經是此聊天室的成員',
        'ALREADY_MEMBER'
      ));
    }

    await db.insert(chatMembersTable).values({
      roomId: roomIdInt,
      userId,
      role: 'member'
    });

    return res.json(createSuccessResponse({
      roomId: roomIdInt,
      role: 'member'
    }, '成功加入聊天室'));

  } catch (error) {
    console.error('Join chat room error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      '加入聊天室失敗',
      'JOIN_ROOM_FAILED'
    ));
  }
};

export {
  createChatRoom,
  getUserChatRooms,
  getRoomMessages,
  joinChatRoom
};