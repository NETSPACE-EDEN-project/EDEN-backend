import { verifyAuth } from '../services/auth/authService.js';
import { createErrorResponse, ERROR_TYPES } from '../utils/errorUtils.js';

const requireAuth = async (req, res, next) => {
  try {
    const authResult = await verifyAuth(req, res);

    if (!authResult.success) {
      return res.status(401).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.AUTHENTICATION_REQUIRED
      ));
    }

    req.user = authResult.data.user;
    req.userInfo = authResult.data.userInfo;

    if (authResult.data.refreshed) {
      res.setHeader('X-Token-Refreshed', 'true');
    }

    next();
  } catch (error) {
    console.error('RequireAuth middleware error:', error);
    return res.status(500).json(createErrorResponse(
      error,
      ERROR_TYPES.AUTH.TOKEN.AUTH_VERIFICATION_FAILED
    ));
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authResult = await verifyAuth(req, res);

    if (authResult.success) {
      req.user = authResult.data.user;
      req.userInfo = authResult.data.userInfo;
      req.isAuthenticated = true;

      if (authResult.data.refreshed) {
        res.setHeader('X-Token-Refreshed', 'true');
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

const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.AUTHENTICATION_REQUIRED
      ));
    }

    const roleHierarchy = {
      user: 1,
      admin: 2
    };

    const userLevel = roleHierarchy[req.user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    if (userLevel < requiredLevel) {
      return res.status(403).json(createErrorResponse(
        null,
        ERROR_TYPES.AUTH.USER.INSUFFICIENT_PERMISSIONS
      ));
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
        { details: error.issues.map(issue => issue.message) }
      ));
    }
  };
};

export { requireAuth, optionalAuth, requireRole, validateRequest };
