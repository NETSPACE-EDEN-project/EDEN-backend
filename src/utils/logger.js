import dotenv from 'dotenv';

dotenv.config();

const createLogger = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    info: (message, meta = {}) => {
      if (!isProduction) {
        console.log(`[INFO] ${message}`, meta);
      }
    },
    
    error: (message, error = null) => {
      console.error(`[ERROR] ${message}`, error?.message || error);
    },
    
    debug: (message, meta = {}) => {
      if (!isProduction) {
        console.log(`[DEBUG] ${message}`, sanitizeForLog(meta));
      }
    },
    
    security: (message, userId = null) => {
      console.log(`[SECURITY] ${message}`, userId ? `User: [REDACTED]` : '');
    },

    socket: (message, socketId = null) => {
      if (!isProduction) {
        console.log(`[SOCKET] ${message}`, socketId ? `Socket: ${socketId.substring(0, 8)}...` : '');
      }
    }
  };
};

const sanitizeForLog = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitive = ['password', 'token', 'email', 'phone', 'secret', 'cookie'];
  const result = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (sensitive.some(s => key.toLowerCase().includes(s))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeForLog(value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
};

export const logger = createLogger();