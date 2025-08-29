import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

module.exports = defineConfig({
	schema: './src/models/schema.js',
	out: "./src/drizzle/migrations",
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  }
})