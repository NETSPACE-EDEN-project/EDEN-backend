import { refreshAccessToken } from './tokenService.js';
import { buildDisplayInfo } from '../../utils/tokenUtils.js';
import { createSuccessResponse, createErrorResponse, ERROR_TYPES } from '../../utils/responseUtils.js';

const loginUserService = async (user, options = {}) => {
  try {
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

    const displayInfo = buildDisplayInfo(user);

    return createSuccessResponse({
      user: displayInfo,
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
  return createSuccessResponse({ 
    redirectUrl: '/login' 
  }, '登出成功');
};

const refreshTokenService = async (refreshToken) => {
  try {
    if (!refreshToken) {
      return createErrorResponse(null, ERROR_TYPES.AUTH.TOKEN.NO_REFRESH_TOKEN);
    }

    const refreshResult = await refreshAccessToken(refreshToken);
    if (!refreshResult.success) {
      return refreshResult;
    }

    const { accessToken, user } = refreshResult.data;
    const displayInfo = buildDisplayInfo(user);

    return createSuccessResponse({
      accessToken,
      displayInfo,
      refreshed: true
    }, 'Token 刷新成功');

  } catch (error) {
    console.error('Error refreshing token:', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.REFRESH_ERROR);
  }
};

const verifyAuthService = async (cookieData, refreshToken, shouldRefresh = false) => {
  try {
    if (!cookieData || !cookieData.success) {
      return createErrorResponse(null, ERROR_TYPES.AUTH.TOKEN.AUTH_READ_FAILED);
    }

    const { data } = cookieData;

    if (!data.hasValidAuth) {
      if (data.hasRememberMe && refreshToken) {
        const refreshResult = await refreshTokenService(refreshToken);
        if (refreshResult.success) {
          return createSuccessResponse({
            userInfo: refreshResult.data.displayInfo,
            refreshed: true
          }, 'Token 已自動刷新');
        }
      }
      return createErrorResponse(null, ERROR_TYPES.AUTH.TOKEN.AUTH_EXPIRED);
    }

    if (data.hasRememberMe && refreshToken && shouldRefresh) {
      const refreshResult = await refreshTokenService(refreshToken);
      if (refreshResult.success) {
        return createSuccessResponse({
          userInfo: refreshResult.data.displayInfo,
          refreshed: true
        }, 'Token 已預先刷新');
      }
      console.warn('Token pre-refresh failed, but original token is still valid');
    }

    return createSuccessResponse({
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

export { loginUserService, logoutUserService, refreshTokenService, verifyAuthService, loginWithProviderService, getCurrentUserFromCookiesService };