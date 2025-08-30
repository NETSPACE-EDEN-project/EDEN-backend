const corsOptions = {
	origin: function (origin, callback) {
		if (process.env.NODE_ENV === 'production' && !origin) {
      return callback(new Error('CORS policy: origin is required in production'), false);
    }

		const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
			'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173'
		];

		if (allowedOrigins.includes(origin) || !origin) {
      return callback(null, true);
    } else {
			console.warn(`CORS rejected: ${origin}`);
			return callback(new Error(`CORS policy violation: ${origin} is not allowed`), false);
		}
	},

	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],

	allowedHeaders: [
		'Origin',
		'X-Requested-With',
		'Content-Type',
		'Accept',
		'Authorization',
		'Cache-Control',
		'X-CSRF-Token',
    'X-API-Key',
    'If-Modified-Since',
    'Range'
	],

	credentials: true,

	maxAge: 86400,

	exposedHeaders: [
		'Authorization',
		'X-Total-Count',
    'X-RateLimit-Remaining'
	]
};

export { corsOptions };