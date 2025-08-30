import { COOKIE_NAMES, cookieConfig, clearCookieConfig } from '../../config/cookie.js';
import { generateTokenPair, verifyAccessToken, verifyRefreshToken, refreshAccessToken } from './tokenService.js';
import { isTokenExpiringSoon } from '../../utils/tokenUtils.js';

const createDisplayInfo = (user) => ({
  id: user.id,
  username: user.username,
  avatarUrl: user.avatarUrl || null,
  role: user.role,
  providerType: user.providerType || null,
  lastLoginAt: new Date().toISOString()
});

const setAuthCookies = (res, user, options = {}) => {
	try {
		const tokenResult = generateTokenPair(user);
		if (!tokenResult.success) {
			console.error('Token generation failed:', tokenResult.message);
			return { success: false, error: tokenResult.error, message: tokenResult.message };
		}
		const { accessToken, refreshToken } = tokenResult.data;
		res.cookie(COOKIE_NAMES.AUTH_TOKEN, accessToken, cookieConfig.auth_token);
		if (options.rememberMe) {
      res.cookie(COOKIE_NAMES.REMEMBER_ME, refreshToken, cookieConfig.remember_me);
    }

		const displayInfo = createDisplayInfo(user);
		res.cookie(COOKIE_NAMES.USER_DISPLAY, JSON.stringify(displayInfo), cookieConfig.user_display);

		return { success: true, data: { accessToken, refreshToken: options.rememberMe ? refreshToken : null,displayInfo } };
	} catch (error) {
		console.error('Error setting auth cookies:', error);
		return { success: false, error: 'CookieError', message: 'Failed to set authentication cookies' };
	}
};

const clearAuthCookies = (res) => {
	try {
		res.clearCookie(COOKIE_NAMES.AUTH_TOKEN, clearCookieConfig);
		res.clearCookie(COOKIE_NAMES.USER_DISPLAY, clearCookieConfig);
		res.clearCookie(COOKIE_NAMES.REMEMBER_ME, clearCookieConfig);

		return { success: true, message: 'Authentication cookies cleared successfully' };
	} catch (error) {
		console.error('Error clearing auth cookies:', error);
		return { success: false, error: 'ClearCookieError', message: 'Failed to clear authentication cookies' };
	}
};

const getFromCookies = (req) => {
	try {
		const authToken = req.signedCookies?.[COOKIE_NAMES.AUTH_TOKEN];
		const refreshToken = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];
		const displayInfoRaw = req.signedCookies?.[COOKIE_NAMES.USER_DISPLAY];

		let userInfo = null;
		if (displayInfoRaw) {
			try {
				userInfo = JSON.parse(displayInfoRaw);
			} catch (error) {
				console.warn('Failed to parse user display info:', error);
			}
		}

		let validAccessToken = null;
		let accessTokenData = null;
		if (authToken) {
			const verifyResult = verifyAccessToken(authToken);
			if (verifyResult.success) {
				validAccessToken = authToken;
				accessTokenData = verifyResult.data;
			}
		}

		let validRefreshToken = null;
		let refreshTokenData = null;
		if (refreshToken) {
			const verifyResult = verifyRefreshToken(refreshToken);
			if (verifyResult.success) {
				validRefreshToken = refreshToken;
				refreshTokenData = verifyResult.data;
			}
		}

		return { 
			success: true, 
			data: { 
				accessToken: validAccessToken, 
				refreshToken: validRefreshToken, 
				userInfo, 
				tokenData: { 
					access: accessTokenData, 
					refresh: refreshTokenData 
				}, 
				hasValidAuth: !!validAccessToken, 
				hasRememberMe: !!validRefreshToken 
			} 
		};
	} catch (error) {
		console.error('Error getting cookies:', error);
		return { 
			success: false, 
			error: 'CookieParseError', 
			message: 'Failed to parse cookies' 
		};
	};
};

const refreshTokenFromCookies = (req, res, userInfo) => {
	try {
		const refreshToken = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];
		if (!refreshToken) {
			return { 
				success: false, 
				error: 'NoRefreshToken', 
				message: 'No refresh token found in cookies' 
			};
		}

		const refreshResult = refreshAccessToken(refreshToken, userInfo);
		if (!refreshResult.success) {
			clearAuthCookies(res);
			return refreshResult;
		}

		const { accessToken, userId } = refreshResult.data;
		res.cookie(COOKIE_NAMES.AUTH_TOKEN, accessToken, cookieConfig.auth_token);

		const displayInfo = createDisplayInfo(userInfo);
		res.cookie(COOKIE_NAMES.USER_DISPLAY, JSON.stringify(displayInfo), cookieConfig.user_display);

		return {
			success: true,
			data: {
				accessToken,
				userId,
				refreshed: true,
				displayInfo
			}
		};

	} catch (error) {
		console.error('Error refreshing token from cookies:', error);
		clearAuthCookies(res);
		return { 
			success: false, 
			error: 'RefreshError', 
			message: 'Token refresh failed, please login again' 
		};
	}
};

const shouldRefreshToken = (req) => {
	try {
		const authToken = req.signedCookies?.[COOKIE_NAMES.AUTH_TOKEN];
		const refreshToken = req.signedCookies?.[COOKIE_NAMES.REMEMBER_ME];
		
		if (!authToken && refreshToken) {
			return { shouldRefresh: true, reason: 'No access token but has refresh token' };
		}
		
		if (!authToken) {
			return { shouldRefresh: false, reason: 'No tokens available' };
		}

		if (isTokenExpiringSoon(authToken)) {
			if (!refreshToken) {
				return { shouldRefresh: false, reason: 'Token expiring but no refresh token' };
			}
			return { shouldRefresh: true, reason: 'Token expiring soon' };
		}

		const verifyResult = verifyAccessToken(authToken);
		if (!verifyResult.success) {
			if (!refreshToken) {
				return { shouldRefresh: false, reason: 'Token invalid but no refresh token' };
			}
			return { shouldRefresh: true, reason: 'Token invalid' };
		}

		return { shouldRefresh: false, reason: 'Token valid' };
	} catch (error) {
		console.error('Error checking if should refresh token:', error);
		return { shouldRefresh: false, reason: 'Check failed' };
	}
};

const autoRefreshToken = async (req, res, next) => {
	try {
		const checkResult = shouldRefreshToken(req);
		
		if (checkResult.shouldRefresh) {
			console.log(`Token refresh needed: ${checkResult.reason}`);
			
			const userDisplayRaw = req.signedCookies?.[COOKIE_NAMES.USER_DISPLAY];
			if (userDisplayRaw) {
				try {
					const userInfo = JSON.parse(userDisplayRaw);
					const refreshResult = refreshTokenFromCookies(req, res, userInfo);
					
					if (refreshResult.success) {
						console.log(`Token auto-refreshed for user: ${userInfo.username}`);
						req.tokenRefreshed = true;
					} else {
						console.warn(`Auto refresh failed for user ${userInfo.username}:`, refreshResult.message);
						req.refreshFailed = true;
					}
				} catch (parseError) {
					console.error('Failed to parse user info for refresh:', parseError);
				}
			} else {
				console.warn('Need to refresh but no user display info found');
			}
		}

		next();
	} catch (error) {
		console.error('Auto refresh middleware error:', error);
		next();
	}
};


export { setAuthCookies, clearAuthCookies, getFromCookies, refreshTokenFromCookies, shouldRefreshToken, autoRefreshToken }