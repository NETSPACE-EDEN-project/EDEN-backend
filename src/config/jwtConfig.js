const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;
if (!JWT_SECRET || !REFRESH_SECRET) {
	console.error('JWT_SECRET and REFRESH_SECRET must be set in the environment variables');
	process.exit(1);
};

const JWT_CONFIG = {
	access: {
		secret: JWT_SECRET,
		expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '2h'
	},
	refresh:{
		secret: REFRESH_SECRET,
		expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'
	}
};

export { JWT_CONFIG };