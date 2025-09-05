import jwt from 'jsonwebtoken';
import { JWT_CONFIG, COOKIE_NAMES } from '../../config/authConfig.js';
import { buildTokenPayload, isTokenExpiringSoon } from '../../utils/tokenUtils.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/responseUtils.js';

const generateAccessToken = (user) => {
  try {
    const payload = buildTokenPayload(user, 'access');
    const token = jwt.sign(payload, JWT_CONFIG.access.secret, { 
      expiresIn: JWT_CONFIG.access.expiresIn 
    });

    return createSuccessResponse(token);
  } catch (error) {
    console.error('Error generating access token:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.GENERATE_ERROR);
  }
};

const generateRefreshToken = (user) => {
  try {
    const payload = buildTokenPayload(user, 'refresh');
    const token = jwt.sign(payload, JWT_CONFIG.refresh.secret, { 
      expiresIn: JWT_CONFIG.refresh.expiresIn 
    });

    return createSuccessResponse(token);
  } catch (error) {
    console.error('Error generating refresh token:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.GENERATE_ERROR);
  }
};

const generateTokenPair = (user) => {
  try {
    const accessResult = generateAccessToken(user);
    const refreshResult = generateRefreshToken(user);

    if (!accessResult.success) return accessResult;
    if (!refreshResult.success) return refreshResult;

    return createSuccessResponse({ 
      accessToken: accessResult.data, 
      refreshToken: refreshResult.data 
    });
  } catch (error) {
    console.error('Error generating token pair:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.GENERATE_ERROR);
  }
};

const verifyAccessToken = (token) => {
  try {
    if (!token) {
      throw new Error('Token is required');
    }

    const decoded = jwt.verify(token, JWT_CONFIG.access.secret);
    
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return createSuccessResponse(decoded);
  } catch (error) {
    console.error('Access Token verification failed:', error.message);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.AUTH_VERIFICATION_FAILED);
  }
};

const verifyRefreshToken = (token) => {
  try {
    if (!token) {
      throw new Error('Token is required');
    }

    const decoded = jwt.verify(token, JWT_CONFIG.refresh.secret);
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return createSuccessResponse(decoded);
  } catch (error) {
    console.error('Refresh Token verification failed:', error.message);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.AUTH_VERIFICATION_FAILED);
  }
};

const refreshAccessToken = (refreshToken, userInfo) => {
  try {
    if (!refreshToken || !userInfo) {
      return createErrorResponse(
        new Error('Refresh token and user info are required'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    const refreshResult = verifyRefreshToken(refreshToken);
    if (!refreshResult.success) {
      return refreshResult;
    }

    const refreshData = refreshResult.data;
    
    const userForToken = {
      id: refreshData.id,
      username: userInfo.username,
      email: userInfo.email,
      role: refreshData.role,
      status: userInfo.status || 'active',
      providerType: userInfo.providerType
    };

    const accessResult = generateAccessToken(userForToken);
    if (!accessResult.success) {
      return accessResult;
    }

    return createSuccessResponse({ 
      accessToken: accessResult.data, 
      userId: refreshData.id,
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

    if (!authToken && refreshToken) {
      return { 
        shouldRefresh: true, 
        reason: 'No access token but has refresh token' 
      };
    }

    if (!authToken) {
      return { 
        shouldRefresh: false, 
        reason: 'No tokens available' 
      };
    }

    if (isTokenExpiringSoon(authToken)) {
      if (!refreshToken) {
        return { 
          shouldRefresh: false, 
          reason: 'Token expiring but no refresh token' 
        };
      }
      return { 
        shouldRefresh: true, 
        reason: 'Token expiring soon' 
      };
    }

    const verifyResult = verifyAccessToken(authToken);
    if (!verifyResult.success) {
      if (!refreshToken) {
        return { 
          shouldRefresh: false, 
          reason: 'Token invalid but no refresh token' 
        };
      }
      return { 
        shouldRefresh: true, 
        reason: 'Token invalid' 
      };
    }

    return { 
      shouldRefresh: false, 
      reason: 'Token valid' 
    };
  } catch (error) {
    console.error('Error checking if should refresh token:', error);
    return { 
      shouldRefresh: false, 
      reason: 'Check failed' 
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