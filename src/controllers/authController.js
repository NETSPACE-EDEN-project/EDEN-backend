import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import { usersTable, emailTable } from '../models/schema.js';
import { loginUser, logoutUser, verifyAuth, refreshTokenFromCookies  } from '../services/auth/authService.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../utils/responseUtils.js';
import { getFromCookies } from '../services/auth/cookieService.js';

const register = async (req, res) => {
  try {
    const { username, email, password, phone, birthday } = req.validatedData;

    const [existingEmailUser] = await db.select()
      .from(emailTable)
      .where(eq(emailTable.email, email))
      .limit(1);

    if (existingEmailUser) {
      return res.status(409).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.EMAIL_ALREADY_EXISTS
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
        verificationToken: null
      }).returning();

      return { user: newUser, emailUser };
    });

    return res.status(201).json(createSuccessResponse({
      user: {
        id: result.user.id,
        username: result.user.username,
        email,
        role: result.user.role,
        providerType: result.user.providerType,
        needsEmailVerification: true
      }
    }, '註冊成功，請檢查您的信箱進行驗證'));

  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.USER.REGISTRATION_FAILED
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
      password: emailTable.password,
      isVerifiedEmail: emailTable.isVerified
    })
    .from(usersTable)
    .innerJoin(emailTable, eq(usersTable.id, emailTable.userId))
    .where(eq(emailTable.email, email))
    .limit(1);

    if (!userWithEmail) {
      return res.status(401).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.SESSION.INVALID_CREDENTIALS
      ));
    }

    const isPasswordValid = await bcrypt.compare(password, userWithEmail.password);
    if (!isPasswordValid) {
      return res.status(401).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.SESSION.INVALID_CREDENTIALS
      ));
    }

    const { password: _, ...userForLogin } = userWithEmail;

    const loginResult = await loginUser(res, userForLogin, { 
      rememberMe,
      redirectUrl: '/dashboard' 
    });

    if (!loginResult.success) {
      return res.status(400).json(loginResult);
    }

    return res.status(200).json(createSuccessResponse({
      user: loginResult.data.user,
      redirectUrl: loginResult.data.redirectUrl
    }, '登入成功'));

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.SESSION.LOGIN_FAILED
    ));
  }
};

const logout = async (req, res) => {
  try {
    const logoutResult = await logoutUser(res);
    return res.status(200).json(logoutResult);
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.SESSION.LOGOUT_FAILED
    ));
  }
};

const getCurrentUserHandler = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.AUTHENTICATION_REQUIRED
      ));
    }

    return res.status(200).json(createSuccessResponse({
      user: req.user,
      userInfo: req.userInfo,
      isAuthenticated: req.isAuthenticated || true
    }, '獲取用戶資訊成功'));
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.SESSION.GET_USER_FAILED
    ));
  }
};

const refreshToken = async (req, res) => {
  try {
    const cookieData = getFromCookies(req);
    if (!cookieData.success || !cookieData.data.hasRememberMe || !cookieData.data.userInfo) {
      return res.status(401).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.TOKEN.NO_REFRESH_TOKEN
      ));
    }

    const refreshResult = refreshTokenFromCookies(req, res, cookieData.data.userInfo);
    if (!refreshResult.success) {
      return res.status(401).json(refreshResult);
    }

    return res.status(200).json(createSuccessResponse({
      user: refreshResult.data.user,
      refreshed: true
    }, 'Token 刷新成功'));

  } catch (error) {
    console.error('Manual refresh token error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.TOKEN.REFRESH_ERROR
    ));
  }
};

export { 
  register, 
  login, 
  logout, 
  getCurrentUserHandler, 
  refreshToken
};