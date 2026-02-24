import { ValidationError, AuthenticationError, NotFoundError, ConflictError } from '../utils/errors.js';

export function errorHandler(err, req, res, next) {
  console.error('[ErrorHandler]', err);
  
  // Handle custom errors
  if (err instanceof ValidationError || 
      err instanceof AuthenticationError || 
      err instanceof NotFoundError || 
      err instanceof ConflictError) {
    return res.status(err.status).json({
      error: {
        message: err.message,
        code: err.code,
        status: err.status,
        details: err.details || null
      }
    });
  }
  
  // Handle express-validator errors
  if (err.errors && Array.isArray(err.errors)) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        status: 400,
        details: err.errors
      }
    });
  }
  
  // Handle generic errors
  res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      status: 500
    }
  });
}
