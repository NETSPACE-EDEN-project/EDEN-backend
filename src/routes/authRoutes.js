import express from 'express';
import { requireAuth, optionalAuth, requireRole, validateRequest } from '../middlewares/authMiddleware.js';
import { loginSchema, registerSchema } from '../utils/authTableValidation.js';
import { register, login, logout, getCurrentUserHandler, refreshToken, loginWithProvider, verifyAuthStatus } from '../controllers/authController.js'; 

const router = express.Router();

router.post('/login', validateRequest(loginSchema), login);
router.post('/register', validateRequest(registerSchema), register);
router.post('/refresh', refreshToken);

router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, getCurrentUserHandler);

router.get('/verify', optionalAuth, verifyAuthStatus);

router.get('/admin/users', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ message: '管理員功能' });
});

router.delete('/admin/users/:id', 
  requireAuth, 
  requireRole('superadmin', { strict: true }),
  (req, res) => {
    res.json({ message: '刪除用戶' });
  }
);

export { router };