import { logger } from './logger.js';

const createErrorResponse = (error, errorType = null, extra = null) => {
  let code = 'UnknownError';
  let message = '發生錯誤';

  if (errorType && errorType.code && errorType.message) {
    code = errorType.code;
    message = errorType.message;
  }

  if (error) {
    logger.error('創建錯誤回應', { 
      code, 
      message,
      hasExtra: !!extra,
      errorType: error.name || 'Error'
    });
  }

  return {
    success: false,
    error,
    code: code,
    message: message,
    ...(extra && { extra })
  };
};

const createSuccessResponse = (data = null, message = null) => {
  // 只在調試模式記錄成功回應
  logger.debug('創建成功回應', { 
    hasData: !!data,
    hasMessage: !!message 
  });

  return {
    success: true,
    ...(data && { data }),
    ...(message && { message })
  };
};

const ERROR_TYPES = {
  AUTH: {
    USER: {
      EMAIL_ALREADY_EXISTS:       { code: 'EmailAlreadyExists', message: '此信箱已被註冊' },
      REGISTRATION_FAILED:        { code: 'RegistrationFailed', message: '註冊失敗，請稍後再試' },
      INVALID_USER_INFO:          { code: 'InvalidUserInfo', message: '缺少必要的用戶資訊' },
      MISSING_EMAIL_INFO:         { code: 'MissingEmailInfo', message: 'Email 登入用戶缺少 email 資訊' },
      INVALID_EMAIL_FORMAT:       { code: 'InvalidEmailFormat', message: '無效的 email 格式' },
      ACCOUNT_STATUS_INVALID:     { code: 'AccountStatusInvalid', message: '帳號狀態異常，請聯繫管理員' },
      EMAIL_NOT_VERIFIED:         { code: 'EmailNotVerified', message: '請先驗證您的 email' },
      AUTHENTICATION_REQUIRED:    { code: 'AuthenticationRequired', message: '請先登入' },
      INSUFFICIENT_PERMISSIONS:   { code: 'InsufficientPermissions', message: '權限不足' },
      USER_NOT_FOUND:             { code: 'UserNotFound', message: '找不到該信箱的用戶' },
      EMAIL_ALREADY_VERIFIED:     { code: 'EmailAlreadyVerified', message: '信箱已經驗證過了' },
      TOO_MANY_REQUESTS:          { code: 'TooManyRequests', message: '請等待5分鐘後再重新發送驗證信' }
    },

    SESSION: {
      INVALID_CREDENTIALS:        { code: 'InvalidCredentials', message: '帳號或密碼錯誤' },
      LOGIN_FAILED:               { code: 'LoginFailed', message: '登入失敗，請稍後再試' },
      LOGOUT_FAILED:              { code: 'LogoutFailed', message: '登出失敗' },
      GET_USER_FAILED:            { code: 'GetUserFailed', message: '獲取用戶資訊失敗' }
    },

    TOKEN: {
      AUTH_READ_FAILED:           { code: 'AuthReadFailed', message: '無法讀取認證資訊' },
      AUTH_EXPIRED:               { code: 'AuthExpired', message: '認證已失效，請重新登入' },
      AUTH_VERIFICATION_FAILED:   { code: 'AuthVerificationFailed', message: '認證驗證失敗' },
      NO_REFRESH_TOKEN:           { code: 'NoRefreshToken', message: '缺少刷新 Token' },
      REFRESH_ERROR:              { code: 'RefreshError', message: '刷新 Token 失敗' },
      GENERATE_ERROR:             { code: 'GenerateError', message: '生成 Token 失敗' },
      GENERATE_ACCESS_TOKEN_ERROR:{ code: 'GenerateAccessTokenError', message: '生成 accessToken 失敗' },
      GENERATE_REFRESH_TOKEN_ERROR:{ code: 'GenerateRefreshTokenError', message: '生成 refreshToken 失敗' },
      GENERATE_TOKEN_PAIR_ERROR:  { code: 'GenerateTokenPairError', message: '生成 tokenPair 失敗' },
      DECODE_ERROR:               { code: 'DecodeError', message: 'Token 解碼失敗' },
      INVALID_INPUT:              { code: 'InvalidInput', message: '輸入資料無效' },
      VALIDATION_ERROR:           { code: 'ValidationError', message: '請求資料驗證失敗' },
      INVALID_TOKEN_TYPE:         { code: 'InvalidTokenType', message: '無效的 Token 型別' },
      EMAIL_SEND_FAILED:          { code: 'EmailSendFailed', message: '郵件發送失敗，請稍後再試' },
      INVALID_TOKEN:              { code: 'InvalidToken', message: '無效的驗證碼' },
      TOKEN_EXPIRED:              { code: 'TokenExpired', message: '驗證碼已過期，請重新發送' }
    },

    COOKIE: {
      COOKIE_ERROR:               { code: 'CookieError', message: 'Cookie 錯誤' },
      CLEAR_COOKIE_ERROR:         { code: 'ClearCookieError', message: '清除 Cookie 失敗' },
      COOKIE_PARSE_ERROR:         { code: 'CookieParseError', message: '解析 Cookie 失敗' }
    },

    PROVIDER: {
      PROVIDER_LOGIN_FAILED:      { code: 'ProviderLoginFailed', message: '第三方登入失敗' }
    }
  },

  CHAT: {
    ROOM: {
      CREATE_ROOM_FAILED:         { code: 'CreateRoomFailed', message: '聊天室建立失敗' },
      ROOM_NOT_FOUND:             { code: 'RoomNotFound', message: '聊天室不存在' },
      JOIN_ROOM_FAILED:           { code: 'JoinRoomFailed', message: '加入聊天室失敗' },
      ALREADY_MEMBER:             { code: 'AlreadyMember', message: '已經是聊天室成員' },
      INVALID_ROOM_ID:            { code: 'InvalidRoomId', message: '無效的聊天室 ID' }
    },

    MEMBER: {
      NOT_ROOM_MEMBER:            { code: 'NotRoomMember', message: '非聊天室成員' },
      INVALID_MEMBER_IDS:         { code: 'InvalidMemberIds', message: '無效的成員 ID' }
    },

    MESSAGE: {
      GET_MESSAGES_FAILED:        { code: 'GetMessagesFailed', message: '取得訊息失敗' },
      INVALID_PAGINATION:         { code: 'InvalidPagination', message: '無效的分頁資訊' }
    },

    LIST: {
      GET_ROOMS_FAILED:           { code: 'GetRoomsFailed', message: '取得聊天室列表失敗' }
    }
  },

  POST: {
    POST: {
      CREATE_POST_FAILED:         { code: 'CreatePostFailed', message: '貼文建立失敗' },
      POST_NOT_FOUND:             { code: 'PostNotFound', message: '貼文不存在' },
      INVALID_POST_ID:            { code: 'InvalidPostId', message: '無效的貼文 ID' },
      EMPTY_CONTENT:              { code: 'EmptyContent', message: '貼文內容不能為空' }
    },

    FEED: {
      GET_FEED_FAILED:            { code: 'GetFeedFailed', message: '取得貼文列表失敗' }
    },

    LIKE: {
      TOGGLE_LIKE_FAILED:         { code: 'ToggleLikeFailed', message: '更新按讚狀態失敗' }
    }
  }
};

export { createErrorResponse, createSuccessResponse, ERROR_TYPES };