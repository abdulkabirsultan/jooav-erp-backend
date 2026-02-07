import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  v2 as cloudinary,
  UploadApiResponse,
  UploadApiErrorResponse,
} from 'cloudinary';
import { Readable } from 'stream';

export interface CloudinaryUploadOptions {
  folder?: string;
  publicId?: string;
  transformation?: any[];
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
  tags?: string[];
}

export interface CloudinaryUploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  format: string;
  resourceType: string;
  bytes: number;
  width?: number;
  height?: number;
  createdAt: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get('cloudinary.cloudName'),
      api_key: this.configService.get('cloudinary.apiKey'),
      api_secret: this.configService.get('cloudinary.apiSecret'),
    });
  }

  /**
   * Validate if file is an image
   */
  private validateImageFile(
    file:
      | Express.Multer.File
      | { buffer: Buffer; originalname: string; mimetype?: string },
  ): void {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
    ];

    const allowedExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
      '.gif',
      '.svg',
    ];

    // Check MIME type if available
    if ('mimetype' in file && file.mimetype) {
      if (!allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
        throw new BadRequestException(
          `Invalid file type: ${file.mimetype}. Only images are allowed.`,
        );
      }
    }

    // Check file extension
    const filename = file.originalname.toLowerCase();
    const hasValidExtension = allowedExtensions.some((ext) =>
      filename.endsWith(ext),
    );

    if (!hasValidExtension) {
      throw new BadRequestException(
        `Invalid file extension. Only image files are allowed: ${allowedExtensions.join(', ')}`,
      );
    }

    // Basic file size check (10MB limit)
    if (file.buffer.length > 10 * 1024 * 1024) {
      throw new BadRequestException(
        'File size too large. Maximum size is 10MB.',
      );
    }
  }

  /**
   * Upload file buffer to Cloudinary
   */
  async uploadFile(
    buffer: Buffer,
    options: CloudinaryUploadOptions = {},
    filename?: string,
  ): Promise<CloudinaryUploadResult> {
    // Basic validation for image uploads
    if (filename && options.resourceType !== 'raw') {
      this.validateImageFile({ buffer, originalname: filename });
    }
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        folder: options.folder || this.configService.get('cloudinary.folder'),
        public_id: options.publicId,
        transformation: options.transformation,
        resource_type: options.resourceType || 'auto',
        tags: options.tags,
        use_filename: true,
        unique_filename: !options.publicId,
      };

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error: UploadApiErrorResponse, result: UploadApiResponse) => {
          if (error) {
            this.logger.error('Cloudinary upload failed:', error);
            reject(error);
          } else {
            this.logger.log(`File uploaded successfully: ${result.public_id}`);
            resolve({
              publicId: result.public_id,
              url: result.url,
              secureUrl: result.secure_url,
              format: result.format,
              resourceType: result.resource_type,
              bytes: result.bytes,
              width: result.width,
              height: result.height,
              createdAt: result.created_at,
            });
          }
        },
      );

      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);
      stream.pipe(uploadStream);
    });
  }

  /**
   * Upload multiple files
   */
  async uploadMultipleFiles(
    files:
      | Express.Multer.File[]
      | Array<{ buffer: Buffer; originalname: string }>,
    options: CloudinaryUploadOptions = {},
  ): Promise<CloudinaryUploadResult[]> {
    if (!Array.isArray(files)) {
      throw new BadRequestException(
        `Expected files to be an array, but got ${typeof files}`,
      );
    }

    // Validate each file before upload
    files.forEach((file) => {
      this.validateImageFile(file);
    });

    const uploadPromises = files.map((file) =>
      this.uploadFile(
        file.buffer,
        {
          ...options,
          publicId: options.publicId
            ? `${options.publicId}_${Date.now()}`
            : undefined,
        },
        file.originalname,
      ),
    );

    return Promise.all(uploadPromises);
  }

  /**
   * Delete file from Cloudinary
   */
  async deleteFile(publicId: string): Promise<any> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      this.logger.log(`File deleted successfully: ${publicId}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete file: ${publicId}`, error);
      throw error;
    }
  }

  /**
   * Delete multiple files
   */
  async deleteMultipleFiles(publicIds: string[]): Promise<any> {
    try {
      const result = await cloudinary.api.delete_resources(publicIds);
      this.logger.log(`Multiple files deleted: ${publicIds.join(', ')}`);
      return result;
    } catch (error) {
      this.logger.error('Failed to delete multiple files', error);
      throw error;
    }
  }

  /**
   * Extract public ID from Cloudinary URL
   */
  extractPublicIdFromUrl(url: string): string {
    try {
      // Extract public ID from Cloudinary URL
      // URL format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/public_id.jpg
      const urlParts = url.split('/');
      const uploadIndex = urlParts.findIndex((part) => part === 'upload');
      if (uploadIndex === -1) return '';

      // Get everything after version number (or 'upload' if no version)
      let publicIdPart = urlParts.slice(uploadIndex + 1);

      // Remove version if present (starts with 'v' followed by numbers)
      if (
        publicIdPart[0] &&
        publicIdPart[0].startsWith('v') &&
        /^v\d+$/.test(publicIdPart[0])
      ) {
        publicIdPart = publicIdPart.slice(1);
      }

      // Join the remaining parts and remove file extension
      const publicIdWithExtension = publicIdPart.join('/');
      const lastDotIndex = publicIdWithExtension.lastIndexOf('.');
      return lastDotIndex > 0
        ? publicIdWithExtension.substring(0, lastDotIndex)
        : publicIdWithExtension;
    } catch (error) {
      this.logger.error(`Failed to extract public ID from URL: ${url}`, error);
      return '';
    }
  }

  /**
   * Delete files by URLs
   */
  async deleteFilesByUrls(urls: string[]): Promise<{
    deleted: Record<string, string>;
    errors: Record<string, string>;
  }> {
    try {
      // Validate input
      if (!Array.isArray(urls) || urls.length === 0) {
        this.logger.warn('No URLs provided for deletion');
        return { deleted: {}, errors: {} };
      }

      // Filter out empty/invalid URLs and extract public IDs
      const validUrls = urls.filter(
        (url) => url && typeof url === 'string' && url.trim().length > 0,
      );

      if (validUrls.length === 0) {
        this.logger.warn('No valid URLs found for deletion');
        return { deleted: {}, errors: {} };
      }

      const publicIds = validUrls
        .map((url) => {
          try {
            return this.extractPublicIdFromUrl(url);
          } catch (error) {
            this.logger.warn(
              `Failed to extract public ID from URL: ${url}`,
              error,
            );
            return null;
          }
        })
        .filter((id): id is string => id !== null && id.length > 0);

      if (publicIds.length === 0) {
        this.logger.warn('No valid public IDs found from URLs');
        return { deleted: {}, errors: {} };
      }

      this.logger.log(
        `Attempting to delete ${publicIds.length} files from Cloudinary`,
      );
      const result = await this.deleteMultipleFiles(publicIds);

      return {
        deleted: result.deleted || {},
        errors: result.not_found
          ? Object.fromEntries(
              Object.keys(result.not_found).map((id) => [id, 'File not found']),
            )
          : {},
      };
    } catch (error) {
      this.logger.error('Failed to delete files by URLs', error);
      // Don't throw - return partial success info
      return {
        deleted: {},
        errors: { general: error.message || 'Unknown error occurred' },
      };
    }
  }

  /**
   * Generate optimized image URL with transformations
   */
  generateOptimizedUrl(
    publicId: string,
    options: {
      width?: number;
      height?: number;
      crop?: string;
      quality?: string | number;
      format?: string;
    } = {},
  ): string {
    return cloudinary.url(publicId, {
      transformation: [
        {
          width: options.width,
          height: options.height,
          crop: options.crop || 'fill',
          quality: options.quality || 'auto',
          fetch_format: options.format || 'auto',
        },
      ],
    });
  }

  /**
   * Get file details
   */
  async getFileDetails(publicId: string): Promise<any> {
    try {
      const result = await cloudinary.api.resource(publicId);
      return result;
    } catch (error) {
      this.logger.error(`Failed to get file details: ${publicId}`, error);
      throw error;
    }
  }
}
