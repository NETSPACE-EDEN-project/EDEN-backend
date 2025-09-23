import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { usersTable, emailTable } from '../../models/schema.js';
import { JWT_CONFIG, COOKIE_NAMES } from '../../config/authConfig.js';
import { buildTokenPayload, isTokenExpiringSoon } from '../../utils/tokenUtils.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/responseUtils.js';
import { logger } from '../../utils/logger.js';

const generateAccessToken = (user) => {
  try {
    const payload = buildTokenPayload(user, 'access');
    const token = jwt.sign(payload, JWT_CONFIG.access.secret, { 
      expiresIn: JWT_CONFIG.access.expiresIn 
    });

    logger.debug('生成 accessToken 成功');
    return createSuccessResponse(token, '生成 accessToken 成功');
  } catch (error) {
    logger.error('生成 accessToken 失敗', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.GENERATE_ACCESS_TOKEN_ERROR);
  }
};

const generateRefreshToken = (user) => {
  try {
    const payload = buildTokenPayload(user, 'refresh');
    const token = jwt.sign(payload, JWT_CONFIG.refresh.secret, { 
      expiresIn: JWT_CONFIG.refresh.expiresIn 
    });

    logger.debug('生成 refreshToken 成功');
    return createSuccessResponse(token, '生成 refreshToken 成功');
  } catch (error) {
    logger.error('生成 refreshToken 失敗', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.GENERATE_REFRESH_TOKEN_ERROR);
  }
};

const generateTokenPair = (user) => {
  logger.debug('開始生成 token pair');
  
  try {
    const accessResult = generateAccessToken(user);
    if (!accessResult.success) {
      logger.error('生成 accessToken 失敗', { error: accessResult.message });
      return accessResult;
    }
    
    const refreshResult = generateRefreshToken(user);
    if (!refreshResult.success) {
      logger.error('生成 refreshToken 失敗', { error: refreshResult.message });
      return refreshResult;
    }

    logger.debug('Token pair 生成成功');
    return createSuccessResponse({ 
      accessToken: accessResult.data, 
      refreshToken: refreshResult.data 
    }, '生成 tokenPair 成功');
  } catch (error) {
    logger.error('生成 token pair 過程發生錯誤', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.GENERATE_TOKEN_PAIR_ERROR);
  }
};

const verifyToken = (token, tokenType) => {
  try {
    if (!token) {
      return createErrorResponse(
        new Error('Token is required'), 
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    const config = tokenType === 'access' ? JWT_CONFIG.access : JWT_CONFIG.refresh;
    const decoded = jwt.verify(token, config.secret);

    if (decoded.type !== tokenType) {
      logger.security(`Token 類型不匹配 - 期望: ${tokenType}, 實際: ${decoded.type}`);
      return createErrorResponse(
        new Error('Invalid token type'), 
        ERROR_TYPES.AUTH.TOKEN.INVALID_TOKEN_TYPE
      );
    }
    
    return createSuccessResponse(decoded, `成功驗證 ${tokenType} Token`);
  } catch (error) {
    logger.debug(`${tokenType} Token 驗證失敗`, { reason: error.message });
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.AUTH_VERIFICATION_FAILED);
  }
};

const verifyAccessToken = (token) => verifyToken(token, 'access');

const verifyRefreshToken = (token) => verifyToken(token, 'refresh');

const refreshAccessToken = async (refreshToken) => {
  try {
    if (!refreshToken) {
      return createErrorResponse(
        new Error('Refresh token is required'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    logger.debug('開始刷新 access token');

    const refreshResult = verifyRefreshToken(refreshToken);
    if (!refreshResult.success) {
      logger.debug('Refresh token 驗證失敗');
      return refreshResult;
    }

    const refreshData = refreshResult.data;
    const userId = refreshData.id;

    const [user] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      email: emailTable.email,
      avatarUrl: usersTable.avatarUrl || null,
      role: usersTable.role,
      status: usersTable.status,
      providerType: usersTable.providerType,
    })
    .from(usersTable)
    .leftJoin(emailTable, eq(usersTable.id, emailTable.userId))
    .where(eq(usersTable.id, userId))
    .limit(1);

    if (!user) {
      logger.security('嘗試刷新不存在用戶的 token', userId);
      return createErrorResponse(
        new Error('User does not exist'),
        ERROR_TYPES.AUTH.USER.INVALID_USER_INFO
      );
    }

    const userForToken = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status || 'active',
      providerType: user.providerType
    };

    const accessResult = generateAccessToken(userForToken);
    if (!accessResult.success) {
      return accessResult;
    }

    logger.info('Access token 刷新成功');
    return createSuccessResponse({ 
      accessToken: accessResult.data, 
      userId: user.id,
      user: userForToken
    });
  } catch (error) {
    logger.error('刷新 access token 失敗', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.REFRESH_ERROR);
  }
};

const shouldRefreshToken = (req) => {
  try {
    const authToken = req.signedCookies?.[COOKIE_NAMES.AUTH_TOKEN];
    const refreshToken = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];

    if (!authToken && !refreshToken) {
      return { 
        shouldRefresh: false, 
        reason: 'No tokens available' 
      };
    }

    if (!authToken && refreshToken) {
      const refreshVerifyResult = verifyRefreshToken(refreshToken);
      if (!refreshVerifyResult.success) {
        return { 
          shouldRefresh: false, 
          reason: 'Refresh token invalid' 
        };
      }
      return { 
        shouldRefresh: true, 
        reason: 'No access token but has valid refresh token' 
      };
    }

    if (isTokenExpiringSoon(authToken)) {
      if (!refreshToken) {
        return { 
          shouldRefresh: false, 
          reason: 'Token expiring but no refresh token' 
        };
      }

      const refreshVerifyResult = verifyRefreshToken(refreshToken);
      if (!refreshVerifyResult.success) {
        return { 
          shouldRefresh: false, 
          reason: 'Token expiring and refresh token invalid' 
        };
      }

      return { 
        shouldRefresh: true, 
        reason: 'Token expiring soon and refresh token valid' 
      };
    }

    const verifyResult = verifyAccessToken(authToken);
    if (!verifyResult.success) {
      if (!refreshToken) {
        return { 
          shouldRefresh: false, 
          reason: 'Access token invalid and no refresh token' 
        };
      }

      const refreshVerifyResult = verifyRefreshToken(refreshToken);
      if (!refreshVerifyResult.success) {
        return { 
          shouldRefresh: false, 
          reason: 'Both tokens invalid' 
        };
      }

      return { 
        shouldRefresh: true, 
        reason: 'Access token invalid but refresh token valid' 
      };
    }

    return { 
      shouldRefresh: false, 
      reason: 'Access token valid' 
    };
  } catch (error) {
    logger.error('檢查 token 刷新狀態失敗', error);
    return { 
      shouldRefresh: false, 
      reason: 'Token validation check failed',
      error: error.message 
    };
  }
};

export {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  refreshAccessToken,
  shouldRefreshToken
};