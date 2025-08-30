const COOKIE_NAMES = {
  AUTH_TOKEN: 'auth_token',
  USER_DISPLAY: 'user_display', 
  REMEMBER_ME: 'remember_me'
};

const cookieConfig = {
	auth_token: {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		maxAge: 2 * 60 * 60 * 1000,
		path: '/',                                        
    signed: true
	},
	user_display: {
		httpOnly: false,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		maxAge: 7 * 24 * 60 * 60 * 1000,
		path: '/',
    signed: true
	},
	remember_me: {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		maxAge: 7 * 24 * 60 * 60 * 1000,
		path: '/',
    signed: true
	}
};

const clearCookieConfig = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
	signed: true,
  expires: new Date(0)
};

export { COOKIE_NAMES, cookieConfig, clearCookieConfig };