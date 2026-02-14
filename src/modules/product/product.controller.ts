import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiQuery,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import {
  FileInterceptor,
  FilesInterceptor,
  FileFieldsInterceptor,
} from '@nestjs/platform-express';
import { ProductService } from './product.service';
import { BulkProductUploadService } from './services/bulk-product-upload.service';
// import { BulkProductCreationService } from './services/bulk-product-creation.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductResponseDto,
  BulkDeleteProductDto,
  BulkUpdateStatusDto,
  BulkUpdateStatusResultDto,
  BulkUploadRequestDto,
  BulkUploadResultDto,
} from './dto';
import { BulkDeleteResultDto } from '../../common/dto';
import {
  BulkProductCreationDto,
  BulkProductCreationResponse,
} from './dto/bulk-product-creation.dto';
import { PaginatedResponse } from '../../common/dto/paginated-response.dto';
import { SuccessResponse } from '../../common/dto/api-response.dto';
import { ResponseMessages } from '../../common/utils/response-messages.util';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { Cache } from '../../common/decorators/cache.decorator';
import { CacheInterceptor } from '../../common/interceptors/cache.interceptor';
import { UserRole } from '../../common/enums/';
import type { Response } from 'express';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';

// Multer file filter for images only
const imageFileFilter = (
  req: any,
  file: Express.Multer.File,
  callback: any,
) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return callback(
      new BadRequestException(
        `Invalid file type: ${file.mimetype}. Only images are allowed.`,
      ),
      false,
    );
  }

  // Check file size (10MB limit)
  if (file.size && file.size > 10 * 1024 * 1024) {
    return callback(
      new BadRequestException('File size too large. Maximum size is 10MB.'),
      false,
    );
  }

  callback(null, true);
};

@ApiTags('Products')
@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly bulkUploadService: BulkProductUploadService,
    // private readonly bulkProductCreationService: BulkProductCreationService,
  ) {}

  @Post()
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'thumbnail', maxCount: 1 },
        { name: 'images', maxCount: 10 },
      ],
      {
        fileFilter: imageFileFilter,
        limits: {
          fileSize: 30 * 1024 * 1024, // 30MB
          files: 11, // 1 thumbnail + 10 images
        },
      },
    ),
  )
  @ApiBearerAuth('admin-access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create a new product with file uploads',
    description:
      'Create a new FMCG product with user-provided unique name and auto-generated SKU, supporting image uploads',
  })
  @ApiBody({
    description: 'Product creation data with file uploads',
    schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          maxLength: 255,
          example: 'Indomie Chicken Noodles 70g',
          description: 'Product name (must be unique)',
        },
        description: { type: 'string', maxLength: 500, example: '' },
        brandId: { type: 'string', example: '' },
        subcategoryId: { type: 'string', example: '' },
        variantId: { type: 'string', example: '' },
        packSizeId: { type: 'string', example: '' },
        packTypeId: { type: 'string', example: '' },
        price: { type: 'string', example: '' },
        thumbnail: {
          type: 'string',
          format: 'binary',
          description: 'Product thumbnail image (single file)',
        },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Product images (up to 10 files)',
        },
      },
      required: [
        'name',
        'brandId',
        'subcategoryId',
        'variantId',
        'packSizeId',
        'packTypeId',
        'price',
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Product created successfully',
    type: ProductResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid input data, file upload error, or reference not found',
  })
  @ApiConflictResponse({
    description: 'Product with this name or SKU already exists',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @AuditLog({ action: 'CREATE', resource: 'product' })
  async create(
    @Body() createProductDto: CreateProductDto,
    @UploadedFiles()
    files: {
      thumbnail?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<ProductResponseDto>> {
    // Attach files to DTO
    if (files?.thumbnail && files.thumbnail[0]) {
      createProductDto.thumbnail = files.thumbnail[0];
    }
    if (files?.images) {
      createProductDto.images = files.images;
    }

    const product = await this.productService.create(createProductDto, userId);
    return new SuccessResponse(
      ResponseMessages.created('Product', product.name),
      product,
    );
  }

  @Get()
  @UseInterceptors(CacheInterceptor)
  @Cache({
    key: 'products',
    ttl: 600, // 10 minutes - product lists change more frequently
    includeParams: true,
    tags: ['products'],
  })
  @ApiOperation({
    summary: 'Get all products (Accessible to everyone)',
    description:
      'Retrieve paginated list of products with filtering and search (Accessible to everyone)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Products retrieved successfully',
    type: PaginatedResponse,
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: '' })
  @ApiQuery({ name: 'brandId', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'variant', required: false, example: '' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['DRAFT', 'QUEUE', 'LIVE', 'ARCHIVED'],
  })
  @ApiQuery({ name: 'includeRelations', required: false, type: Boolean })
  async findAll(
    @Query() query: ProductQueryDto,
  ): Promise<SuccessResponse<PaginatedResponse<ProductResponseDto>>> {
    const result = await this.productService.findAll(query);
    return new SuccessResponse(
      ResponseMessages.foundItems(
        result.data.length,
        'product',
        result.meta.totalItems,
      ),
      result,
    );
  }

  @Get('stats')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Get product statistics',
    description: 'Get comprehensive product statistics',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Product statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            totalProducts: { type: 'number', example: 150 },
            totalVariants: { type: 'number', example: 25 },
            drafts: { type: 'number', example: 10 },
            archived: { type: 'number', example: 5 },
          },
        },
      },
    },
  })
  async getProductStats(): Promise<SuccessResponse<any>> {
    const stats = await this.productService.getProductStats();
    return new SuccessResponse(
      'Product statistics retrieved successfully',
      stats,
    );
  }

  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @Cache({
    key: 'product',
    ttl: 900, // 15 minutes - individual products don't change as frequently
    includeParams: true,
    tags: ['products'], // Will be enhanced dynamically
  })
  @ApiOperation({
    summary: 'Get product by ID (Accessible to everyone)',
    description:
      'Retrieve a specific product with all related information (Accessible to everyone)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Product retrieved successfully',
    type: ProductResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async findOne(
    @Param('id') id: string,
  ): Promise<SuccessResponse<ProductResponseDto>> {
    const product = await this.productService.findOne(id);
    return new SuccessResponse(
      ResponseMessages.retrieved('Product', product.name),
      product,
    );
  }

  @Patch(':id')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'thumbnail', maxCount: 1 },
        { name: 'createImages', maxCount: 10 },
      ],
      {
        fileFilter: imageFileFilter,
        limits: {
          fileSize: 10 * 1024 * 1024, // 10MB
          files: 11, // 1 thumbnail + 10 images
        },
      },
    ),
  )
  @ApiBearerAuth('admin-access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update product with file management',
    description:
      'Update product information with support for adding/deleting images. Only SKU is auto-regenerated if identifier fields change. Product name can be updated and must remain unique.',
  })
  @ApiBody({
    description: 'Product update data with file management',
    schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          maxLength: 255,
          example: 'Updated Product Name',
          description: 'Product name (must be unique)',
        },
        description: { type: 'string', maxLength: 500, example: '' },
        brandId: { type: 'string', example: '' },
        subcategoryId: { type: 'string', example: '' },
        variantId: { type: 'string', example: '' },
        packSizeId: { type: 'string', example: '' },
        packTypeId: { type: 'string', example: '' },
        price: { type: 'string', example: '' },
        thumbnail: {
          type: 'string',
          format: 'binary',
          description: 'New product thumbnail image (replaces existing)',
        },
        createImages: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
        deleteImages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of image URLs to delete from product',
        },
        deleteThumbnail: {
          type: 'boolean',
          description: 'Set to true to delete current thumbnail',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Product updated successfully',
    type: ProductResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid input data, file upload error, or reference not found',
  })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiConflictResponse({
    description: 'Product with this name or SKU already exists',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @AuditLog({ action: 'UPDATE', resource: 'product' })
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @UploadedFiles()
    files: {
      thumbnail?: Express.Multer.File[];
      createImages?: Express.Multer.File[];
    },
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<ProductResponseDto>> {
    // Normalize FormData fields for proper validation
    // Handle deleteImages - convert single string to array
    if (
      updateProductDto.deleteImages &&
      !Array.isArray(updateProductDto.deleteImages)
    ) {
      updateProductDto.deleteImages = [
        updateProductDto.deleteImages as unknown as string,
      ];
    }

    // Handle deleteThumbnail - convert string to boolean
    if (typeof updateProductDto.deleteThumbnail === 'string') {
      updateProductDto.deleteThumbnail =
        updateProductDto.deleteThumbnail === 'true' ||
        updateProductDto.deleteThumbnail === '1';
    }

    // Attach files to DTO
    if (files?.thumbnail && files.thumbnail[0]) {
      updateProductDto.thumbnail = files.thumbnail[0];
    }
    if (files?.createImages) {
      updateProductDto.createImages = files.createImages;
    }

    const product = await this.productService.update(
      id,
      updateProductDto,
      userId,
    );
    return new SuccessResponse(
      ResponseMessages.updated('Product', product.name),
      product,
    );
  }

  @Post('bulk')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Delete multiple products',
    description:
      'Soft delete multiple products by their IDs. Returns success/failure status for each product.',
  })
  @ApiBody({
    description: 'Array of product IDs to delete',
    type: BulkDeleteProductDto,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk delete operation completed',
    type: BulkDeleteResultDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid product IDs or empty array' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @AuditLog({ action: 'BULK_DELETE', resource: 'product' })
  async removeMany(
    @Body() bulkDeleteDto: BulkDeleteProductDto,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<BulkDeleteResultDto>> {
    const result = await this.productService.removeMany(
      bulkDeleteDto.productIds,
      userId,
    );

    let message = `Bulk delete completed: ${result.successful} products deleted successfully`;
    if (result.failed > 0) {
      message += `, ${result.failed} failed`;
    }

    return new SuccessResponse(message, result);
  }

  @Patch('bulk/status')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Update status of multiple products',
    description:
      'Update the status of multiple products by their IDs. Returns success/failure status for each product.',
  })
  @ApiBody({
    description: 'Array of product IDs and new status',
    type: BulkUpdateStatusDto,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk status update operation completed',
    type: BulkUpdateStatusResultDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid product IDs, status, or empty array',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @AuditLog({ action: 'BULK_UPDATE_STATUS', resource: 'product' })
  async updateManyStatus(
    @Body() bulkUpdateStatusDto: BulkUpdateStatusDto,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<BulkUpdateStatusResultDto>> {
    const result = await this.productService.updateManyStatus(
      bulkUpdateStatusDto.productIds,
      bulkUpdateStatusDto.status,
      userId,
    );

    let message = `Bulk status update completed: ${result.updatedCount} products updated to ${bulkUpdateStatusDto.status}`;
    if (result.failedIds.length > 0) {
      message += `, ${result.failedIds.length} failed`;
    }

    return new SuccessResponse(message, result);
  }

  @Delete(':id')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Delete product',
    description:
      'Soft delete a product (sets deletedAt timestamp and deactivates)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Product deleted successfully',
  })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @AuditLog({ action: 'DELETE', resource: 'product' })
  async remove(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<null>> {
    await this.productService.remove(id, userId);
    return new SuccessResponse(
      ResponseMessages.deleted('Product', 'item'),
      null,
    );
  }

  @Post(':id/activate')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Activate product',
    description: 'Activate a deactivated product',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Product activated successfully',
    type: ProductResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @AuditLog({ action: 'ACTIVATE', resource: 'product' })
  async activate(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<ProductResponseDto>> {
    const product = await this.productService.activate(id, userId);
    return new SuccessResponse(
      ResponseMessages.activated('Product', product.name),
      product,
    );
  }

  @Post(':id/deactivate')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Deactivate product',
    description: 'Deactivate an active product',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Product deactivated successfully',
    type: ProductResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @AuditLog({ action: 'DEACTIVATE', resource: 'product' })
  async deactivate(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<ProductResponseDto>> {
    const product = await this.productService.deactivate(id, userId);
    return new SuccessResponse(
      ResponseMessages.deactivated('Product', product.name),
      product,
    );
  }

  // ================================
  // BULK UPLOAD OPERATIONS
  // ================================

  @Post('bulk/upload')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Bulk upload products from CSV',
    description:
      'Upload a CSV file to create multiple products with their dependencies (manufacturer, brand, variant, etc.)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'CSV file containing product data',
    type: BulkUploadRequestDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk upload completed successfully',
    type: BulkUploadResultDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid file format or validation errors',
  })
  @AuditLog({
    action: 'BULK_UPLOAD_PRODUCTS',
    resource: 'PRODUCT',
  })
  async bulkUpload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<BulkUploadResultDto>> {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }

    if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException('Only CSV files are allowed');
    }

    const result = await this.bulkUploadService.processUpload(file, userId);

    return new SuccessResponse(result.summary, result);
  }

  @Get('bulk/upload/template')
  @ApiOperation({
    summary: 'Download CSV template for bulk upload',
    description:
      'Download a CSV template with headers and example data for bulk product upload',
  })
  @ApiResponse({
    status: 200,
    description: 'CSV template file',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
        },
      },
    },
  })
  async downloadTemplate(@Res() res: Response): Promise<void> {
    const template = this.bulkUploadService.generateTemplate();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=product-upload-template.csv',
    );
    res.send(template);
  }
}
