import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/authConfig.js';
import { buildTokenPayload, getErrorMessage } from '../../utils/tokenUtils.js'

const generateAccessToken = (user) => {
	try {
		const payload = buildTokenPayload(user, 'access');
		const token = jwt.sign(payload, JWT_CONFIG.access.secret, { expiresIn: JWT_CONFIG.access.expiresIn });

		return { success: true, data: token };
	} catch (error) {
		console.error('Error generating access token:', error);
		return { success: false, error: 'GenerateError', message: 'Access Token 簽發失敗，請稍後再試' };
	}
};

const generateRefreshToken = (user) => {
	try {
		const payload = buildTokenPayload(user, 'refresh');
		const token = jwt.sign(payload, JWT_CONFIG.refresh.secret, { expiresIn: JWT_CONFIG.refresh.expiresIn });

		return { success: true, data: token };
	} catch (error) {
		console.error('Error generating refresh token:', error);
		return { success: false, error: 'GenerateError', message: 'Refresh Token 簽發失敗，請稍後再試' };
	}
};

const generateTokenPair = (user) => {
	try {
		const accessResult = generateAccessToken(user);
		const refreshResult = generateRefreshToken(user);
		
		if (!accessResult.success) return accessResult;
		if (!refreshResult.success) return refreshResult;

		return { 
			success: true, 
			data: { 
				accessToken: accessResult.data, 
				refreshToken: refreshResult.data 
			} 
		};
	} catch (error) {
		console.error('Error generating token pair:', error);
		return { success: false, error: 'GenerateError', message: 'Token Pair 簽發失敗，請稍後再試' };
	}
}

const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.access.secret);
    if (decoded.type !== 'access') throw new Error('Invalid token type');
    return { success: true, data: decoded };
  } catch (error) {
    console.error('Access Token verification failed:', error.message);
    return { success: false, error: error.name, message: getErrorMessage(error) };
  }
};

const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.refresh.secret);
    if (decoded.type !== 'refresh') throw new Error('Invalid token type');
    return { success: true, data: decoded };
  } catch (error) {
    console.error('Refresh Token verification failed:', error.message);
    return { success: false, error: error.name, message: getErrorMessage(error) };
  }
};

const refreshAccessToken = (refreshToken, userInfo) => {
  try {
    const refreshResult = verifyRefreshToken(refreshToken);
    if (!refreshResult.success) return refreshResult;

    const refreshData = refreshResult.data;

		const userForToken = {
      id: refreshData.id,
      username: userInfo.username,
      email: userInfo.email,
      role: refreshData.role,
      status: userInfo.status,
      providerType: userInfo.providerType
    };

    const accessResult = generateAccessToken(userForToken);

		if (!accessResult.success) return accessResult;

    return { success: true, data: { accessToken: accessResult.data, userId: refreshData.id } };
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return { success: false, error: 'RefreshError', message: 'Token refresh failed, please login again' };
  }
};

export {
	generateAccessToken,
	generateRefreshToken,
	generateTokenPair,
	verifyAccessToken,
	verifyRefreshToken,
	refreshAccessToken
}