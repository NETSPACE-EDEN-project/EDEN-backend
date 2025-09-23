import dotenv from 'dotenv';
import { COOKIE_NAMES, cookieConfig, clearCookieConfig } from '../../config/authConfig.js';
import { generateTokenPair, verifyAccessToken, verifyRefreshToken } from './tokenService.js';
import { buildDisplayInfo } from '../../utils/tokenUtils.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/responseUtils.js';
import { logger } from '../../utils/logger.js';

dotenv.config();

const setAuthCookies = (res, user, options = {}) => {
  logger.debug('開始設置認證 cookies', { 
    hasUser: !!user,
    nodeEnv: process.env.NODE_ENV 
  });
  
  try {
    if (!res || !user) {
      logger.error('設置 cookies 參數不完整', { 
        hasRes: !!res, 
        hasUser: !!user 
      });
      return createErrorResponse(
        new Error('Response object and user are required'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    const {
      rememberMe = false,
      updateAccessToken = true,
      updateRefreshToken = true,
      updateDisplayInfo = true
    } = options;

    logger.debug('Cookie 設置選項', { 
      rememberMe, 
      updateAccessToken, 
      updateRefreshToken, 
      updateDisplayInfo 
    });

    let accessToken = null;
    let refreshToken = null;

    if (updateAccessToken || (updateRefreshToken && rememberMe)) {
      logger.debug('開始生成 token pair');
      const tokenResult = generateTokenPair(user);
      
      if (!tokenResult.success) {
        logger.error('Token 生成失敗', { error: tokenResult.message });
        return tokenResult;
      }
      
      const tokens = tokenResult.data;
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
      logger.debug('Token 生成完成', { 
        hasAccessToken: !!accessToken, 
        hasRefreshToken: !!refreshToken 
      });
    }

    if (updateAccessToken && accessToken) {
      logger.debug('設置 access token cookie', {
        cookieConfig: {
          httpOnly: cookieConfig.auth_token.httpOnly,
          secure: cookieConfig.auth_token.secure,
          sameSite: cookieConfig.auth_token.sameSite
        }
      });
      res.cookie(COOKIE_NAMES.AUTH_TOKEN, accessToken, cookieConfig.auth_token);
    } else {
      logger.debug('跳過設置 access token', { 
        updateAccessToken, 
        hasAccessToken: !!accessToken 
      });
    }

    if (updateRefreshToken && rememberMe && refreshToken) {
      logger.debug('設置 refresh token cookie');
      res.cookie(COOKIE_NAMES.REMEMBER_ME, refreshToken, cookieConfig.remember_me);
    } else {
      logger.debug('跳過設置 refresh token', { 
        updateRefreshToken, 
        rememberMe, 
        hasRefreshToken: !!refreshToken 
      });
    }

    if (updateDisplayInfo) {
      const displayInfo = buildDisplayInfo(user);
      logger.debug('設置用戶顯示資訊 cookie', {
        hasDisplayInfo: !!displayInfo
      });
      res.cookie(COOKIE_NAMES.USER_DISPLAY, JSON.stringify(displayInfo), cookieConfig.user_display);
    }

    logger.info('認證 cookies 設置成功');
    return createSuccessResponse({ 
      accessToken, 
      refreshToken: (updateRefreshToken && rememberMe) ? refreshToken : null,
      displayInfo: updateDisplayInfo ? buildDisplayInfo(user) : null
    });
  } catch (error) {
    logger.error('設置認證 cookies 失敗', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.COOKIE.COOKIE_ERROR);
  }
};

const clearAuthCookies = (res) => {
  try {
    if (!res) {
      logger.error('清除 cookies 缺少 response 物件');
      return createErrorResponse(
        new Error('Response object is required'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    res.clearCookie(COOKIE_NAMES.AUTH_TOKEN, clearCookieConfig);
    res.clearCookie(COOKIE_NAMES.USER_DISPLAY, clearCookieConfig);
    res.clearCookie(COOKIE_NAMES.REMEMBER_ME, clearCookieConfig);

    logger.info('認證 cookies 清除成功');
    return createSuccessResponse(null, 'Authentication cookies cleared successfully');
  } catch (error) {
    logger.error('清除認證 cookies 失敗', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.COOKIE.CLEAR_COOKIE_ERROR);
  }
};

const getFromCookies = (req) => {
  try {
    logger.debug('開始讀取 cookies');
    
    if (!req || !req.signedCookies) {
      logger.error('讀取 cookies 參數不完整', {
        hasReq: !!req,
        hasSignedCookies: !!req?.signedCookies
      });
      return createErrorResponse(
        new Error('Request object with signed cookies is required'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    const accessToken = req.signedCookies?.[COOKIE_NAMES.AUTH_TOKEN];
    const refreshToken = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];
    const displayInfoRaw = req.signedCookies?.[COOKIE_NAMES.USER_DISPLAY];

    logger.debug('Cookie 狀態', {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      hasDisplayInfo: !!displayInfoRaw
    });

    let userInfo = null;
    if (displayInfoRaw) {
      try {
        userInfo = JSON.parse(displayInfoRaw);
      } catch (parseError) {
        logger.error('解析用戶顯示資訊失敗', parseError);
      }
    }

    let validAccessToken = null;
    let accessTokenData = null;
    if (accessToken) {
      const verifyResult = verifyAccessToken(accessToken);
      if (verifyResult.success) {
        validAccessToken = accessToken;
        accessTokenData = verifyResult.data;
      }
      
      try {
        const decoded = JSON.parse(atob(accessToken.split('.')[1]));
        logger.debug('Access token 資訊', {
          expiresAt: new Date(decoded.exp * 1000).toISOString(),
          isValid: !!validAccessToken
        });
      } catch (decodeError) {
        logger.debug('無法解析 access token');
      }
    }

    let validRefreshToken = null;
    let refreshTokenData = null;
    if (refreshToken) {
      const verifyResult = verifyRefreshToken(refreshToken);
      if (verifyResult.success) {
        validRefreshToken = refreshToken;
        refreshTokenData = verifyResult.data;
      }
    }

    logger.debug('Cookie 驗證結果', {
      hasValidAuth: !!validAccessToken,
      hasRememberMe: !!validRefreshToken
    });

    return createSuccessResponse({ 
      accessToken: validAccessToken, 
      refreshToken: validRefreshToken, 
      userInfo, 
      tokenData: { 
        access: accessTokenData, 
        refresh: refreshTokenData 
      }, 
      hasValidAuth: !!validAccessToken, 
      hasRememberMe: !!validRefreshToken 
    });
  } catch (error) {
    logger.error('讀取 cookies 失敗', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.COOKIE.COOKIE_PARSE_ERROR);
  }
};

export { 
  setAuthCookies, 
  clearAuthCookies, 
  getFromCookies
};