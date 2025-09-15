import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

if (!JWT_SECRET || !REFRESH_SECRET) {
  console.error('JWT_SECRET and REFRESH_SECRET must be set in the environment variables');
  process.exit(1);
}

const JWT_CONFIG = {
  access: {
    secret: JWT_SECRET,
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m'
  },
  refresh: {
    secret: REFRESH_SECRET,
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'
  }
};

const COOKIE_NAMES = {
  AUTH_TOKEN: 'auth_token',
  USER_DISPLAY: 'user_display', 
  REMEMBER_ME: 'remember_me'
};

const cookieConfig = {
  auth_token: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    domain: process.env.NODE_ENV === 'production' ? '.zeabur.app' : undefined,
    maxAge: 2 * 60 * 60 * 1000,
    path: '/',
    signed: true
  },
  user_display: {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    domain: process.env.NODE_ENV === 'production' ? '.zeabur.app' : undefined,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
    signed: true
  },
  remember_me: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    domain: process.env.NODE_ENV === 'production' ? '.zeabur.app' : undefined,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
    signed: true
  }
};

const clearCookieConfig = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  domain: process.env.NODE_ENV === 'production' ? '.zeabur.app' : undefined,
  path: '/',
  signed: true,
  expires: new Date(0)
};

export { JWT_CONFIG, COOKIE_NAMES, cookieConfig, clearCookieConfig };