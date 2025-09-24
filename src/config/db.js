import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const sslConfig = process.env.DATABASE_SSL === 'true' ? {
  rejectUnauthorized: false
} : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('資料庫連線錯誤', err);
});

pool.on('connect', () => {
  logger.info('資料庫連線成功');
});

// 在生產環境關閉 Drizzle 查詢日誌以避免敏感資料洩露
const enableDbLogger = process.env.NODE_ENV !== 'production';

const db = drizzle(pool, { logger: enableDbLogger });

export { db };