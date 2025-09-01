import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
	connectionString: process.env.DATABASE_URL
});

const db = drizzle(pool, { logger: true });

export { db };