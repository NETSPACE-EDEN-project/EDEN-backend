import { refreshAccessToken } from './tokenService.js';
import { createDisplayInfo } from '../../utils/tokenUtils.js';
import { createSuccessResponse, createErrorResponse, ERROR_TYPES } from '../../utils/responseUtils.js';

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

const loginUserService = async (user, options = {}) => {
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

    return createSuccessResponse({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'user',
        avatarUrl: user.avatarUrl || null
      },
      fullUserData: user,
      redirectUrl: options.redirectUrl || '/dashboard'
    }, '登入成功');

  } catch (error) {
    console.error('Login user service error:', error);
    return createErrorResponse(
      error,
      ERROR_TYPES.AUTH.SESSION.LOGIN_FAILED
    );
  }
};

const logoutUserService = () => {
  try {
    return createSuccessResponse({ 
      redirectUrl: '/login' 
    }, '登出成功');
  } catch (error) {
    console.error('Logout user service error:', error);
    return createSuccessResponse({ 
      redirectUrl: '/login' 
    }, '登出成功');
  }
};

const refreshTokenService = (refreshToken, userInfo) => {
  try {
    if (!refreshToken) {
      return createErrorResponse(null, ERROR_TYPES.AUTH.TOKEN.NO_REFRESH_TOKEN);
    }

    if (!userInfo) {
      return createErrorResponse(
        new Error('UserInfo is required for token refresh'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    const refreshResult = refreshAccessToken(refreshToken, userInfo);
    if (!refreshResult.success) {
      return refreshResult;
    }

    const { accessToken, userId, user } = refreshResult.data;
    const displayInfo = createDisplayInfo(userInfo);

    return createSuccessResponse({
      accessToken,
      userId,
      user,
      fullUserData: userInfo,
      displayInfo,
      refreshed: true
    }, 'Token 刷新成功');

  } catch (error) {
    console.error('Error refreshing token:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.REFRESH_ERROR);
  }
};

const verifyAuthService = (cookieData, refreshToken, shouldRefreshFn) => {
  try {
    if (!cookieData || !cookieData.success) {
      return createErrorResponse(null, ERROR_TYPES.AUTH.TOKEN.AUTH_READ_FAILED);
    }

    const { data } = cookieData;

    if (!data.hasValidAuth) {
      if (data.hasRememberMe && data.userInfo && refreshToken) {
        const refreshResult = refreshTokenService(refreshToken, data.userInfo);
        if (refreshResult.success) {
          return createSuccessResponse({
            user: refreshResult.data.user,
            userInfo: refreshResult.data.displayInfo,
            fullUserData: refreshResult.data.fullUserData,
            refreshed: true
          }, 'Token 已自動刷新');
        }
      }
      return createErrorResponse(null, ERROR_TYPES.AUTH.TOKEN.AUTH_EXPIRED);
    }

    if (data.hasRememberMe && data.userInfo && refreshToken && shouldRefreshFn && shouldRefreshFn()) {
      const refreshResult = refreshTokenService(refreshToken, data.userInfo);
      if (refreshResult.success) {
        return createSuccessResponse({
          user: refreshResult.data.user,
          userInfo: refreshResult.data.displayInfo,
          fullUserData: refreshResult.data.fullUserData,
          refreshed: true
        }, 'Token 已預先刷新');
      }
      console.warn('Token pre-refresh failed, but original token is still valid');
    }

    return createSuccessResponse({
      user: data.tokenData.access,
      userInfo: data.userInfo
    }, '認證驗證成功');

  } catch (error) {
    console.error('Verify auth service error:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.AUTH_VERIFICATION_FAILED);
  }
};

const loginWithProviderService = async (user, provider, options = {}) => {
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

    return await loginUserService(userWithProvider, options);
  } catch (error) {
    console.error(`Login with ${provider} service error:`, error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.PROVIDER.PROVIDER_LOGIN_FAILED);
  }
};

const getCurrentUserFromCookiesService = (cookieData) => {
  try {
    if (!cookieData || !cookieData.success || !cookieData.data.hasValidAuth) {
      return null;
    }
    
    return cookieData.data.userInfo;
  } catch (error) {
    console.error('Error getting current user from cookies:', error);
    return null;
  }
};

export { validateUserInfo, loginUserService, refreshTokenService, verifyAuthService, loginWithProviderService, getCurrentUserFromCookiesService };