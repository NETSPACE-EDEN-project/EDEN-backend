import { COOKIE_NAMES, cookieConfig, clearCookieConfig } from '../../config/authConfig.js';
import { generateTokenPair, verifyAccessToken, verifyRefreshToken } from './tokenService.js';
import { buildDisplayInfo } from '../../utils/tokenUtils.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/responseUtils.js';

const setAuthCookies = (res, user, options = {}) => {
  try {
    if (!res || !user) {
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

    let accessToken = null;
    let refreshToken = null;

    if (updateAccessToken || (updateRefreshToken && rememberMe)) {
      const tokenResult = generateTokenPair(user);
      if (!tokenResult.success) {
        return tokenResult;
      }
      
      const tokens = tokenResult.data;
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
    }

    if (updateAccessToken && accessToken) {
      res.cookie(COOKIE_NAMES.AUTH_TOKEN, accessToken, cookieConfig.auth_token);
    }

    if (updateRefreshToken && rememberMe && refreshToken) {
      res.cookie(COOKIE_NAMES.REMEMBER_ME, refreshToken, cookieConfig.remember_me);
    }

    if (updateDisplayInfo) {
      const displayInfo = buildDisplayInfo(user);
      res.cookie(COOKIE_NAMES.USER_DISPLAY, JSON.stringify(displayInfo), cookieConfig.user_display);
    }

    return createSuccessResponse({ 
      accessToken, 
      refreshToken: (updateRefreshToken && rememberMe) ? refreshToken : null,
      displayInfo: updateDisplayInfo ? buildDisplayInfo(user) : null
    });
  } catch (error) {
    console.error('Error setting auth cookies:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.COOKIE.COOKIE_ERROR);
  }
};

const clearAuthCookies = (res) => {
  try {
    if (!res) {
      return createErrorResponse(
        new Error('Response object is required'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    res.clearCookie(COOKIE_NAMES.AUTH_TOKEN, clearCookieConfig);
    res.clearCookie(COOKIE_NAMES.USER_DISPLAY, clearCookieConfig);
    res.clearCookie(COOKIE_NAMES.REMEMBER_ME, clearCookieConfig);

    return createSuccessResponse(null, 'Authentication cookies cleared successfully');
  } catch (error) {
    console.error('Error clearing auth cookies:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.COOKIE.CLEAR_COOKIE_ERROR);
  }
};

const getFromCookies = (req) => {
  try {
    if (!req || !req.signedCookies) {
      return createErrorResponse(
        new Error('Request object with signed cookies is required'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    const accessToken = req.signedCookies?.[COOKIE_NAMES.AUTH_TOKEN];
    const refreshToken = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];
    const displayInfoRaw = req.signedCookies?.[COOKIE_NAMES.USER_DISPLAY];

    let userInfo = null;
    if (displayInfoRaw) {
      userInfo = JSON.parse(displayInfoRaw); 
    }

    let validAccessToken = null;
    let accessTokenData = null;
    if (accessToken) {
      const verifyResult = verifyAccessToken(accessToken);
      if (verifyResult.success) {
        validAccessToken = accessToken;
        accessTokenData = verifyResult.data;
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
    console.error('Error getting cookies:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.COOKIE.COOKIE_PARSE_ERROR);
  }
};

export { 
  setAuthCookies, 
  clearAuthCookies, 
  getFromCookies
};