import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/authConfig.js';

const buildDisplayInfo = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  avatarUrl: user.avatarUrl || null,
  role: user.role || 'user',
  status: user.status,
  providerType: user.providerType || null,
  lastLoginAt: user.lastLoginAt || new Date().toISOString()
});

const buildTokenPayload = (user, type) => {
  if (type === 'access') {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl || null,
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

const isTokenExpiringSoon = (token, thresholdMinutes = 5) => {
  try {
    if (!token) return true;

    const decoded = jwt.verify(token, JWT_CONFIG.access.secret);
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

export {
  buildTokenPayload,
  isTokenExpiringSoon,
  buildDisplayInfo
};