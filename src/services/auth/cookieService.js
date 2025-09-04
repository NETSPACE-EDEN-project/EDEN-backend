import { COOKIE_NAMES, cookieConfig, clearCookieConfig } from '../../config/authConfig.js';
import { generateTokenPair, verifyAccessToken, verifyRefreshToken, refreshAccessToken } from './tokenService.js';
import { isTokenExpiringSoon } from '../../utils/tokenUtils.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/errorUtils.js';

const createDisplayInfo = (user) => ({
  id: user.id,
  username: user.username,
  avatarUrl: user.avatarUrl || null,
  role: user.role,
  providerType: user.providerType || null,
  lastLoginAt: new Date().toISOString()
});

const setAuthCookies = (res, user, options = {}) => {
  try {
    const tokenResult = generateTokenPair(user);
    if (!tokenResult.success) return tokenResult;

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
    return createErrorResponse(error, ERROR_TYPES.AUTH.USER.COOKIE.COOKIE_ERROR);
  }
};

const clearAuthCookies = (res) => {
  try {
    res.clearCookie(COOKIE_NAMES.AUTH_TOKEN, clearCookieConfig);
    res.clearCookie(COOKIE_NAMES.USER_DISPLAY, clearCookieConfig);
    res.clearCookie(COOKIE_NAMES.REMEMBER_ME, clearCookieConfig);

    return createSuccessResponse(null, 'Authentication cookies cleared successfully');
  } catch (error) {
    console.error('Error clearing auth cookies:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.USER.COOKIE.CLEAR_COOKIE_ERROR);
  }
};

const getFromCookies = (req) => {
  try {
    const authToken = req.signedCookies?.[COOKIE_NAMES.AUTH_TOKEN];
    const refreshToken = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];
    const displayInfoRaw = req.signedCookies?.[COOKIE_NAMES.USER_DISPLAY];

    let userInfo = null;
    if (displayInfoRaw) {
      try { userInfo = JSON.parse(displayInfoRaw); } 
      catch (error) { console.warn('Failed to parse user display info:', error); }
    }

    let validAccessToken = null, accessTokenData = null;
    if (authToken) {
      const verifyResult = verifyAccessToken(authToken);
      if (verifyResult.success) {
        validAccessToken = authToken;
        accessTokenData = verifyResult.data;
      }
    }

    let validRefreshToken = null, refreshTokenData = null;
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
      tokenData: { access: accessTokenData, refresh: refreshTokenData }, 
      hasValidAuth: !!validAccessToken, 
      hasRememberMe: !!validRefreshToken 
    });
  } catch (error) {
    console.error('Error getting cookies:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.USER.COOKIE.COOKIE_PARSE_ERROR);
  }
};

const refreshTokenFromCookies = (req, res, userInfo) => {
  try {
    const refreshToken = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];
    if (!refreshToken) return createErrorResponse(null, ERROR_TYPES.AUTH.USER.TOKEN.NO_REFRESH_TOKEN);

    const refreshResult = refreshAccessToken(refreshToken, userInfo);
    if (!refreshResult.success) {
      clearAuthCookies(res);
      return refreshResult;
    }

    const { accessToken, userId } = refreshResult.data;
    res.cookie(COOKIE_NAMES.AUTH_TOKEN, accessToken, cookieConfig.auth_token);

    const displayInfo = createDisplayInfo(userInfo);
    res.cookie(COOKIE_NAMES.USER_DISPLAY, JSON.stringify(displayInfo), cookieConfig.user_display);

    return createSuccessResponse({
      accessToken,
      userId,
      refreshed: true,
      displayInfo
    });
  } catch (error) {
    console.error('Error refreshing token from cookies:', error);
    clearAuthCookies(res);
    return createErrorResponse(error, ERROR_TYPES.AUTH.USER.TOKEN.REFRESH_ERROR);
  }
};

const shouldRefreshToken = (req) => {
  try {
    const authToken = req.signedCookies?.[COOKIE_NAMES.AUTH_TOKEN];
    const refreshToken = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];

    if (!authToken && refreshToken) return { shouldRefresh: true, reason: 'No access token but has refresh token' };
    if (!authToken) return { shouldRefresh: false, reason: 'No tokens available' };

    if (isTokenExpiringSoon(authToken)) {
      if (!refreshToken) return { shouldRefresh: false, reason: 'Token expiring but no refresh token' };
      return { shouldRefresh: true, reason: 'Token expiring soon' };
    }

    const verifyResult = verifyAccessToken(authToken);
    if (!verifyResult.success) {
      if (!refreshToken) return { shouldRefresh: false, reason: 'Token invalid but no refresh token' };
      return { shouldRefresh: true, reason: 'Token invalid' };
    }

    return { shouldRefresh: false, reason: 'Token valid' };
  } catch (error) {
    console.error('Error checking if should refresh token:', error);
    return { shouldRefresh: false, reason: 'Check failed' };
  }
};

const autoRefreshToken = async (req, res, next) => {
  try {
    const checkResult = shouldRefreshToken(req);
    if (!checkResult.shouldRefresh) return next();

    console.log(`Token refresh needed: ${checkResult.reason}`);
    const userDisplayRaw = req.signedCookies?.[COOKIE_NAMES.USER_DISPLAY];
    if (!userDisplayRaw) return next();

    try {
      const userInfo = JSON.parse(userDisplayRaw);
      const refreshResult = refreshTokenFromCookies(req, res, userInfo);

      if (refreshResult.success) {
        console.log(`Token auto-refreshed for user: ${userInfo.username}`);
        req.tokenRefreshed = true;
      } else {
        console.warn(`Auto refresh failed for user ${userInfo.username}:`, refreshResult.message);
        req.refreshFailed = true;
      }
    } catch (parseError) {
      console.error('Failed to parse user info for refresh:', parseError);
    }

    next();
  } catch (error) {
    console.error('Auto refresh middleware error:', error);
    next();
  }
};

export { setAuthCookies, clearAuthCookies, getFromCookies, refreshTokenFromCookies, shouldRefreshToken, autoRefreshToken };
