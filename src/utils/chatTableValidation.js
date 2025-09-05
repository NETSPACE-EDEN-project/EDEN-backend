import { z } from 'zod';

// 創建群組聊天驗證
const createGroupChatSchema = z.object({
  groupName: z.string()
    .min(1, '群組名稱不能為空')
    .max(100, '群組名稱不能超過100個字元')
    .trim(),
  memberIds: z.array(z.number().int().positive())
    .max(50, '一次最多只能邀請50位成員')
    .optional()
    .default([])
});

// 開始私人聊天驗證
const startPrivateChatSchema = z.object({
  targetUserId: z.number()
    .int()
    .positive('用戶ID必須是正整數')
});

export {
  createGroupChatSchema,
  startPrivateChatSchema
};