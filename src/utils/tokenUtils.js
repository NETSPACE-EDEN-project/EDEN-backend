import jwt from 'jsonwebtoken';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from './errorUtils.js';

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
			return createErrorResponse(
				new Error('Token is required'), 
				'Token is required', 
				ERROR_TYPES.INVALID_INPUT
			);
		}

		const decoded = jwt.decode(token);
		if (!decoded) {
			return createErrorResponse(
				new Error('Unable to decode token'), 
				'Unable to decode token', 
				ERROR_TYPES.DECODE_ERROR
			);
		}

		return createSuccessResponse(decoded);
	} catch (error) {
		return createErrorResponse(
			error, 
			'Token decode failed', 
			ERROR_TYPES.DECODE_ERROR
		);
	}
};

const isTokenExpiringSoon = (token, thresholdMinutes = 5) => {
	try {
		if (!token) {
			return true;
		}

		const decoded = jwt.decode(token);
		if (!decoded || !decoded.exp) {
			return true;
		}

		const currentTime = Math.floor(Date.now() / 1000);
		const threshold = thresholdMinutes * 60;

		return decoded.exp - currentTime < threshold;
	} catch (error) {
		console.error('Error checking token expiration:', error);
		return true;
	}
};

export {
	buildTokenPayload,
	decodeToken,
	isTokenExpiringSoon
}