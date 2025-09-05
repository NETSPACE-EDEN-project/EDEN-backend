import { COOKIE_NAMES, cookieConfig, clearCookieConfig } from '../../config/authConfig.js';
import { generateTokenPair, verifyAccessToken, verifyRefreshToken } from './tokenService.js';
import { createDisplayInfo } from '../../utils/tokenUtils.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/responseUtils.js';

const setAuthCookies = (res, user, options = {}) => {
  try {
    if (!res || !user) {
      return createErrorResponse(
        new Error('Response object and user are required'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    const tokenResult = generateTokenPair(user);
    if (!tokenResult.success) {
      return tokenResult;
    }

    const { accessToken, refreshToken } = tokenResult.data;

    res.cookie(COOKIE_NAMES.AUTH_TOKEN, accessToken, cookieConfig.auth_token);

    if (options.rememberMe) {
      res.cookie(COOKIE_NAMES.REMEMBER_ME, refreshToken, cookieConfig.remember_me);
    }

    const displayInfo = createDisplayInfo(user);
    res.cookie(COOKIE_NAMES.USER_DISPLAY, JSON.stringify(displayInfo), cookieConfig.user_display);

    return createSuccessResponse({ 
      accessToken, 
      refreshToken: options.rememberMe ? refreshToken : null,
      displayInfo 
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
      try { 
        userInfo = JSON.parse(displayInfoRaw); 
      } 
      catch (error) { 
        console.warn('Failed to parse user display info:', error);
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