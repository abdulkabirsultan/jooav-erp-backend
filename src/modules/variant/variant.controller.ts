import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiBody,
} from '@nestjs/swagger';
import { VariantService } from './variant.service';
import {
  CreateVariantDto,
  UpdateVariantDto,
  VariantQueryDto,
  VariantResponseDto,
  VariantStatsDto,
  BulkDeleteVariantDto,
} from './dto';
import { BulkDeleteResultDto } from '../../common/dto';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { PaginatedResponse } from '../../common/dto/paginated-response.dto';
import { SuccessResponse } from '../../common/dto/api-response.dto';
import { ResponseMessages } from '../../common/utils/response-messages.util';
import { BaseResponse } from '../../common/dto/base-response.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../../common/enums';

@ApiTags('Variants')
@Controller('variants')
@UseGuards(UnifiedAuthGuard, RolesGuard)
@ApiBearerAuth('admin-access-token')
export class VariantController {
  constructor(private readonly variantService: VariantService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new product variant' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Variant created successfully',
    type: VariantResponseDto,
  })
  @AuditLog({
    action: 'CREATE',
    resource: 'VARIANT',
  })
  async create(
    @Body() createVariantDto: CreateVariantDto,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<VariantResponseDto>> {
    const variant = await this.variantService.create(createVariantDto, userId);
    return new SuccessResponse(
      ResponseMessages.created('Variant', variant.name),
      variant,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get all product variants with pagination and filtering',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Variants retrieved successfully',
    type: PaginatedResponse<VariantResponseDto>,
  })
  async findAll(
    @Query() query: VariantQueryDto,
  ): Promise<SuccessResponse<PaginatedResponse<VariantResponseDto>>> {
    const result = await this.variantService.findAll(query);
    return new SuccessResponse(
      ResponseMessages.foundItems(
        result.data.length,
        'variant',
        result.meta.totalItems,
      ),
      result,
    );
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get variant statistics and analytics' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Variant statistics retrieved successfully',
    type: VariantStatsDto,
  })
  async getStats(): Promise<SuccessResponse<VariantStatsDto>> {
    const stats = await this.variantService.getStats();
    return new SuccessResponse(
      ResponseMessages.statsRetrieved('Variant'),
      stats,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific variant by ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Variant retrieved successfully',
    type: VariantResponseDto,
  })
  async findOne(
    @Param('id') id: string,
    @Query('includeBrand') includeBrand?: boolean,
    @Query('includeProductsCount') includeProductsCount?: boolean,
    @Query('includeAuditInfo') includeAuditInfo?: boolean,
  ): Promise<SuccessResponse<VariantResponseDto>> {
    const includesDto = {
      includeBrand: includeBrand !== undefined ? includeBrand : true, // Default to true
      includeProductsCount,
      includeAuditInfo,
    };

    const variant = await this.variantService.findOne(id);
    return new SuccessResponse(
      ResponseMessages.retrieved('Variant', variant.name),
      variant,
    );
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update variant' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Variant updated successfully',
    type: VariantResponseDto,
  })
  @AuditLog({
    action: 'UPDATE',
    resource: 'VARIANT',
  })
  async update(
    @Param('id') id: string,
    @Body() updateVariantDto: UpdateVariantDto,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<VariantResponseDto>> {
    const variant = await this.variantService.update(
      id,
      updateVariantDto,
      userId,
    );
    return new SuccessResponse(
      ResponseMessages.updated('Variant', variant.name),
      variant,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete variant' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Variant deleted successfully',
    type: BaseResponse,
  })
  @AuditLog({
    action: 'DELETE',
    resource: 'VARIANT',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<null>> {
    await this.variantService.remove(id, userId);
    return new SuccessResponse(
      ResponseMessages.deleted('Variant', 'item'),
      null,
    );
  }

  @Post('bulk/delete')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete multiple variants',
    description:
      'Soft delete multiple variants by their IDs. Returns success/failure status for each variant.',
  })
  @ApiBody({
    description: 'Array of variant IDs to delete',
    type: BulkDeleteVariantDto,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk delete operation completed',
    type: BulkDeleteResultDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid variant IDs or empty array' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @AuditLog({ action: 'BULK_DELETE', resource: 'variant' })
  async removeMany(
    @Body() bulkDeleteDto: BulkDeleteVariantDto,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<BulkDeleteResultDto>> {
    const result = await this.variantService.removeMany(
      bulkDeleteDto.variantIds,
      userId,
    );

    let message = `Bulk delete completed: ${result.successful} variants deleted successfully`;
    if (result.failed > 0) {
      message += `, ${result.failed} failed`;
    }

    return new SuccessResponse(message, result);
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reactivate variant (restore from soft delete)' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Variant reactivated successfully',
    type: VariantResponseDto,
  })
  @AuditLog({
    action: 'ACTIVATE',
    resource: 'VARIANT',
  })
  async activate(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<VariantResponseDto>> {
    const variant = await this.variantService.activate(id, userId);
    return new SuccessResponse(
      ResponseMessages.activated('Variant', variant.name),
      variant,
    );
  }
}
