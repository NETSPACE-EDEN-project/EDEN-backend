import { verifyAuthService } from '../services/auth/authService.js';
import { shouldRefreshToken } from '../services/auth/tokenService.js';
import { COOKIE_NAMES } from '../config/authConfig.js';
import { setAuthCookies, clearAuthCookies, getFromCookies } from '../services/auth/cookieService.js';
import { createErrorResponse, ERROR_TYPES } from '../utils/responseUtils.js';
import { logger } from '../utils/logger.js';

const requireAuth = async (req, res, next) => {
  try {
    const cookieData = getFromCookies(req);
    const refreshToken = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];

    const refreshCheck = shouldRefreshToken(req);
    const { shouldRefresh } = refreshCheck;
    const result = await verifyAuthService(
      cookieData,
      refreshToken,
      shouldRefresh
    );

    if (!result.success) {
      logger.debug('認證失敗，清除 cookies');
      clearAuthCookies(res);
      return res.status(401).json(result);
    }

    req.user = result.data.userInfo;
    req.isAuthenticated = true;

    if (result.data.refreshed) {
      const cookieResult = setAuthCookies(res, result.data.userInfo, { 
        rememberMe: true,
        updateRefreshToken: false
      });

      if (cookieResult.success) {
        res.setHeader('X-Token-Refreshed', 'true');
        logger.debug('Token 自動刷新成功');
      } else {
        logger.debug('Token 刷新後更新 cookies 失敗', { error: cookieResult.message });
      }
    }

    next();
  } catch (error) {
    logger.error('RequireAuth 中間件錯誤', error);
    clearAuthCookies(res);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.TOKEN.AUTH_VERIFICATION_FAILED
    ));
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const cookieData = getFromCookies(req);
    const refreshToken = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];
    
    const refreshCheck = shouldRefreshToken(req);
    const { shouldRefresh } = refreshCheck;
    
    const result = await verifyAuthService(
      cookieData,
      refreshToken,
      shouldRefresh
    );

    if (result.success) {
      req.user = result.data.userInfo;
      req.isAuthenticated = true;

      if (result.data.refreshed) {
        const cookieResult = setAuthCookies(res, result.data.userInfo, { 
          rememberMe: true,
          updateRefreshToken: false
        });
        
        if (cookieResult.success) {
          res.setHeader('X-Token-Refreshed', 'true');
          logger.debug('可選認證中 Token 自動刷新成功');
        } else {
          logger.debug('可選認證中 Token 刷新後更新 cookies 失敗', { error: cookieResult.message });
        }
      }
    } else {
      req.user = null;
      req.isAuthenticated = false;
    }

    next();
  } catch (error) {
    logger.error('OptionalAuth 中間件錯誤', error);
    req.user = null;
    req.isAuthenticated = false;
    next();
  }
};

const requireRole = (requiredRole, options = {}) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.AUTHENTICATION_REQUIRED
      ));
    }

    if (!requiredRole) {
      logger.error('requireRole 中間件調用時未指定必要角色');
      return next();
    }

    const userRole = req.user.role;
    if (!userRole) {
      logger.security('用戶無角色權限嘗試存取', req.user.id);
      return res.status(403).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.INSUFFICIENT_PERMISSIONS,
        { reason: 'User has no role assigned' }
      ));
    }

    if (options.strict) {
      if (userRole !== requiredRole) {
        logger.security('用戶角色權限不足（嚴格模式）', req.user.id, {
          required: requiredRole,
          current: userRole
        });
        return res.status(403).json(createErrorResponse(
          null,
          ERROR_TYPES.AUTH.USER.INSUFFICIENT_PERMISSIONS,
          { 
            reason: `Required role: ${requiredRole}, user role: ${userRole}`,
            required: requiredRole,
            current: userRole
          }
        ));
      }
    } else {
      const roleHierarchy = {
        user: 1,
        moderator: 2,
        admin: 3,
        superadmin: 4
      };

      const userLevel = roleHierarchy[userRole] || 0;
      const requiredLevel = roleHierarchy[requiredRole] || 0;

      if (requiredLevel === 0) {
        logger.error('未知的必要角色', { role: requiredRole });
        return res.status(500).json(createErrorResponse(
          new Error(`Invalid role configuration: ${requiredRole}`),
          ERROR_TYPES.AUTH.TOKEN.VALIDATION_ERROR
        ));
      }

      if (userLevel < requiredLevel) {
        logger.security('用戶角色權限不足（階層模式）', req.user.id, {
          requiredLevel,
          userLevel,
          requiredRole,
          userRole
        });
        return res.status(403).json(createErrorResponse(
          null,
          ERROR_TYPES.AUTH.USER.INSUFFICIENT_PERMISSIONS,
          { 
            reason: `Required level: ${requiredLevel} (${requiredRole}), user level: ${userLevel} (${userRole})`,
            required: requiredRole,
            current: userRole
          }
        ));
      }
    }

    next();
  };
};

const requireOwnershipOrAdmin = (userIdParam = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.AUTHENTICATION_REQUIRED
      ));
    }

    const targetUserId = req.params[userIdParam];
    const currentUserId = req.user.id;
    const userRole = req.user.role;

    if (targetUserId === currentUserId) {
      return next();
    }

    const roleHierarchy = {
      user: 1,
      moderator: 2,
      admin: 3,
      superadmin: 4
    };

    const userLevel = roleHierarchy[userRole] || 0;
    if (userLevel >= 3) {
      return next();
    }

    logger.security('用戶嘗試存取非擁有資源且權限不足', req.user.id, {
      targetUserId: '[REDACTED]',
      userRole
    });

    return res.status(403).json(createErrorResponse(
      null,
      ERROR_TYPES.AUTH.USER.INSUFFICIENT_PERMISSIONS,
      { reason: 'Access denied: not owner or admin' }
    ));
  };
};

export { requireAuth, optionalAuth, requireRole, requireOwnershipOrAdmin };