export const APP_CONSTANTS = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
  DEFAULT_TIMEOUT: 5000,
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif'],
  SUPPORTED_DOCUMENT_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
} as const;

export const ERROR_MESSAGES = {
  // Authentication
  INVALID_CREDENTIALS: 'Invalid credentials provided',
  TOKEN_EXPIRED: 'Authentication token has expired',
  ACCESS_DENIED: 'Access denied',

  // Validation
  REQUIRED_FIELD: 'This field is required',
  INVALID_EMAIL: 'Please provide a valid email address',
  INVALID_PHONE: 'Please provide a valid phone number',
  WEAK_PASSWORD:
    'Password must be at least 8 characters with uppercase, lowercase, number and special character',

  // Common
  RESOURCE_NOT_FOUND: 'Resource not found',
  DUPLICATE_ENTRY: 'This entry already exists',
  INVALID_REQUEST: 'Invalid request data',
  SERVER_ERROR: 'Internal server error occurred',

  // File Upload
  FILE_TOO_LARGE: 'File size exceeds the maximum allowed limit',
  INVALID_FILE_TYPE: 'Invalid file type',
  UPLOAD_FAILED: 'File upload failed',
} as const;

export const SUCCESS_MESSAGES = {
  // CRUD Operations
  CREATED: 'Resource created successfully',
  UPDATED: 'Resource updated successfully',
  DELETED: 'Resource deleted successfully',
  RETRIEVED: 'Resource retrieved successfully',

  // Authentication
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  PASSWORD_CHANGED: 'Password changed successfully',

  // File Operations
  FILE_UPLOADED: 'File uploaded successfully',
  FILE_DELETED: 'File deleted successfully',
} as const;

export enum SortByOptions {
  NAME = 'name',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

export enum SortOrderOptions {
  ASC = 'asc',
  DESC = 'desc',
}
