import express from 'express';
import { requireAuth, optionalAuth, requireRole, validateRequest } from '../middlewares/authMiddleware.js';
import { loginSchema, registerSchema } from '../utils/authTableValidation.js';
import { register, login, logout, getCurrentUser, refreshToken } from '../controllers/authController.js'; 

const router = express.Router();

router.post('/login', validateRequest(loginSchema), login);
router.post('/register', validateRequest(registerSchema), register);
router.post('/refresh', refreshToken);

router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, getCurrentUser);

export { router };