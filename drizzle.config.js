import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

const sslConfig = process.env.DATABASE_SSL === 'true' ? {
  rejectUnauthorized: false
} : false;

export default  defineConfig({
	schema: './src/models/schema.js',
	out: "./src/drizzle/migrations",
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: sslConfig,
  }
})