import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { usersTable, emailTable } from '../../models/schema.js';
import { JWT_CONFIG, COOKIE_NAMES } from '../../config/authConfig.js';
import { buildTokenPayload, isTokenExpiringSoon } from '../../utils/tokenUtils.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/responseUtils.js';

const generateAccessToken = (user) => {
  try {
    const payload = buildTokenPayload(user, 'access');
    const token = jwt.sign(payload, JWT_CONFIG.access.secret, { 
      expiresIn: JWT_CONFIG.access.expiresIn 
    });

    return createSuccessResponse(token, '生成 accessToken 成功');
  } catch (error) {
    console.error('Error generating access token:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.GENERATE_ACCESS_TOKEN_ERROR);
  }
};

const generateRefreshToken = (user) => {
  try {
    const payload = buildTokenPayload(user, 'refresh');
    const token = jwt.sign(payload, JWT_CONFIG.refresh.secret, { 
      expiresIn: JWT_CONFIG.refresh.expiresIn 
    });

    return createSuccessResponse(token, '生成 refreshToken 成功');
  } catch (error) {
    console.error('Error generating refresh token:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.GENERATE_REFRESH_TOKEN_ERROR);
  }
};

const generateTokenPair = (user) => {
  console.log('=== generateTokenPair START ===');
  console.log('User for token generation:', { id: user?.id, email: user?.email });
  
  try {
    console.log('Generating access token...');
    const accessResult = generateAccessToken(user);
    console.log('Access token generation success:', accessResult.success);
    if (!accessResult.success) {
      console.log('Access token error:', accessResult);
    }
    
    console.log('Generating refresh token...');
    const refreshResult = generateRefreshToken(user);
    console.log('Refresh token generation success:', refreshResult.success);
    if (!refreshResult.success) {
      console.log('Refresh token error:', refreshResult);
    }

    if (!accessResult.success) return accessResult;
    if (!refreshResult.success) return refreshResult;

    console.log('=== generateTokenPair SUCCESS ===');
    return createSuccessResponse({ 
      accessToken: accessResult.data, 
      refreshToken: refreshResult.data 
    }, '生成 tokenPair 成功');
  } catch (error) {
    console.error('=== generateTokenPair ERROR ===', error);
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
      return createErrorResponse(
        new Error('Invalid token type'), 
        ERROR_TYPES.AUTH.TOKEN.INVALID_TOKEN_TYPE
      );
    }
    
    return createSuccessResponse(decoded, `成功驗證 ${tokenType} Token`);
  } catch (error) {
    console.error(`${tokenType} Token verification failed:`, error.message);
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

    const refreshResult = verifyRefreshToken(refreshToken);
    if (!refreshResult.success) {
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
      return createErrorResponse(
        new Error('User is not exist'),
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

    return createSuccessResponse({ 
      accessToken: accessResult.data, 
      userId: user.id,
      user: userForToken
    });
  } catch (error) {
    console.error('Error refreshing access token:', error);
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
    console.error('Error checking if should refresh token:', error);
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