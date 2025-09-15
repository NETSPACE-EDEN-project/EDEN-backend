import dotenv from 'dotenv';

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
    console.log('CORS check - Origin:', origin); // 添加日誌查看問題
    
    // 允許沒有 origin 的請求
    if (!origin) {
      return callback(null, true);
    }

    // 檢查允許的來源
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.warn(`CORS rejected: ${origin}`);
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

export { corsOptions };