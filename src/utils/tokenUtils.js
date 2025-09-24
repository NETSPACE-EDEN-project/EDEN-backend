import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/authConfig.js';
import { logger } from './logger.js';

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
    logger.error('無效的 token 類型', { type });
    throw new Error('Invalid token type. Must be "access" or "refresh"');
  }
};

const isTokenExpiringSoon = (token, thresholdMinutes = 5) => {
  try {
    if (!token) return true;

    const decoded = jwt.verify(token, JWT_CONFIG.access.secret);
    if (!decoded) {
      logger.debug('檢查 token 到期時間時，JWT 格式無效');
      return true;
    }

    if (!decoded.exp) return true;

    const currentTime = Math.floor(Date.now() / 1000);
    const threshold = thresholdMinutes * 60;

    const timeUntilExpiry = decoded.exp - currentTime;
    const isExpiring = timeUntilExpiry < threshold;

    logger.debug('Token 到期檢查', {
      timeUntilExpiry,
      thresholdMinutes,
      isExpiring
    });

    return isExpiring;
  } catch (error) {
    logger.debug('檢查 token 到期時間失敗', error);
    return true;
  }
};

export {
  buildTokenPayload,
  isTokenExpiringSoon,
  buildDisplayInfo
};