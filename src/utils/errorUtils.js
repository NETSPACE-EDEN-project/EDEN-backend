const createErrorResponse = (error, message, errorType = 'UnknownError') => ({
  success: false,
  error: errorType,
  message
});

const createSuccessResponse = (data, message = null) => ({
  success: true,
  ...(data && { data }),
  ...(message && { message })
});

const getJWTErrorMessage = (error) => {
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


const ERROR_TYPES = {
  COOKIE_ERROR: 'CookieError',
  CLEAR_COOKIE_ERROR: 'ClearCookieError',
  COOKIE_PARSE_ERROR: 'CookieParseError',
  NO_REFRESH_TOKEN: 'NoRefreshToken',
  REFRESH_ERROR: 'RefreshError',
  GENERATE_ERROR: 'GenerateError',
  INVALID_INPUT: 'InvalidInput',
  DECODE_ERROR: 'DecodeError'
};

export { createErrorResponse, createSuccessResponse, getJWTErrorMessage, ERROR_TYPES }