import { createErrorResponse, ERROR_TYPES } from '../utils/responseUtils.js';
import { logger } from '../utils/logger.js';

const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const result = schema.parse(req.body);
      req.validatedData = result;
      
      logger.debug('請求資料驗證成功', {
        path: req.path,
        method: req.method,
        hasData: !!result
      });
      
      next();
    } catch (error) {
      const validationDetails = error.issues ? 
        error.issues.map(issue => issue.message) : 
        [error.message];

      logger.debug('請求資料驗證失敗', {
        path: req.path,
        method: req.method,
        errorCount: validationDetails.length,
        fieldErrors: error.issues ? error.issues.map(issue => issue.path?.join('.') || 'unknown') : []
      });

      return res.status(400).json(createErrorResponse(
        error,
        ERROR_TYPES.AUTH.TOKEN.VALIDATION_ERROR,
        { details: validationDetails }
      ));
    }
  };
};

export { validateRequest };