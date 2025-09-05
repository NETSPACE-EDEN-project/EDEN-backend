import { eq, and, desc, or, sql, inArray } from 'drizzle-orm';
import { db } from '../config/db.js';
import { chatRoomsTable, chatMembersTable, messagesTable, usersTable } from '../models/schema.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../utils/responseUtils.js';

// 獲取聊天列表
const getChatList = async (req, res) => {
  try {
    const userId = req.user.id;

    const chats = await db
      .select({
        roomId: chatRoomsTable.id,
        roomName: chatRoomsTable.roomName,
        roomType: chatRoomsTable.roomType,
        lastMessageAt: chatRoomsTable.lastMessageAt
      })
      .from(chatMembersTable)
      .innerJoin(chatRoomsTable, eq(chatMembersTable.roomId, chatRoomsTable.id))
      .where(eq(chatMembersTable.userId, userId))
      .orderBy(desc(chatRoomsTable.lastMessageAt));

    res.json(createSuccessResponse({ chats }));

  } catch (error) {
    console.error('Error getting chat list:', error);
    res.status(500).json(createErrorResponse(error, ERROR_TYPES.CHAT.LIST.GET_ROOMS_FAILED));
  }
};

// 開始私人聊天
const startPrivateChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (!targetUserId || targetUserId === userId) {
      return res.status(400).json(createErrorResponse(
        null, 
        { code: 'InvalidTargetUser', message: '無效的聊天對象' }
      ));
    }

    // 檢查目標用戶是否存在
    const [targetUser] = await db
      .select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json(createErrorResponse(
        null, 
        { code: 'UserNotFound', message: '用戶不存在' }
      ));
    }

    // 創建私人聊天室
    const [newRoom] = await db
      .insert(chatRoomsTable)
      .values({
        roomName: `與${targetUser.username}的聊天室`,
        roomType: 'private',
        createdBy: userId
      })
      .returning();

    // 添加兩個成員
    await db
      .insert(chatMembersTable)
      .values([
        { roomId: newRoom.id, userId: userId, role: 'member' },
        { roomId: newRoom.id, userId: targetUserId, role: 'member' }
      ]);

    res.status(201).json(createSuccessResponse({
      roomId: newRoom.id,
      roomName: `與${targetUser.username}的聊天室`
    }, '私人聊天室創建成功'));

  } catch (error) {
    console.error('Error starting private chat:', error);
    res.status(500).json(createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.CREATE_ROOM_FAILED));
  }
};

// 創建群組聊天
const createGroupChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupName, memberIds = [] } = req.body;

    if (!groupName?.trim()) {
      return res.status(400).json(createErrorResponse(
        null, 
        { code: 'InvalidGroupName', message: '群組名稱不能為空' }
      ));
    }

    // 創建群組
    const [newGroup] = await db
      .insert(chatRoomsTable)
      .values({
        roomName: groupName.trim(),
        roomType: 'group',
        createdBy: userId
      })
      .returning();

    // 添加創建者
    await db
      .insert(chatMembersTable)
      .values({
        roomId: newGroup.id,
        userId: userId,
        role: 'admin'
      });

    // 添加其他成員（如果有）
    if (memberIds.length > 0) {
      const memberData = memberIds.map(memberId => ({
        roomId: newGroup.id,
        userId: memberId,
        role: 'member'
      }));

      await db
        .insert(chatMembersTable)
        .values(memberData);
    }

    res.status(201).json(createSuccessResponse({
      roomId: newGroup.id,
      roomName: newGroup.roomName
    }, '群組聊天創建成功'));

  } catch (error) {
    console.error('Error creating group chat:', error);
    res.status(500).json(createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.CREATE_ROOM_FAILED));
  }
};

// 獲取聊天室訊息
const getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // 檢查用戶是否為聊天室成員
    const [membership] = await db
      .select()
      .from(chatMembersTable)
      .where(and(
        eq(chatMembersTable.userId, userId),
        eq(chatMembersTable.roomId, roomId)
      ))
      .limit(1);

    if (!membership) {
      return res.status(403).json(createErrorResponse(
        null, 
        ERROR_TYPES.CHAT.MEMBER.NOT_ROOM_MEMBER
      ));
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 獲取訊息
    const messages = await db
      .select({
        id: messagesTable.id,
        content: messagesTable.content,
        senderId: messagesTable.senderId,
        senderUsername: usersTable.username,
        createdAt: messagesTable.createdAt
      })
      .from(messagesTable)
      .leftJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
      .where(and(
        eq(messagesTable.roomId, roomId),
        eq(messagesTable.isDeleted, false)
      ))
      .orderBy(desc(messagesTable.createdAt))
      .limit(parseInt(limit))
      .offset(offset);

    // 獲取總數
    const [{ total }] = await db
      .select({ 
        total: sql`count(*)`.mapWith(Number)
      })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.roomId, roomId),
        eq(messagesTable.isDeleted, false)
      ));

    res.json(createSuccessResponse({ 
      messages: messages.reverse(),
      pagination: {
        current: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNext: parseInt(page) * parseInt(limit) < total,
        hasPrev: parseInt(page) > 1
      }
    }));

  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json(createErrorResponse(error, ERROR_TYPES.CHAT.MESSAGE.GET_MESSAGES_FAILED));
  }
};

// 搜尋用戶
const searchUsers = async (req, res) => {
  try {
    const { keyword } = req.query;
    const userId = req.user.id;

    if (!keyword?.trim()) {
      return res.status(400).json(createErrorResponse(
        null, 
        { code: 'InvalidKeyword', message: '搜尋關鍵字不能為空' }
      ));
    }

    const users = await db
      .select({
        id: usersTable.id,
        username: usersTable.username
      })
      .from(usersTable)
      .where(and(
        sql`${usersTable.username} ILIKE ${`%${keyword}%`}`,
        eq(usersTable.status, 'active'),
        sql`${usersTable.id} != ${userId}`
      ))
      .limit(10);

    res.json(createSuccessResponse({ users }));

  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json(createErrorResponse(error, ERROR_TYPES.CHAT.LIST.GET_ROOMS_FAILED));
  }
};

export {
  getChatList,
  startPrivateChat,
  createGroupChat,
  getMessages,
  searchUsers
};