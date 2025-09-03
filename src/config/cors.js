import dotenv from 'dotenv';
import { createErrorResponse, ERROR_TYPES } from '../utils/errorUtils';

dotenv.config();

const corsOptions = {
  origin: function (origin, callback) {
    if (process.env.NODE_ENV === 'production' && !origin) {
      const err = createErrorResponse(
        null,
        'CORS policy: origin is required in production',
        ERROR_TYPES.INVALID_INPUT
      );
      return callback(err, false);
    }

    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173'
    ];

    if (allowedOrigins.includes(origin) || !origin) {
      return callback(null, true);
    } else {
      console.warn(`CORS rejected: ${origin}`);
      const err = createErrorResponse(
        null,
        `CORS policy violation: ${origin} is not allowed`,
        ERROR_TYPES.INVALID_INPUT
      );
      return callback(err, false);
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

export { corsOptions };