import { verifyAuth } from '../services/auth/authService.js';

const requireAuth = async (req, res, next) => {
  try {
    const authResult = await verifyAuth(req, res);
    
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: '請先登入'
      });
    }

    req.user = authResult.data.user;
    req.userInfo = authResult.data.userInfo;

    if (authResult.data.refreshed) {
      res.setHeader('X-Token-Refreshed', 'true');
    }

    next();
  } catch (error) {
    console.error('RequireAuth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'AUTH_MIDDLEWARE_ERROR',
      message: '認證檢查失敗'
    });
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
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: '請先登入'
      });
    }

    const roleHierarchy = {
      'user': 1,
      'admin': 2
    };

    const userLevel = roleHierarchy[req.user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_PERMISSIONS',
        message: '權限不足'
      });
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
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.issues.map(issue => issue.message).join(', '),
        details: error.issues
      });
    }
  };
};

export { requireAuth, optionalAuth, requireRole, validateRequest };