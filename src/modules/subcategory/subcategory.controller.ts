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
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SubcategoryService } from './subcategory.service';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import {
  CreateSubcategoryDto,
  UpdateSubcategoryDto,
  SubcategoryQueryDto,
  SubcategoryResponseDto,
  SubcategoryStatsDto,
} from './dto';
import { SuccessResponse, PaginatedResponse } from '../../common/dto';
import { Cache } from '../../common/decorators/cache.decorator';
import { CacheInterceptor } from '../../common/interceptors/cache.interceptor';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('Subcategories')
@Controller('subcategories')
export class SubcategoryController {
  constructor(private readonly subcategoryService: SubcategoryService) {}

  @Post()
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({ summary: 'Create a new subcategory' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Subcategory created successfully',
    type: SubcategoryResponseDto,
  })
  @AuditLog({ action: 'CREATE', resource: 'subcategory' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Subcategory with this name already exists in this category',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Parent category not found',
  })
  async create(
    @Body() createSubcategoryDto: CreateSubcategoryDto,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<SubcategoryResponseDto>> {
    const subcategory = await this.subcategoryService.create(
      createSubcategoryDto,
      userId,
    );

    return new SuccessResponse('Subcategory created successfully', subcategory);
  }

  @Get()
  @UseInterceptors(CacheInterceptor)
  @Cache({
    key: 'subcategories',
    ttl: 900, // 15 minutes - subcategories change less frequently
    includeParams: true,
  })
  @ApiOperation({ summary: 'Get all subcategories with pagination' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subcategories retrieved successfully',
    type: PaginatedResponse<SubcategoryResponseDto>,
  })
  @ApiQuery({ type: SubcategoryQueryDto })
  async findAll(
    @Query() query: SubcategoryQueryDto,
  ): Promise<SuccessResponse<PaginatedResponse<SubcategoryResponseDto>>> {
    const result = await this.subcategoryService.findAll(query);

    return new SuccessResponse('Subcategories retrieved successfully', result);
  }

  @Get('stats')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @UseInterceptors(CacheInterceptor)
  @Cache({
    key: 'subcategory-stats',
    ttl: 600, // 10 minutes
    includeParams: false,
  })
  @ApiOperation({ summary: 'Get subcategory statistics' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subcategory statistics retrieved successfully',
    type: SubcategoryStatsDto,
  })
  async getStats(): Promise<SuccessResponse<SubcategoryStatsDto>> {
    const stats = await this.subcategoryService.getStats();

    return new SuccessResponse(
      'Subcategory statistics retrieved successfully',
      stats,
    );
  }

  @Get('category/:categoryId')
  @UseInterceptors(CacheInterceptor)
  @Cache({
    key: 'subcategories-by-category',
    ttl: 900, // 15 minutes
    includeParams: true,
  })
  @ApiOperation({ summary: 'Get all subcategories for a specific category' })
  @ApiParam({
    name: 'categoryId',
    description: 'Category ID',
    example: '',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subcategories retrieved successfully',
    type: [SubcategoryResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Category not found',
  })
  async findByCategory(
    @Param('categoryId') categoryId: string,
  ): Promise<SuccessResponse<SubcategoryResponseDto[]>> {
    const subcategories =
      await this.subcategoryService.findByCategory(categoryId);

    return new SuccessResponse(
      'Subcategories retrieved successfully',
      subcategories,
    );
  }

  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @Cache({
    key: 'subcategory',
    ttl: 900, // 15 minutes
    includeParams: true,
  })
  @ApiOperation({ summary: 'Get a subcategory by ID' })
  @ApiParam({
    name: 'id',
    description: 'Subcategory ID',
    example: '',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subcategory retrieved successfully',
    type: SubcategoryResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Subcategory not found',
  })
  async findOne(
    @Param('id') id: string,
  ): Promise<SuccessResponse<SubcategoryResponseDto>> {
    const subcategory = await this.subcategoryService.findOne(id);

    return new SuccessResponse(
      'Subcategory retrieved successfully',
      subcategory,
    );
  }

  @Put(':id')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @AuditLog({ action: 'UPDATE', resource: 'subcategory' })
  @ApiOperation({ summary: 'Update a subcategory' })
  @ApiParam({
    name: 'id',
    description: 'Subcategory ID',
    example: '',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subcategory updated successfully',
    type: SubcategoryResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Subcategory not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Subcategory with this name already exists in this category',
  })
  async update(
    @Param('id') id: string,
    @Body() updateSubcategoryDto: UpdateSubcategoryDto,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<SubcategoryResponseDto>> {
    const subcategory = await this.subcategoryService.update(
      id,
      updateSubcategoryDto,
      userId,
    );

    return new SuccessResponse('Subcategory updated successfully', subcategory);
  }

  @Delete(':id')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @AuditLog({ action: 'DELETE', resource: 'subcategory' })
  @ApiOperation({ summary: 'Delete a subcategory (soft delete)' })
  @ApiParam({
    name: 'id',
    description: 'Subcategory ID',
    example: '',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subcategory deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Subcategory not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Cannot delete subcategory with products',
  })
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<{ message: string }>> {
    const result = await this.subcategoryService.remove(id, userId);

    return new SuccessResponse(result.message, result);
  }

  @Patch(':id/activate')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('admin-access-token')
  @AuditLog({ action: 'ACTIVATE', resource: 'subcategory' })
  @ApiOperation({ summary: 'Reactivate a deleted subcategory' })
  @ApiParam({
    name: 'id',
    description: 'Subcategory ID',
    example: '',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subcategory reactivated successfully',
    type: SubcategoryResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Subcategory not found or not in deleted state',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'A subcategory with this name already exists in this category',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Cannot reactivate subcategory: parent category no longer exists',
  })
  async activate(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<SubcategoryResponseDto>> {
    const subcategory = await this.subcategoryService.activate(id, userId);

    return new SuccessResponse(
      'Subcategory reactivated successfully',
      subcategory,
    );
  }
}
