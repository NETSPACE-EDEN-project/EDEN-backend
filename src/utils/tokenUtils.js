import jwt from 'jsonwebtoken';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from './responseUtils.js';

const buildTokenPayload = (user, type) => {
  if (type === 'access') {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role || 'user',
      status: user.status,
      providerType: user.providerType,
      type: 'access'
    };
  } else if (type === 'refresh') {
    return {
      id: user.id,
      role: user.role || 'user',
      providerType: user.providerType,
      type: 'refresh'
    };
  } else {
    throw new Error('Invalid token type. Must be "access" or "refresh"');
  }
};

const decodeToken = (token) => {
  try {
    if (!token) {
      return createErrorResponse(
        new Error('Token is required'), 
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    const decoded = jwt.decode(token);
    if (!decoded) {
      return createErrorResponse(
        new Error('Unable to decode token'), 
        ERROR_TYPES.AUTH.TOKEN.DECODE_ERROR
      );
    }

    return createSuccessResponse(decoded);
  } catch (error) {
    return createErrorResponse(error, ERROR_TYPES.AUTH.TOKEN.DECODE_ERROR);
  }
};

const isTokenExpiringSoon = (token, thresholdMinutes = 5) => {
  try {
    if (!token) return true;

    const decoded = jwt.decode(token);
    if (!decoded) {
      console.warn('Invalid JWT format when checking expiration');
      return true;
    }

    if (!decoded.exp) return true;

    const currentTime = Math.floor(Date.now() / 1000);
    const threshold = thresholdMinutes * 60;

    return decoded.exp - currentTime < threshold;
  } catch (error) {
    console.error('Error checking token expiration:', error);
    return true;
  }
};

const createDisplayInfo = (user) => ({
  id: user.id,
  username: user.username,
  avatarUrl: user.avatarUrl || null,
  role: user.role || 'user',
  providerType: user.providerType || null,
  lastLoginAt: user.lastLoginAt || new Date().toISOString()
});

export {
  buildTokenPayload,
  decodeToken,
  isTokenExpiringSoon,
  createDisplayInfo
};