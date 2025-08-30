import jwt from 'jsonwebtoken';

const buildTokenPayload = (user, type) => {
	if (type === 'access') {
		return {
			id: user.id,
			username: user.username,
			email: user.email,
			role: user.role || 'user',
			status: user.status,
			providerType: user.providerType,
			type: 'access'
		};
	} else {
		return {
			id: user.id,
			role: user.role || 'user',
			type: 'refresh'
		};
	}
};

const decodeToken = (token) => {
	try {
		if (!token) {
			return { success: false, error: 'InvalidInput', message: 'Token is required' };
		}

		const decoded = jwt.decode(token);
		if (!decoded) {
			return { success: false, error: 'DecodeError', message: 'Unable to decode token' };
		}

		return { success: true, data: decoded };
	} catch (error) {
		console.error('Error decoding token:', error);
		return { success: false, error: 'DecodeError', message: 'Token decode failed' };
	}
};

const isTokenExpiringSoon = (token, thresholdMinutes = 5) => {
	try {
		const decoded = jwt.decode(token);
		if (!decoded || !decoded.exp) return true;

		const currentTime = Math.floor(Date.now() / 1000);
		const threshold = thresholdMinutes * 60;

		return decoded.exp - currentTime < threshold;
	} catch (error) {
		return true;
	}
};

const getErrorMessage = (error) => {
  switch (error.name) {
    case 'TokenExpiredError':
      return 'Token 已過期，請重新登入';
    case 'JsonWebTokenError':
      return 'Token 格式無效';
    case 'NotBeforeError':
      return 'Token 尚未生效';
    default:
      return 'Token 驗證失敗';
  }
};

export {
	buildTokenPayload,
	decodeToken,
	isTokenExpiringSoon,
	getErrorMessage
}