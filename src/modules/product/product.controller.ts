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
} from '@nestjs/swagger';
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
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Create a new product',
    description: 'Create a new FMCG product with auto-generated SKU and name',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Product created successfully',
    type: ProductResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data or reference not found',
  })
  @ApiConflictResponse({
    description: 'Product with this SKU already exists',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @AuditLog({ action: 'CREATE', resource: 'product' })
  async create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<ProductResponseDto>> {
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
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Update product',
    description:
      'Update product information. SKU and name are auto-regenerated if identifier fields change.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Product updated successfully',
    type: ProductResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data or reference not found',
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
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<ProductResponseDto>> {
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
