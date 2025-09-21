import { z } from 'zod';

const createGroupChatSchema = z.object({
  groupName: z.string()
    .min(1, '群組名稱不能為空')
    .max(100, '群組名稱不能超過100個字元')
    .trim(),
  memberIds: z.array(z.number().int().positive())
    .max(50, '一次最多只能邀請50位成員')
    .refine((ids) => new Set(ids).size === ids.length, '成員ID不能重複')
    .optional()
    .default([])
});

const startPrivateChatSchema = z.object({
  targetUserId: z.number()
    .int()
    .positive('用戶ID必須是正整數')
});

export {
  createGroupChatSchema,
  startPrivateChatSchema
};