import { setAuthCookies, clearAuthCookies, getFromCookies, refreshTokenFromCookies, shouldRefreshToken } from './cookieService.js';
import { verifyAccessToken } from './tokenService.js';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/errorUtils.js';

const validateUserInfo = (user) => {
	const requiredFields = ['id', 'username', 'providerType', 'status'];

	for (const field of requiredFields) {
		if (!user[field]) {
			return createErrorResponse(
        null, 
        `缺少必要的用戶資訊: ${field}`, 
        'INVALID_USER_INFO'
      );
		}
	}

	if (user.providerType === 'email' && !user.email) {
    return createErrorResponse(
      null, 
      'Email 登入用戶缺少 email 資訊', 
      'MISSING_EMAIL_INFO'
    );
  }

	if (user.email && !user.email.includes('@')) {
    return createErrorResponse(
      null, 
      '無效的 email 格式', 
      'INVALID_EMAIL_FORMAT'
    );
  }

	return createSuccessResponse(null, '用戶資訊驗證通過');
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
        '帳號狀態異常，請聯繫管理員', 
        'ACCOUNT_STATUS_INVALID'
      );
    }

    if (user.providerType === 'email' && user.hasOwnProperty('isVerifiedEmail') && !user.isVerifiedEmail) {
      return createErrorResponse(
        null, 
        '請先驗證您的 email', 
        'EMAIL_NOT_VERIFIED',
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
      '登入處理失敗，請重試', 
      'LOGIN_FAILED'
    );
  }
};

const logoutUser = async (res) => {
  try {
    const result = clearAuthCookies(res);

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

const verifyAuth = async (req, res) => {
  try {
    const cookieData = getFromCookies(req);
    if (!cookieData.success) {
      return createErrorResponse(
        null, 
        '無法讀取認證資訊', 
        'AUTH_READ_FAILED'
      );
    }

    const { data } = cookieData;
    if (!data.hasValidAuth) {
      if (data.hasRememberMe && data.userInfo) {
        const refreshResult = refreshTokenFromCookies(req, res, data.userInfo);
        
        if (refreshResult.success) {
          return createSuccessResponse({
            user: refreshResult.data.displayInfo,
            userInfo: refreshResult.data.displayInfo,
            refreshed: true
          }, 'Token 已自動刷新');
        }
      }

      return createErrorResponse(
        null, 
        '認證已失效，請重新登入', 
        'AUTH_EXPIRED'
      );
    }

    const refreshCheck = shouldRefreshToken(req);
    if (refreshCheck.shouldRefresh && data.hasRememberMe) {
      refreshTokenFromCookies(req, res, data.userInfo);
    }

    return createSuccessResponse({
      user: data.tokenData.access,
      userInfo: data.userInfo
    }, '認證驗證成功');
  } catch (error) {
    console.error('Verify auth error:', error);
    return createErrorResponse(
      error, 
      '認證驗證失敗', 
      'AUTH_VERIFICATION_FAILED'
    );
  }
};

const getCurrentUser = (req) => {
  const cookieData = getFromCookies(req);
  if (!cookieData.success || !cookieData.data.hasValidAuth) {
    return null;
  }

  return cookieData.data.userInfo;
};

const loginWithProvider = async (res, user, provider, options = {}) => {
  try {
    // 為第三方登入添加 providerType
    const userWithProvider = {
      ...user,
      providerType: provider
    };

    return await loginUser(res, userWithProvider, options);
  } catch (error) {
    console.error(`Login with ${provider} error:`, error);
    return createErrorResponse(
      error, 
      `${provider} 登入失敗`, 
      'PROVIDER_LOGIN_FAILED'
    );
  }
};

export {
  loginUser,
  logoutUser,
  verifyAuth,
  validateUserInfo,
  getCurrentUser,
  loginWithProvider
};