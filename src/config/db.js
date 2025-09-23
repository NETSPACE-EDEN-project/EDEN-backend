import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import dotenv from 'dotenv';

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
  console.error('Database connection error:', err);
});

pool.on('connect', () => {
  console.log('Database connected successfully');
});

const db = drizzle(pool, { logger: true });

export { db };