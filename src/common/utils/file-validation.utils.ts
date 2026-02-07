export class FileValidationUtils {
  private static readonly ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly MAX_IMAGE_COUNT = 10;

  /**
   * Validate if file is an allowed image type
   */
  static isValidImageType(mimetype: string): boolean {
    return this.ALLOWED_IMAGE_TYPES.includes(mimetype.toLowerCase());
  }

  /**
   * Validate file size
   */
  static isValidFileSize(size: number): boolean {
    return size <= this.MAX_FILE_SIZE;
  }

  /**
   * Validate single image file
   */
  static validateImageFile(file: Express.Multer.File): void {
    if (!this.isValidImageType(file.mimetype)) {
      throw new Error(
        `Invalid file type: ${file.mimetype}. Allowed types: ${this.ALLOWED_IMAGE_TYPES.join(', ')}`
      );
    }

    if (!this.isValidFileSize(file.size)) {
      throw new Error(
        `File size too large: ${Math.round(file.size / 1024 / 1024)}MB. Maximum allowed: ${this.MAX_FILE_SIZE / 1024 / 1024}MB`
      );
    }
  }

  /**
   * Validate multiple image files
   */
  static validateImageFiles(files: Express.Multer.File[]): void {
    if (files.length > this.MAX_IMAGE_COUNT) {
      throw new Error(
        `Too many files: ${files.length}. Maximum allowed: ${this.MAX_IMAGE_COUNT}`
      );
    }

    files.forEach((file, index) => {
      try {
        this.validateImageFile(file);
      } catch (error) {
        throw new Error(`File ${index + 1}: ${error.message}`);
      }
    });
  }

  /**
   * Get human readable file size
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}