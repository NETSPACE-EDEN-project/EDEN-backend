import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5500',
  'https://eden-frontend.zeabur.app',
  ...(process.env.ALLOWED_ORIGINS?.split(',') || [])
];

const corsOptions = {
  origin: (origin, callback) => {
    logger.debug('CORS 檢查', { 
      origin: origin || 'no-origin',
      hasOrigin: !!origin 
    });
    
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      logger.debug('CORS 允許', { origin });
      return callback(null, true);
    } else {
      logger.security('CORS 請求被拒絕', null, { 
        rejectedOrigin: origin,
        allowedOrigins: allowedOrigins.length 
      });
      return callback(new Error(`CORS policy violation: ${origin} is not allowed`), false);
    }
  },

  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],

  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-CSRF-Token',
    'X-API-Key',
    'If-Modified-Since',
    'Range'
  ],

  credentials: true,

  maxAge: 86400,

  exposedHeaders: [
    'Authorization',
    'X-Total-Count',
    'X-RateLimit-Remaining'
  ]
};

export { corsOptions, allowedOrigins };