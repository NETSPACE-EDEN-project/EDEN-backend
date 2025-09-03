const createErrorResponse = (error, message, errorType = 'UnknownError') => {
  console.error(error);
  return {
    success: false,
    error: errorType,
    message
  };
};

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
  // 原有的認證錯誤
  COOKIE_ERROR: 'CookieError',
  CLEAR_COOKIE_ERROR: 'ClearCookieError',
  COOKIE_PARSE_ERROR: 'CookieParseError',
  NO_REFRESH_TOKEN: 'NoRefreshToken',
  REFRESH_ERROR: 'RefreshError',
  GENERATE_ERROR: 'GenerateError',
  INVALID_INPUT: 'InvalidInput',
  DECODE_ERROR: 'DecodeError',
  
  // 聊天室相關錯誤
  CREATE_ROOM_FAILED: 'CreateRoomFailed',
  GET_ROOMS_FAILED: 'GetRoomsFailed',
  GET_MESSAGES_FAILED: 'GetMessagesFailed',
  JOIN_ROOM_FAILED: 'JoinRoomFailed',
  INVALID_ROOM_ID: 'InvalidRoomId',
  NOT_ROOM_MEMBER: 'NotRoomMember',
  ROOM_NOT_FOUND: 'RoomNotFound',
  ALREADY_MEMBER: 'AlreadyMember',
  INVALID_MEMBER_IDS: 'InvalidMemberIds',
  INVALID_PAGINATION: 'InvalidPagination',
  
  // 貼文相關錯誤
  CREATE_POST_FAILED: 'CreatePostFailed',
  GET_FEED_FAILED: 'GetFeedFailed',
  TOGGLE_LIKE_FAILED: 'ToggleLikeFailed',
  INVALID_POST_ID: 'InvalidPostId',
  POST_NOT_FOUND: 'PostNotFound',
  EMPTY_CONTENT: 'EmptyContent'
};

export { createErrorResponse, createSuccessResponse, getJWTErrorMessage, ERROR_TYPES }