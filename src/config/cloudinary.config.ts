import { registerAs } from '@nestjs/config';

export default registerAs('cloudinary', () => ({
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
  folder: process.env.CLOUDINARY_FOLDER || 'jooav-erp',
  maxFileSize: parseInt(process.env.CLOUDINARY_MAX_FILE_SIZE || '10485760', 10), // 10MB default
  allowedFormats: process.env.CLOUDINARY_ALLOWED_FORMATS?.split(',') || [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
  ],
}));
