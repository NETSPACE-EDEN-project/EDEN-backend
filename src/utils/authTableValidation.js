import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('email 格式不正確'),
  password: z.string().min(1, '密碼不能為空'),
  rememberMe: z.boolean().default(false)
});

const registerSchema = z.object({
  username: z.string()
    .min(1, '用戶名不能為空')
    .max(100, '用戶名不能超過100個字符')
    .trim(),
  email: z.string()
    .email('email 格式不正確')
    .max(100, 'email 不能超過100個字符')
    .toLowerCase(),
  password: z.string()
    .min(8, '密碼至少需要8個字符')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, '密碼必須包含大小寫字母和數字'),
  confirmPassword: z.string(),
  phone: z.string()
    .max(20, '電話號碼不能超過20個字符')
    .regex(/^[\d\-\+\(\)\s]*$/, '電話號碼格式不正確')
    .optional()
    .or(z.literal('')),
  birthday: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '生日格式必須為 YYYY-MM-DD')
    .optional()
    .or(z.literal(''))
}).refine(data => data.password === data.confirmPassword, {
  message: '確認密碼不一致',
  path: ['confirmPassword']
});

const forgotPasswordSchema = z.object({
  email: z.string()
    .min(1, 'Email 不能為空')
    .email('Email 格式不正確')
    .max(100, 'Email 長度不可超過 100 個字元')
});

const sendEmailSchema = z.object({
  email: z.string()
    .min(1, 'Email 不能為空')
    .email('Email 格式不正確')
    .max(100, 'Email 長度不可超過 100 個字元')
});

const resetPasswordSchema = z.object({
  password: z.string()
    .min(6, '密碼至少需要 6 個字元')
    .max(128, '密碼不可超過 128 個字元')
});

const verifyEmailSchema = z.object({
  token: z.string()
    .min(1, 'Token 不能為空')
    .length(64, 'Token 格式不正確')
    .regex(/^[a-f0-9]{64}$/, 'Token 必須是64位的十六進制字符')
});

export {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  sendEmailSchema,
  verifyEmailSchema
};