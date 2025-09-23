import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { messagesTable, chatRoomsTable, chatMembersTable, usersTable } from '../models/tables/tables.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../utils/responseUtils.js';

// ==================== 獲得聊天列表 ====================
const getChatList = async (req, res) => {
  try {
    const userId = req.user.id;

    const chatrooms = await db
      .select({
        roomId: chatRoomsTable.id,
        roomName: chatRoomsTable.roomName,
        roomType: chatRoomsTable.roomType,
        lastMessageAt: chatRoomsTable.lastMessageAt,
        lastMessage: sql`
          (SELECT content FROM ${messagesTable} 
            WHERE room_id = ${chatRoomsTable.id} AND is_deleted = false 
            ORDER BY created_at DESC LIMIT 1)
        `.as('lastMessage')
      })
      .from(chatMembersTable)
      .innerJoin(chatRoomsTable, eq(chatMembersTable.roomId, chatRoomsTable.id))
      .where(eq(chatMembersTable.userId, userId))
      .orderBy(desc(chatRoomsTable.lastMessageAt));

    res.json(createSuccessResponse({ chatrooms }));

  } catch (error) {
    console.error('獲取聊天列表失敗:', error);
    res.status(500).json(createErrorResponse(error, ERROR_TYPES.CHAT.LIST.GET_ROOMS_FAILED));
  }
};

// ==================== 開始私人聊天 ====================
const startPrivateChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.validatedData;

    // 檢查是否與自己聊天
    if (targetUserId === userId) {
      return res.status(400).json(createErrorResponse(null, ERROR_TYPES.CHAT.ROOM.INVALID_MEMBER_IDS));
    }

    // 檢查目標用戶是否存在
    const [targetUser] = await db
      .select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json(createErrorResponse(null, ERROR_TYPES.AUTH.USER.USER_NOT_FOUND));
    }

    // 檢查是否已存在私人聊天室
    const [existingRoom] = await db
      .select({ roomId: chatRoomsTable.id, roomName: chatRoomsTable.roomName })
      .from(chatRoomsTable)
      .where(and(
        eq(chatRoomsTable.roomType, 'private'),
        sql`EXISTS (SELECT 1 FROM ${chatMembersTable} m1 WHERE m1.room_id = ${chatRoomsTable.id} AND m1.user_id = ${userId})`,
        sql`EXISTS (SELECT 1 FROM ${chatMembersTable} m2 WHERE m2.room_id = ${chatRoomsTable.id} AND m2.user_id = ${targetUserId})`,
        sql`(SELECT COUNT(*) FROM ${chatMembersTable} m3 WHERE m3.room_id = ${chatRoomsTable.id}) = 2`
      ))
      .limit(1);

    if (existingRoom) {
      return res.json(createSuccessResponse({
        roomId: existingRoom.roomId,
        roomName: existingRoom.roomName,
        isNew: false
      }, '私人聊天室已存在'));
    }

    // 創建新的私人聊天室
    const newRoom = await db.transaction(async (tx) => {
      const [room] = await tx.insert(chatRoomsTable).values({
        roomName: targetUser.username,
        roomType: 'private',
        createdBy: userId
      }).returning();

      await tx.insert(chatMembersTable).values([
        { roomId: room.id, userId, role: 'member' },
        { roomId: room.id, userId: targetUserId, role: 'member' }
      ]);

      return room;
    });

    res.status(201).json(createSuccessResponse({
      roomId: newRoom.id,
      roomName: newRoom.roomName,
      isNew: true
    }, '私人聊天室創建成功'));

  } catch (error) {
    console.error('創建私人聊天失敗:', error);
    res.status(500).json(createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.CREATE_ROOM_FAILED));
  }
};

// ==================== 創建群組聊天室 ====================
const createGroupChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupName, memberIds } = req.validatedData;

    const result = await db.transaction(async (tx) => {
      // 創建群組
      const [newGroup] = await tx.insert(chatRoomsTable).values({
        roomName: groupName.trim(),
        roomType: 'group',
        createdBy: userId
      }).returning();

      // 準備成員資料
      const memberData = [{ roomId: newGroup.id, userId, role: 'admin' }];
      memberIds.filter(id => id !== userId).forEach(id => {
        memberData.push({ roomId: newGroup.id, userId: id, role: 'member' });
      });

      await tx.insert(chatMembersTable).values(memberData);
      return newGroup;
    });

    res.status(201).json(createSuccessResponse({
      roomId: result.id,
      roomName: result.roomName
    }, '群組聊天室創建成功'));

  } catch (error) {
    console.error('創建群組聊天失敗:', error);
    res.status(500).json(createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.CREATE_ROOM_FAILED));
  }
};

// ==================== 獲取訊息 ====================
const getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // 驗證用戶是否為房間成員
    const [membership] = await db
      .select()
      .from(chatMembersTable)
      .where(and(
        eq(chatMembersTable.userId, userId), 
        eq(chatMembersTable.roomId, roomId)
      ))
      .limit(1);

    if (!membership) {
      return res.status(403).json(createErrorResponse(null, ERROR_TYPES.CHAT.MEMBER.NOT_ROOM_MEMBER));
    }

    const offset = (page - 1) * limit;

    // 獲取訊息 - 移除回覆相關欄位
    const messages = await db
      .select({
        id: messagesTable.id,
        content: messagesTable.content,
        senderId: messagesTable.senderId,
        senderUsername: usersTable.username,
        messageType: messagesTable.messageType,
        createdAt: messagesTable.createdAt,
        isDeleted: messagesTable.isDeleted
      })
      .from(messagesTable)
      .leftJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
      .where(and(
        eq(messagesTable.roomId, roomId), 
        eq(messagesTable.isDeleted, false)
      ))
      .orderBy(desc(messagesTable.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    // 獲取總數量
    const [{ total }] = await db
      .select({ total: sql`count(*)`.mapWith(Number) })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.roomId, roomId), 
        eq(messagesTable.isDeleted, false)
      ));

    res.json(createSuccessResponse({
      messages: messages.reverse(),
      pagination: { 
        current: Number(page), 
        limit: Number(limit), 
        total, 
        totalPages: Math.ceil(total / Number(limit)) 
      }
    }));

  } catch (error) {
    console.error('獲取訊息失敗:', error);
    res.status(500).json(createErrorResponse(error, ERROR_TYPES.CHAT.MESSAGE.GET_MESSAGES_FAILED));
  }
};

// ==================== 搜尋用戶 ====================
const searchUsers = async (req, res) => {
  try {
    const { keyword } = req.query;
    const userId = req.user.id;

    if (!keyword?.trim()) {
      return res.status(400).json(createErrorResponse(null, ERROR_TYPES.AUTH.USER.INVALID_USER_INFO));
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
    console.error('搜尋用戶失敗:', error);
    res.status(500).json(createErrorResponse(error, ERROR_TYPES.CHAT.LIST.GET_ROOMS_FAILED));
  }
};

// ==================== 獲取房間資訊 ====================
const getRoomInfo = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;

    // 驗證用戶權限
    const [membership] = await db
      .select({ role: chatMembersTable.role })
      .from(chatMembersTable)
      .where(and(
        eq(chatMembersTable.userId, userId), 
        eq(chatMembersTable.roomId, roomId)
      ))
      .limit(1);

    if (!membership) {
      return res.status(403).json(createErrorResponse(null, ERROR_TYPES.CHAT.MEMBER.NOT_ROOM_MEMBER));
    }

    // 獲取房間資訊
    const [roomInfo] = await db
      .select({
        id: chatRoomsTable.id,
        roomName: chatRoomsTable.roomName,
        roomType: chatRoomsTable.roomType,
        createdAt: chatRoomsTable.createdAt
      })
      .from(chatRoomsTable)
      .where(eq(chatRoomsTable.id, roomId))
      .limit(1);

    // 獲取成員資訊
    const members = await db
      .select({
        userId: chatMembersTable.userId,
        username: usersTable.username,
        role: chatMembersTable.role,
        joinedAt: chatMembersTable.joinedAt
      })
      .from(chatMembersTable)
      .innerJoin(usersTable, eq(chatMembersTable.userId, usersTable.id))
      .where(eq(chatMembersTable.roomId, roomId));

    res.json(createSuccessResponse({ 
      room: roomInfo, 
      members, 
      userRole: membership.role 
    }));

  } catch (error) {
    console.error('獲取房間資訊失敗:', error);
    res.status(500).json(createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.ROOM_NOT_FOUND));
  }
};

export {
  getChatList,
  startPrivateChat,
  createGroupChat,
  getMessages,
  searchUsers,
  getRoomInfo
};