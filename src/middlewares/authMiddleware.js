import { verifyAuthService } from '../services/auth/authService.js';
import { shouldRefreshToken } from '../services/auth/tokenService.js';
import { COOKIE_NAMES } from '../config/authConfig.js';
import { setAuthCookies, clearAuthCookies, getFromCookies } from '../services/auth/cookieService.js';
import { createErrorResponse, ERROR_TYPES } from '../utils/responseUtils.js';

const requireAuth = async (req, res, next) => {
  try {
    const cookieData = getFromCookies(req);
    const refreshToken = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];
    
    const result = verifyAuthService(
      cookieData,
      refreshToken,
      () => shouldRefreshToken(req).shouldRefresh
    );

    if (!result.success) {
      clearAuthCookies(res);
      return res.status(401).json(result);
    }

    req.user = result.data.user;
    req.userInfo = result.data.userInfo;
    req.isAuthenticated = true;

    if (result.data.refreshed && result.data.fullUserData) {
      const cookieResult = setAuthCookies(res, result.data.fullUserData, { 
        rememberMe: true 
      });
      
      if (cookieResult.success) {
        res.setHeader('X-Token-Refreshed', 'true');
      } else {
        console.warn('Failed to update cookies after token refresh:', cookieResult.message);
      }
    }

    next();
  } catch (error) {
    console.error('RequireAuth middleware error:', error);
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
    
    const result = verifyAuthService(
      cookieData,
      refreshToken,
      () => shouldRefreshToken(req).shouldRefresh
    );

    if (result.success) {
      req.user = result.data.user;
      req.userInfo = result.data.userInfo;
      req.isAuthenticated = true;

      if (result.data.refreshed && result.data.fullUserData) {
        const cookieResult = setAuthCookies(res, result.data.fullUserData, { 
          rememberMe: true 
        });
        
        if (cookieResult.success) {
          res.setHeader('X-Token-Refreshed', 'true');
        } else {
          console.warn('Failed to update cookies after token refresh:', cookieResult.message);
        }
      }
    } else {
      req.user = null;
      req.userInfo = null;
      req.isAuthenticated = false;
    }

    next();
  } catch (error) {
    console.error('OptionalAuth middleware error:', error);
    req.user = null;
    req.userInfo = null;
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
      console.warn('requireRole middleware called without specifying required role');
      return next();
    }

    const userRole = req.user.role;
    if (!userRole) {
      return res.status(403).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.INSUFFICIENT_PERMISSIONS,
        { reason: 'User has no role assigned' }
      ));
    }

    if (options.strict) {
      if (userRole !== requiredRole) {
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
        console.warn(`Unknown required role: ${requiredRole}`);
        return res.status(500).json(createErrorResponse(
          new Error(`Invalid role configuration: ${requiredRole}`),
          ERROR_TYPES.AUTH.TOKEN.VALIDATION_ERROR
        ));
      }

      if (userLevel < requiredLevel) {
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

const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const result = schema.parse(req.body);
      req.validatedData = result;
      next();
    } catch (error) {
      return res.status(400).json(createErrorResponse(
        error,
        ERROR_TYPES.AUTH.TOKEN.VALIDATION_ERROR,
        { details: error.issues ? error.issues.map(issue => issue.message) : [error.message] }
      ));
    }
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

    return res.status(403).json(createErrorResponse(
      null,
      ERROR_TYPES.AUTH.USER.INSUFFICIENT_PERMISSIONS,
      { reason: 'Access denied: not owner or admin' }
    ));
  };
};

export { requireAuth, optionalAuth, requireRole, validateRequest, requireOwnershipOrAdmin };