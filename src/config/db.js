import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
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

const enableDbLogger = process.env.NODE_ENV !== 'production';

const db = drizzle(pool, { logger: enableDbLogger });

export { db };