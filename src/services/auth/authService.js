import { refreshAccessToken } from './tokenService.js';
import { buildDisplayInfo } from '../../utils/tokenUtils.js';
import { createSuccessResponse, createErrorResponse, ERROR_TYPES } from '../../utils/responseUtils.js';
import { logger } from '../../utils/logger.js';

const loginUserService = async (user, options = {}) => {
  try {
    if (user.status && user.status !== 'active') {
      logger.security('嘗試登入非活躍帳號', user.id);
      return createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.ACCOUNT_STATUS_INVALID
      );
    }

    if (user.providerType === 'email' && 
        user.hasOwnProperty('isVerifiedEmail') && 
        !user.isVerifiedEmail) {
      logger.security('嘗試登入未驗證 email 的帳號', user.id);
      return createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.EMAIL_NOT_VERIFIED,
        { needsEmailVerification: true }
      );
    }

    const displayInfo = buildDisplayInfo(user);
    logger.info('用戶登入成功', { 
      providerType: user.providerType,
      hasRedirectUrl: !!options.redirectUrl 
    });

    return createSuccessResponse({
      user: displayInfo,
      redirectUrl: options.redirectUrl || '/dashboard'
    }, '登入成功');

  } catch (error) {
    logger.error('登入服務失敗', error);
    return createErrorResponse(
      error,
      ERROR_TYPES.AUTH.SESSION.LOGIN_FAILED
    );
  }
};

const logoutUserService = () => {
  logger.info('用戶登出');
  return createSuccessResponse({ 
    redirectUrl: '/login' 
  }, '登出成功');
};

const refreshTokenService = async (refreshToken) => {
  try {
    if (!refreshToken) {
      logger.debug('Token 刷新失敗：缺少 refresh token');
      return createErrorResponse(null, ERROR_TYPES.AUTH.TOKEN.NO_REFRESH_TOKEN);
    }

    const refreshResult = await refreshAccessToken(refreshToken);
    if (!refreshResult.success) {
      logger.debug('Refresh token 驗證失敗');
      return refreshResult;
    }

    const { accessToken, user } = refreshResult.data;
    const displayInfo = buildDisplayInfo(user);

    logger.info('Token 刷新成功');
    return createSuccessResponse({
      accessToken,
      displayInfo,
      refreshed: true
    }, 'Token 刷新成功');

  } catch (error) {
    logger.error('Token 刷新服務失敗', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.REFRESH_ERROR);
  }
};

const verifyAuthService = async (cookieData, refreshToken, shouldRefresh = false) => {
  try {
    if (!cookieData || !cookieData.success) {
      logger.debug('Cookie 資料無效或讀取失敗');
      return createErrorResponse(null, ERROR_TYPES.AUTH.TOKEN.AUTH_READ_FAILED);
    }

    const { data } = cookieData;

    if (!data.hasValidAuth) {
      logger.debug('無有效認證', { 
        hasRememberMe: !!data.hasRememberMe,
        hasRefreshToken: !!refreshToken 
      });

      if (data.hasRememberMe && refreshToken) {
        logger.debug('嘗試使用 refresh token 自動刷新');
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
      logger.debug('執行預先刷新 token');
      const refreshResult = await refreshTokenService(refreshToken);
      if (refreshResult.success) {
        return createSuccessResponse({
          userInfo: refreshResult.data.displayInfo,
          refreshed: true
        }, 'Token 已預先刷新');
      }
      logger.debug('預先刷新失敗，但原 token 仍有效');
    }

    logger.debug('認證驗證成功');
    return createSuccessResponse({
      userInfo: data.userInfo
    }, '認證驗證成功');

  } catch (error) {
    logger.error('認證驗證服務失敗', error);
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.AUTH_VERIFICATION_FAILED);
  }
};

const loginWithProviderService = async (user, provider, options = {}) => {
  try {
    if (!provider) {
      logger.error('第三方登入缺少 provider 參數');
      return createErrorResponse(
        new Error('Provider is required'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    const userWithProvider = { 
      ...user, 
      providerType: provider 
    };

    logger.info('第三方登入嘗試', { provider });
    return await loginUserService(userWithProvider, options);
  } catch (error) {
    logger.error(`第三方登入失敗`, error, { provider });
    return createErrorResponse(error, ERROR_TYPES.AUTH.PROVIDER.PROVIDER_LOGIN_FAILED);
  }
};

const getCurrentUserFromCookiesService = (cookieData) => {
  try {
    if (!cookieData || !cookieData.success || !cookieData.data.hasValidAuth) {
      logger.debug('從 cookies 獲取用戶失敗：無有效認證');
      return null;
    }
    
    return cookieData.data.userInfo;
  } catch (error) {
    logger.error('從 cookies 獲取用戶失敗', error);
    return null;
  }
};

export { 
  loginUserService, 
  logoutUserService, 
  refreshTokenService, 
  verifyAuthService, 
  loginWithProviderService, 
  getCurrentUserFromCookiesService 
};