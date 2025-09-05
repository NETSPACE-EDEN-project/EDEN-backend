const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const result = schema.parse(req.body);
      req.validatedData = result;
      next();
    } catch (error) {
      return res.status(400).json(createErrorResponse(
        error,
        ERROR_TYPES.AUTH.TOKEN.VALIDATION_ERROR,
        { details: error.issues ? error.issues.map(issue => issue.message) : [error.message] }
      ));
    }
  };
};

export { validateRequest };