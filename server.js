import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { corsOptions } from './src/config/cors.js';
import { autoRefreshToken } from './src/services/auth/cookieService.js';

import { router as authRoutes } from './src/routes/authRoutes.js';

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors(corsOptions));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(autoRefreshToken);

app.use('/auth', authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});