import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../config/db.js';
import { chatRoomsTable, chatMembersTable, messagesTable, usersTable } from '../models/schema.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../utils/responseUtils.js';

// 獲取聊天室列表
const getChatList = async (req, res) => {
  try {
    const userId = req.user.id;

    const chats = await db
      .select({
        roomId: chatRoomsTable.id,
        roomName: chatRoomsTable.roomName,
        roomType: chatRoomsTable.roomType,
        lastMessageAt: chatRoomsTable.lastMessageAt,
        lastMessage: sql`
          (SELECT content FROM ${messagesTable} 
            WHERE room_id = ${chatRoomsTable.id} 
            AND is_deleted = false 
            ORDER BY created_at DESC 
            LIMIT 1)
          `.as('lastMessage'),
        unreadCount: sql`
          COALESCE(
            (SELECT COUNT(*) 
              FROM ${messagesTable} m 
              WHERE m.room_id = ${chatRoomsTable.id} 
              AND m.created_at > COALESCE(${chatMembersTable.lastReadAt}, '1970-01-01')
              AND m.sender_id != ${userId}
              AND m.is_deleted = false
            ), 0
          )`.mapWith(Number)
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

    console.log('Starting private chat:', { userId, targetUserId });

    if (!targetUserId || targetUserId === userId) {
      return res.status(400).json(createErrorResponse(
        null, 
        { code: 'InvalidTargetUser', message: '無效的聊天對象' }
      ));
    }

    // 檢查目標用戶
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

    console.log('Target user found:', targetUser);

    const existingRoomQuery = await db
      .select({
        roomId: chatRoomsTable.id,
        roomName: chatRoomsTable.roomName
      })
      .from(chatRoomsTable)
      .where(and(
        eq(chatRoomsTable.roomType, 'private'),
        sql`EXISTS (
          SELECT 1 FROM ${chatMembersTable} m1 
          WHERE m1.room_id = ${chatRoomsTable.id} 
          AND m1.user_id = ${userId}
        )`,
        sql`EXISTS (
          SELECT 1 FROM ${chatMembersTable} m2 
          WHERE m2.room_id = ${chatRoomsTable.id} 
          AND m2.user_id = ${targetUserId}
        )`,
        sql`(
          SELECT COUNT(*) FROM ${chatMembersTable} m3 
          WHERE m3.room_id = ${chatRoomsTable.id}
        ) = 2`
      ))
      .limit(1);

    console.log('Existing room query result:', existingRoomQuery);

    if (existingRoomQuery.length > 0) {
      const existingRoom = existingRoomQuery[0];
      return res.json(createSuccessResponse({
        roomId: existingRoom.roomId,
        roomName: existingRoom.roomName,
        isNew: false
      }, '私人聊天室已存在'));
    }

    // 創建新聊天室
    const result = await db.transaction(async (tx) => {
      console.log('Creating new room...');
      
      const [newRoom] = await tx
        .insert(chatRoomsTable)
        .values({
          roomName: `${targetUser.username}`,
          roomType: 'private',
          createdBy: userId
        })
        .returning();

      console.log('New room created:', newRoom); 

      await tx
        .insert(chatMembersTable)
        .values([
          { roomId: newRoom.id, userId: userId, role: 'member' },
          { roomId: newRoom.id, userId: targetUserId, role: 'member' }
        ]);

      console.log('Members added to room');

      return newRoom;
    });

    res.status(201).json(createSuccessResponse({
      roomId: result.id,
      roomName: result.roomName,
      isNew: true
    }, '私人聊天室創建成功'));

  } catch (error) {
    console.error('Error starting private chat:', error);
    console.error('Error stack:', error.stack);
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

    // 驗證成員存在
    if (memberIds.length > 0) {
      const validMembers = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(inArray(usersTable.id, memberIds));

      if (validMembers.length !== memberIds.length) {
        return res.status(400).json(createErrorResponse(
          null,
          { code: 'InvalidMembers', message: '部分成員不存在' }
        ));
      }
    }

    // 創建群組
    const result = await db.transaction(async (tx) => {
      const [newGroup] = await tx
        .insert(chatRoomsTable)
        .values({
          roomName: groupName.trim(),
          roomType: 'group',
          createdBy: userId
        })
        .returning();

      const memberData = [{ roomId: newGroup.id, userId: userId, role: 'admin' }];
      
      if (memberIds.length > 0) {
        const otherMembers = memberIds
          .filter(id => id !== userId)
          .map(memberId => ({
            roomId: newGroup.id,
            userId: memberId,
            role: 'member'
          }));
        memberData.push(...otherMembers);
      }

      await tx.insert(chatMembersTable).values(memberData);
      return newGroup;
    });

    res.status(201).json(createSuccessResponse({
      roomId: result.id,
      roomName: result.roomName
    }, '群組聊天創建成功'));

  } catch (error) {
    console.error('Error creating group chat:', error);
    res.status(500).json(createErrorResponse(error, ERROR_TYPES.CHAT.ROOM.CREATE_ROOM_FAILED));
  }
};

// 獲取訊息
const getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // 檢查成員資格
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

    // 更新已讀狀態
    await db
      .update(chatMembersTable)
      .set({ lastReadAt: new Date() })
      .where(and(
        eq(chatMembersTable.userId, userId),
        eq(chatMembersTable.roomId, roomId)
      ));

    res.json(createSuccessResponse({ 
      messages: messages.reverse(),
      pagination: {
        current: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
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

// 獲取房間資訊
const getRoomInfo = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;

    // 檢查成員資格
    const [membership] = await db
      .select({ role: chatMembersTable.role })
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

    // 獲取成員列表
    const members = await db
      .select({
        userId: chatMembersTable.userId,
        username: usersTable.username,
        role: chatMembersTable.role
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
    console.error('Error getting room info:', error);
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