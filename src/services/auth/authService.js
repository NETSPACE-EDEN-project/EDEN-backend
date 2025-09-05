import { setAuthCookies, clearAuthCookies, getFromCookies } from './cookieService.js';
import { shouldRefreshToken, refreshAccessToken } from './tokenService.js';
import { COOKIE_NAMES, cookieConfig } from '../../config/authConfig.js';
import { createDisplayInfo } from '../../utils/tokenUtils.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/responseUtils.js';

const validateUserInfo = (user) => {
  try {
    if (!user || typeof user !== 'object') {
      return createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.INVALID_USER_INFO,
        { missingField: 'user object' }
      );
    }

    const requiredFields = ['id', 'username', 'providerType', 'status'];

    for (const field of requiredFields) {
      if (!user[field]) {
        return createErrorResponse(
          null,
          ERROR_TYPES.AUTH.USER.INVALID_USER_INFO,
          { missingField: field }
        );
      }
    }

    if (user.providerType === 'email' && !user.email) {
      return createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.MISSING_EMAIL_INFO
      );
    }

    if (user.email && !user.email.includes('@')) {
      return createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.INVALID_EMAIL_FORMAT
      );
    }

    return createSuccessResponse(null, '用戶資訊驗證通過');
  } catch (error) {
    console.error('Error validating user info:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.USER.INVALID_USER_INFO);
  }
};

const loginUser = async (res, user, options = {}) => {
  try {
    const validation = validateUserInfo(user);
    if (!validation.success) {
      return validation;
    }

    if (user.status && user.status !== 'active') {
      return createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.ACCOUNT_STATUS_INVALID
      );
    }

    if (user.providerType === 'email' && 
        user.hasOwnProperty('isVerifiedEmail') && 
        !user.isVerifiedEmail) {
      return createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.EMAIL_NOT_VERIFIED,
        { needsEmailVerification: true }
      );
    }

    const cookieResult = setAuthCookies(res, user, { 
      rememberMe: options.rememberMe || false 
    });
    
    if (!cookieResult.success) {
      return cookieResult;
    }

    return createSuccessResponse({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'user',
        avatarUrl: user.avatarUrl || null
      },
      redirectUrl: options.redirectUrl || '/dashboard'
    }, '登入成功');

  } catch (error) {
    console.error('Login user error:', error);
    return createErrorResponse(
      error,
      ERROR_TYPES.AUTH.SESSION.LOGIN_FAILED
    );
  }
};

const logoutUser = async (res) => {
  try {
    const clearResult = clearAuthCookies(res);
    
    if (!clearResult.success) {
      console.warn('Failed to clear cookies, but proceeding with logout:', clearResult.message);
    }

    return createSuccessResponse({ 
      redirectUrl: '/login' 
    }, '登出成功');

  } catch (error) {
    console.error('Logout user error:', error);
    clearAuthCookies(res);
    return createSuccessResponse({ 
      redirectUrl: '/login' 
    }, '登出成功');
  }
};

const refreshTokenFromCookies = (req, res, userInfo) => {
  try {
    if (!req || !res || !userInfo) {
      return createErrorResponse(
        new Error('Request, response, and userInfo are required'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    const refreshToken = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];
    if (!refreshToken) {
      return createErrorResponse(null, ERROR_TYPES.AUTH.TOKEN.NO_REFRESH_TOKEN);
    }

    const refreshResult = refreshAccessToken(refreshToken, userInfo);
    if (!refreshResult.success) {
      clearAuthCookies(res);
      return refreshResult;
    }

    const { accessToken, userId, user } = refreshResult.data;

    res.cookie(COOKIE_NAMES.AUTH_TOKEN, accessToken, cookieConfig.auth_token);

    const displayInfo = createDisplayInfo(userInfo);
    res.cookie(COOKIE_NAMES.USER_DISPLAY, JSON.stringify(displayInfo), cookieConfig.user_display);

    return createSuccessResponse({
      accessToken,
      userId,
      user,
      displayInfo,
      refreshed: true
    }, 'Token 刷新成功');

  } catch (error) {
    console.error('Error refreshing token from cookies:', error);
    clearAuthCookies(res);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.REFRESH_ERROR);
  }
};

const verifyAuth = async (req, res) => {
  try {
    const cookieData = getFromCookies(req);
    if (!cookieData.success) {
      return createErrorResponse(null, ERROR_TYPES.AUTH.TOKEN.AUTH_READ_FAILED);
    }

    const { data } = cookieData;
    if (!data.hasValidAuth) {
      if (data.hasRememberMe && data.userInfo) {
        const refreshResult = refreshTokenFromCookies(req, res, data.userInfo);
        if (refreshResult.success) {
          return createSuccessResponse({
            user: refreshResult.data.user,
            userInfo: refreshResult.data.displayInfo,
            refreshed: true
          }, 'Token 已自動刷新');
        }
        clearAuthCookies(res);
      }
      return createErrorResponse(null, ERROR_TYPES.AUTH.TOKEN.AUTH_EXPIRED);
    }

    if (data.hasRememberMe && data.userInfo) {
      const refreshCheck = shouldRefreshToken(req);
      if (refreshCheck.shouldRefresh) {
        const refreshResult = refreshTokenFromCookies(req, res, data.userInfo);
        if (refreshResult.success) {
          return createSuccessResponse({
            user: refreshResult.data.user,
            userInfo: refreshResult.data.displayInfo,
            refreshed: true
          }, 'Token 已預先刷新');
        }
        console.warn('Token pre-refresh failed, but original token is still valid');
      }
    }
    return createSuccessResponse({
      user: data.tokenData.access,
      userInfo: data.userInfo
    }, '認證驗證成功');

  } catch (error) {
    console.error('Verify auth error:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.AUTH_VERIFICATION_FAILED);
  }
};

const loginWithProvider = async (res, user, provider, options = {}) => {
  try {
    if (!provider) {
      return createErrorResponse(
        new Error('Provider is required'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    const userWithProvider = { 
      ...user, 
      providerType: provider 
    };

    return await loginUser(res, userWithProvider, options);
  } catch (error) {
    console.error(`Login with ${provider} error:`, error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.PROVIDER.PROVIDER_LOGIN_FAILED);
  }
};

const getCurrentUserFromCookies = (req) => {
  try {
    const cookieData = getFromCookies(req);
    
    if (!cookieData.success || !cookieData.data.hasValidAuth) {
      return null;
    }
    
    return cookieData.data.userInfo;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

export {
  loginUser,
  logoutUser,
  verifyAuth,
  validateUserInfo,
  loginWithProvider,
  refreshTokenFromCookies,
  getCurrentUserFromCookies
};