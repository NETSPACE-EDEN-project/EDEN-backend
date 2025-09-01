import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import { usersTable, emailTable, lineTable } from '../models/schema.js';
import { loginUser, logoutUser, verifyAuth } from '../services/authService.js';
import { createErrorResponse, createSuccessResponse } from '../utils/errorUtils.js';

const register = async (req, res) => {
	try {
		const{ username, email, password, confirmPassword, phone, birthday } = req.validatedData;

		const [existingEmailUser] = await db.select()
      .from(emailTable)
      .where(eq(emailTable.email, email))
      .limit(1);

    if (existingEmailUser) {
      return res.status(409).json(createErrorResponse(
        null,
        '此信箱已被註冊',
        'EMAIL_ALREADY_EXISTS'
      ));
    }

		const result = await db.transaction(async (tx) => {
      const [newUser] = await tx.insert(usersTable).values({
        username,
        phone: phone || null,
        birthday: birthday || null,
        role: 'user',
        providerType: 'email',
        status: 'active'
      }).returning();

      const hashedPassword = await bcrypt.hash(password, 10);
      const [emailUser] = await tx.insert(emailTable).values({
        userId: newUser.id,
        email,
        password: hashedPassword,
      }).returning();

      return { user: newUser, emailUser }
    })

    return res.status(201).json(createSuccessResponse({
      user: {
        id: result.user.id,
        username: result.user.username,
        email,
        role: result.user.role,
        providerType: result.user.providerType
      },
      message: '註冊成功！請檢查您的信箱進行驗證'
    }, '註冊成功'));
	} catch (error) {
    console.error('Register error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      '註冊失敗，請稍後再試',
      'REGISTRATION_FAILED'
    ));
  }
};

const login = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.validatedData;

    const [userWithEmail] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      phone: usersTable.phone,
      birthday: usersTable.birthday,
      avatarUrl: usersTable.avatarUrl,
      role: usersTable.role,
      providerType: usersTable.providerType,
      status: usersTable.status,
      email: emailTable.email,
      password: emailTable.password
    })
    .from(usersTable)
    .innerJoin(eq(usersTable.id, emailTable.userId))
    .where(eq(emailTable.email, email))
    .limit(1);

    if (!userWithEmail) {
      return res.status(401).json(createErrorResponse(
        null,
        '帳號或密碼錯誤',
        'INVALID_CREDENTIALS'
      ));
    }

    const isPasswordValid = await bcrypt.compare(password, userWithEmail.password);
    if (!isPasswordValid) {
      return res.status(401).json(createErrorResponse(
        null,
        '帳號或密碼錯誤',
        'INVALID_CREDENTIALS'
      ));
    }

    const loginResult = await loginUser(res, userWithEmail, { 
      rememberMe,
      redirectUrl: '/dashboard' 
    })

    if (!loginResult.success) {
      return res.status(400).json(loginResult);
    }

    return res.json(loginResult);
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      '登入失敗，請稍後再試',
      'LOGIN_FAILED'
    ));
  }
}

const logout = async (req, res) => {
  try {
    const logoutResult = await logoutUser(res);
    return res.json(logoutResult);
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      '登出失敗',
      'LOGOUT_FAILED'
    ));
  }
};

const getCurrentUser = async (req, res) => {
  try {
    return res.json(createSuccessResponse({
      user: req.user,
      userInfo: req.userInfo
    }, '獲取用戶資訊成功'));
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      '獲取用戶資訊失敗',
      'GET_USER_FAILED'
    ));
  }
};

const refreshToken = async (req, res) => {
  try {
    const authResult = await verifyAuth(req, res);
    
    if (!authResult.success) {
      return res.status(401).json(authResult);
    }

    return res.json(createSuccessResponse({
      user: authResult.data.user,
      refreshed: authResult.data.refreshed || false
    }, 'Token 刷新成功'));

  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      'Token 刷新失敗',
      'REFRESH_TOKEN_FAILED'
    ));
  }
};

export { register, login, logout, getCurrentUser, refreshToken };