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
// import { BulkProductCreationService } from './services/bulk-product-creation.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductResponseDto,
} from './dto';
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
      'Create a new FMCG product with auto-generated SKU and name, supporting image uploads',
  })
  @ApiBody({
    description: 'Product creation data with file uploads',
    schema: {
      type: 'object',
      properties: {
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
    description: 'Product with this SKU already exists',
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

  // @Post('bulk')
  // @UseGuards(UnifiedAuthGuard, RolesGuard)
  // @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  // @ApiBearerAuth('admin-access-token')
  // @ApiOperation({
  //   summary: 'Bulk create products from CSV data',
  //   description:
  //     'Create multiple products from CSV data with automatic entity creation for manufacturers, brands, variants, and categories',
  // })
  // @ApiResponse({
  //   status: HttpStatus.CREATED,
  //   description: 'Bulk product creation completed',
  //   type: BulkProductCreationResponse,
  // })
  // @ApiBadRequestResponse({
  //   description: 'Invalid CSV data format or validation errors',
  // })
  // @ApiUnauthorizedResponse({ description: 'Authentication required' })
  // @ApiForbiddenResponse({ description: 'Admin access required' })
  // @AuditLog({ action: 'BULK_CREATE', resource: 'product' })
  // async createBulk(
  //   @Body() bulkCreationDto: BulkProductCreationDto,
  //   @CurrentUserId() userId: string,
  // ): Promise<SuccessResponse<BulkProductCreationResponse>> {
  //   const result = await this.bulkProductCreationService.createBulkProducts(
  //     bulkCreationDto.data,
  //     userId,
  //   );
  //   return new SuccessResponse(
  //     ResponseMessages.bulkCreated(result.successfulProducts, 'product'),
  //     {
  //       success: true,
  //       message: `Bulk product creation completed. ${result.successfulProducts} products created successfully.`,
  //       summary: result,
  //     },
  //   );
  // }

  @Get()
  @UseInterceptors(CacheInterceptor)
  @Cache({
    key: 'products',
    ttl: 600, // 10 minutes - products change more frequently than categories
    includeParams: true,
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

  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @Cache({
    key: 'product',
    ttl: 900, // 15 minutes - individual products don't change as frequently
    includeParams: true,
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
      'Update product information with support for adding/deleting images. SKU and name are auto-regenerated if identifier fields change.',
  })
  @ApiBody({
    description: 'Product update data with file management',
    schema: {
      type: 'object',
      properties: {
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
    description: 'Product with this SKU already exists',
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
}
