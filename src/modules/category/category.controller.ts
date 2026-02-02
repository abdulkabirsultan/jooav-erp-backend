import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryQueryDto,
  CategoryResponseDto,
  CategoryStatsDto,
} from './dto';
import { SuccessResponse, PaginatedResponse } from '../../common/dto';
import { Cache } from '../../common/decorators/cache.decorator';
import { CacheInterceptor } from '../../common/interceptors/cache.interceptor';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('Categories')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Create a new category with optional subcategories',
    description:
      'Create a category and optionally create multiple subcategories in a single transaction',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description:
      'Category created successfully (with subcategories if provided)',
    type: CategoryResponseDto,
  })
  @AuditLog({ action: 'CREATE', resource: 'category' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Category or subcategory with this name already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Duplicate subcategory names in request',
  })
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<CategoryResponseDto>> {
    const category = await this.categoryService.create(
      createCategoryDto,
      userId,
    );

    const message = createCategoryDto.subcategories?.length
      ? `Category created successfully with ${createCategoryDto.subcategories.length} subcategory(ies)`
      : 'Category created successfully';

    return new SuccessResponse(message, category);
  }

  @Get()
  @UseInterceptors(CacheInterceptor)
  @Cache({
    key: 'categories',
    ttl: 900, // 15 minutes - categories change less frequently
    includeParams: true,
  })
  @ApiOperation({ summary: 'Get all categories with pagination' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Categories retrieved successfully',
    type: PaginatedResponse<CategoryResponseDto>,
  })
  @ApiQuery({ type: CategoryQueryDto })
  async findAll(
    @Query() query: CategoryQueryDto,
  ): Promise<SuccessResponse<PaginatedResponse<CategoryResponseDto>>> {
    const result = await this.categoryService.findAll(query);

    return new SuccessResponse('Categories retrieved successfully', result);
  }

  @Get('stats')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @UseInterceptors(CacheInterceptor)
  @Cache({
    key: 'category-stats',
    ttl: 600, // 10 minutes
    includeParams: false,
  })
  @ApiOperation({ summary: 'Get category statistics' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category statistics retrieved successfully',
    type: CategoryStatsDto,
  })
  async getStats(): Promise<SuccessResponse<CategoryStatsDto>> {
    const stats = await this.categoryService.getStats();

    return new SuccessResponse(
      'Category statistics retrieved successfully',
      stats,
    );
  }

  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @Cache({
    key: 'category',
    ttl: 900, // 15 minutes
    includeParams: true,
  })
  @ApiOperation({ summary: 'Get a category by ID' })
  @ApiParam({
    name: 'id',
    description: 'Category ID',
    example: '',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category retrieved successfully',
    type: CategoryResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Category not found',
  })
  async findOne(
    @Param('id') id: string,
  ): Promise<SuccessResponse<CategoryResponseDto>> {
    const category = await this.categoryService.findOne(id);

    return new SuccessResponse('Category retrieved successfully', category);
  }

  @Put(':id')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @AuditLog({ action: 'UPDATE', resource: 'category' })
  @ApiOperation({
    summary: 'Update a category and manage its subcategories',
    description:
      'Update category details and perform subcategory operations (create, update, delete) in a single transaction',
  })
  @ApiParam({
    name: 'id',
    description: 'Category ID',
    example: 'c1234567890abcdef12345678',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Category updated successfully with subcategory operations completed',
    type: CategoryResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Category not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Category or subcategory name conflicts',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Invalid subcategory operations (e.g., trying to delete subcategory with products without force flag)',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        errors: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of specific operation errors',
        },
        summary: {
          type: 'object',
          properties: {
            created: { type: 'number' },
            updated: { type: 'number' },
            deleted: { type: 'number' },
            productsReassigned: { type: 'number' },
          },
        },
      },
    },
  })
  async update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<CategoryResponseDto>> {
    const category = await this.categoryService.update(
      id,
      updateCategoryDto,
      userId,
    );

    return new SuccessResponse('Category updated successfully', category);
  }

  @Delete(':id')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @AuditLog({ action: 'DELETE', resource: 'category' })
  @ApiOperation({
    summary: 'Delete a category',
    description:
      'Soft delete a category. Will fail if category has subcategories or products.',
  })
  @ApiParam({
    name: 'id',
    description: 'Category ID',
    example: '',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Category not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Cannot delete category with subcategories or products',
  })
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<{ message: string }>> {
    const result = await this.categoryService.remove(id, userId);
    return new SuccessResponse(result.message, result);
  }

  @Patch(':id/activate')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @AuditLog({ action: 'ACTIVATE', resource: 'category' })
  @ApiOperation({ summary: 'Reactivate a deleted category' })
  @ApiParam({
    name: 'id',
    description: 'Category ID',
    example: '',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category reactivated successfully',
    type: CategoryResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Category not found or not in deleted state',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'A category with this name already exists',
  })
  async activate(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<CategoryResponseDto>> {
    const category = await this.categoryService.activate(id, userId);

    return new SuccessResponse('Category reactivated successfully', category);
  }
}
