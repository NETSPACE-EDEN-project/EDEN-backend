import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import { usersTable, emailTable } from '../models/schema.js';
import { loginUserService, logoutUserService, refreshTokenService, loginWithProviderService } from '../services/auth/authService.js';
import { sendMailService, generateToken, buildUrl, contentTemplate } from '../services/auth/emailService.js';
import { createSuccessResponse, createErrorResponse, ERROR_TYPES } from '../utils/responseUtils.js';
import { setAuthCookies, clearAuthCookies, getFromCookies } from '../services/auth/cookieService.js';
import { COOKIE_NAMES } from '../config/authConfig.js';
import { logger } from '../utils/logger.js';

const createExpirationTime = (hours = 24) => {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

const register = async (req, res) => {
  try {
    const { username, email, password, phone, birthday } = req.validatedData;

    const [existingEmailUser] = await db.select()
      .from(emailTable)
      .where(eq(emailTable.email, email))
      .limit(1);

    if (existingEmailUser) {
      logger.security('嘗試註冊已存在的 email');
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
      const verificationToken = generateToken();
      
      const [emailUser] = await tx.insert(emailTable).values({
        userId: newUser.id,
        email,
        password: hashedPassword,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: createExpirationTime(24),
        lastVerificationEmailSent: new Date()
      }).returning();

      return { user: newUser, emailUser, verificationToken };
    });

    const verificationUrl = buildUrl('verify-email', result.verificationToken);
    const theme = `
      <h2>哈囉 ${username}！</h2>
      <p>感謝您註冊我們的服務！請點擊下方按鈕來驗證您的信箱：</p>
    `;
    const content = contentTemplate('信箱驗證', theme, '驗證信箱', verificationUrl);
    
    sendMailService(email, '信箱驗證', content).catch(error => {
      logger.error('驗證郵件發送失敗', error);
    });

    logger.info('用戶註冊成功', { 
      username,
      providerType: 'email',
      needsVerification: true 
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
    logger.error('註冊失敗', error);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.USER.REGISTRATION_FAILED
    ));
  }
};

const login = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.validatedData;

    logger.debug('開始登入流程');

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
      isVerifiedEmail: emailTable.isVerifiedEmail
    })
    .from(usersTable)
    .innerJoin(emailTable, eq(usersTable.id, emailTable.userId))
    .where(eq(emailTable.email, email))
    .limit(1);

    if (!userWithEmail) {
      logger.security('登入失敗：用戶不存在');
      return res.status(401).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.SESSION.INVALID_CREDENTIALS
      ));
    }

    const isPasswordValid = await bcrypt.compare(password, userWithEmail.password);
    if (!isPasswordValid) {
      logger.security('登入失敗：密碼錯誤', userWithEmail.id);
      return res.status(401).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.SESSION.INVALID_CREDENTIALS
      ));
    }

    const { password: _, ...userForLogin } = userWithEmail;

    logger.debug('用戶認證成功');

    const result = await loginUserService(userForLogin, { 
      rememberMe,
      redirectUrl: '/dashboard' 
    });

    if (!result.success) {
      logger.error('登入服務失敗', { error: result.message });
      return res.status(400).json(result);
    }

    logger.debug('準備設置認證 cookies', { rememberMe });

    const cookieResult = setAuthCookies(res, userForLogin, { 
      rememberMe 
    });

    if (!cookieResult.success) {
      logger.error('設置認證 cookies 失敗', { error: cookieResult.message });
      return res.status(500).json(createErrorResponse(
        new Error('Failed to set authentication cookies'),
        ERROR_TYPES.AUTH.SESSION.LOGIN_FAILED
      ));
    }

    logger.info('用戶登入成功');
    return res.status(200).json(createSuccessResponse({
      user: result.data.user,
      redirectUrl: result.data.redirectUrl
    }, '登入成功'));

  } catch (error) {
    logger.error('登入過程發生錯誤', error);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.SESSION.LOGIN_FAILED
    ));
  }
};

const logout = async (req, res) => {
  try {
    const clearResult = clearAuthCookies(res);
    
    if (!clearResult.success) {
      logger.debug('清除 cookies 失敗，但繼續登出流程', { error: clearResult.message });
    }

    const logoutResult = logoutUserService();
    
    return res.status(200).json(logoutResult);
  } catch (error) {
    logger.error('登出失敗', error);
    clearAuthCookies(res);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.SESSION.LOGOUT_FAILED
    ));
  }
};

const refreshToken = async (req, res) => {
  try {
    const cookieData = getFromCookies(req);
    if (!cookieData.success || !cookieData.data?.hasRememberMe || !cookieData.data.userInfo) {
      logger.debug('刷新 token 失敗：無有效的 refresh token');
      return res.status(401).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.TOKEN.NO_REFRESH_TOKEN
      ));
    }

    const refreshTokenValue = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];
    if (!refreshTokenValue) {
      logger.debug('刷新 token 失敗：cookie 中無 refresh token');
      return res.status(401).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.TOKEN.NO_REFRESH_TOKEN
      ));
    }

    const result = await refreshTokenService(refreshTokenValue);
    if (!result.success) {
      clearAuthCookies(res);
      return res.status(401).json(result);
    }

    const cookieResult = setAuthCookies(res, result.data.displayInfo, { 
      rememberMe: true,
      updateRefreshToken: false
    });
    
    if (!cookieResult.success) {
      logger.debug('刷新後更新 cookies 失敗', { error: cookieResult.message });
    }

    return res.status(200).json(createSuccessResponse({
      user: result.data.displayInfo,
      refreshed: true
    }, 'Token 刷新成功'));

  } catch (error) {
    logger.error('手動刷新 token 失敗', error);
    clearAuthCookies(res);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.TOKEN.REFRESH_ERROR
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
      isAuthenticated: req.isAuthenticated || true
    }, '獲取用戶資訊成功'));
  } catch (error) {
    logger.error('獲取當前用戶失敗', error);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.SESSION.GET_USER_FAILED
    ));
  }
};

const loginWithProvider = async (req, res) => {
  try {
    const { user, provider, rememberMe, redirectUrl } = req.validatedData;

    if (!provider || !user) {
      logger.error('第三方登入參數不完整', { 
        hasProvider: !!provider, 
        hasUser: !!user 
      });
      return res.status(400).json(createErrorResponse(
        new Error('Provider and user data are required'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      ));
    }

    const result = await loginWithProviderService(user, provider, {
      rememberMe,
      redirectUrl: redirectUrl || '/dashboard'
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    const cookieResult = setAuthCookies(res, user, { 
      rememberMe 
    });
    
    if (!cookieResult.success) {
      logger.error('第三方登入設置 cookies 失敗');
      return res.status(500).json(createErrorResponse(
        new Error('Failed to set authentication cookies'),
        ERROR_TYPES.AUTH.PROVIDER.PROVIDER_LOGIN_FAILED
      ));
    }

    return res.status(200).json(createSuccessResponse({
      user: result.data.user,
      redirectUrl: result.data.redirectUrl
    }, `${provider} 登入成功`));

  } catch (error) {
    logger.error('第三方登入失敗', error);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.PROVIDER.PROVIDER_LOGIN_FAILED
    ));
  }
};

const verifyAuthStatus = async (req, res) => {
  try {
    return res.status(200).json(createSuccessResponse({
      isAuthenticated: req.isAuthenticated || false,
      user: req.user || null
    }, '認證狀態檢查完成'));
  } catch (error) {
    logger.error('驗證認證狀態失敗', error);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.TOKEN.AUTH_VERIFICATION_FAILED
    ));
  }
};

const sendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.validatedData;
    if (!email) {
      return res.status(400).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      ));
    }

    const [userWithEmail] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      email: emailTable.email,
      isVerifiedEmail: emailTable.isVerifiedEmail,
      lastVerificationEmailSent: emailTable.lastVerificationEmailSent
    })
    .from(usersTable)
    .innerJoin(emailTable, eq(usersTable.id, emailTable.userId))
    .where(eq(emailTable.email, email))
    .limit(1);

    if (!userWithEmail) {
      logger.security('嘗試發送驗證郵件給不存在的用戶');
      return res.status(404).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.USER_NOT_FOUND
      ));
    }

    if (userWithEmail.isVerifiedEmail) {
      logger.debug('嘗試發送驗證郵件給已驗證的用戶');
      return res.status(400).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.EMAIL_ALREADY_VERIFIED
      ));
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (userWithEmail.lastVerificationEmailSent && userWithEmail.lastVerificationEmailSent > fiveMinutesAgo) {
      logger.security('驗證郵件發送過於頻繁', userWithEmail.id);
      return res.status(429).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.TOO_MANY_REQUESTS
      ));
    }

    const newToken = generateToken();

    await db.transaction(async (tx) => {
      await tx.update(emailTable)
        .set({ 
          emailVerificationToken: newToken,
          emailVerificationExpires: createExpirationTime(24),
          lastVerificationEmailSent: new Date()
        })
        .where(eq(emailTable.userId, userWithEmail.id));

      const verificationUrl = buildUrl('verify-email', newToken);
      const theme = `
        <h2>哈囉 ${userWithEmail.username}！</h2>
        <p>我們已為您重新發送驗證郵件。請點擊下方按鈕來驗證您的信箱：</p>
      `;
      const content = contentTemplate('信箱驗證', theme, '驗證信箱', verificationUrl);
      
      const emailResult = await sendMailService(email, '信箱驗證', content);
      
      if (!emailResult.success) {
        throw new Error('郵件發送失敗');
      }
    });

    logger.info('重新發送驗證郵件成功');
    return res.status(200).json(createSuccessResponse(
      null,
      '驗證郵件已重新發送，請檢查您的信箱'
    ));

  } catch (error) {
    logger.error('發送驗證郵件失敗', error);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.TOKEN.EMAIL_SEND_FAILED
    ));
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.validatedData;

    if (!token) {
      return res.status(400).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      ));
    }

    const [userWithEmail] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      email: emailTable.email,
      isVerifiedEmail: emailTable.isVerifiedEmail,
      emailVerificationExpires: emailTable.emailVerificationExpires
    })
    .from(usersTable)
    .innerJoin(emailTable, eq(usersTable.id, emailTable.userId))
    .where(eq(emailTable.emailVerificationToken, token))
    .limit(1);

    if (!userWithEmail) {
      logger.security('使用無效 token 嘗試驗證 email');
      return res.status(400).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.TOKEN.INVALID_TOKEN
      ));
    }

    if (userWithEmail.isVerifiedEmail) {
      logger.debug('嘗試驗證已驗證的 email');
      return res.status(400).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.EMAIL_ALREADY_VERIFIED
      ));
    }

    if (userWithEmail.emailVerificationExpires && 
        new Date() > userWithEmail.emailVerificationExpires) {
      logger.debug('使用過期 token 嘗試驗證 email', userWithEmail.id);
      return res.status(400).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.TOKEN.TOKEN_EXPIRED
      ));
    }

    await db.update(emailTable)
      .set({ 
        isVerifiedEmail: true, 
        emailVerificationToken: null,
        emailVerificationExpires: null,
        lastVerificationEmailSent: null
      })
      .where(eq(emailTable.userId, userWithEmail.id));

    logger.info('email 驗證成功', { userId: userWithEmail.id });
    return res.status(200).json(createSuccessResponse(
      { 
        user: {
          id: userWithEmail.id,
          username: userWithEmail.username,
          email: userWithEmail.email,
          isVerifiedEmail: true
        }
      },
      '信箱驗證成功！'
    ));

  } catch (error) {
    logger.error('email 驗證失敗', error);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.TOKEN.AUTH_VERIFICATION_FAILED
    ));
  }
};

export { 
  register, 
  login, 
  logout, 
  refreshToken, 
  getCurrentUserHandler, 
  loginWithProvider, 
  verifyAuthStatus,
  sendVerificationEmail,
  verifyEmail
};