import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Put,
  Param,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseEnumPipe,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiParam,
  ApiBody,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { BrandStatus } from '@prisma/client';
import { BrandService } from './brand.service';
import {
  CreateBrandDto,
  UpdateBrandDto,
  UpdateBrandStatusDto,
  UpdateBrandLogoDto,
  BrandQueryDto,
  BrandResponseDto,
  BrandStatsDto,
  BulkBrandOperationDto,
  BulkBrandOperationResultDto,
  BulkDeleteBrandDto,
} from './dto';
import { BulkDeleteResultDto } from '../../common/dto';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserId,
} from '../../common/decorators/current-user.decorator';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { PaginatedResponse } from '../../common/dto/paginated-response.dto';
import { BaseResponse } from '../../common/dto/base-response.dto';
import { SuccessResponse } from '../../common/dto/api-response.dto';
import { ResponseMessages } from '../../common/utils/response-messages.util';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';

@ApiTags('Brands')
@Controller('brands')
@UseGuards(UnifiedAuthGuard, RolesGuard)
@ApiBearerAuth('admin-access-token')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new FMCG brand under a manufacturer' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Brand creation data with optional logo upload',
    schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Brand name',
          example: 'Maggi',
        },
        description: {
          type: 'string',
          description: 'Brand description',
          example: 'Quality seasoning brand',
        },
        manufacturerId: {
          type: 'string',
          description: 'Manufacturer ID this brand belongs to',
          example: 'b8e6cc4d-9e52-4a3b-9c6d-1f2a3b4c5d6e',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'INACTIVE'],
          description: 'Brand status',
          example: 'ACTIVE',
          default: 'ACTIVE',
        },
        logo: {
          type: 'string',
          format: 'binary',
          description: 'Brand logo file (JPEG, PNG, GIF)',
        },
      },
      required: ['name', 'manufacturerId'],
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Brand created successfully',
    type: BrandResponseDto,
  })
  @UseInterceptors(FileInterceptor('logo'))
  @AuditLog({ action: 'CREATE', resource: 'Brand' })
  async create(
    @Body() createBrandDto: CreateBrandDto,
    @CurrentUserId() userId: string,
    @UploadedFile() logo?: Express.Multer.File,
  ): Promise<SuccessResponse<BrandResponseDto>> {
    const brand = await this.brandService.create(createBrandDto, userId, logo);
    return new SuccessResponse(
      ResponseMessages.created('Brand', brand.name),
      brand,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get all FMCG brands with pagination and filtering',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Brands retrieved successfully',
    type: PaginatedResponse<BrandResponseDto>,
  })
  async findAll(
    @Query() query: BrandQueryDto,
    @Query('includeManufacturer') includeManufacturer?: boolean,
    @Query('includeProducts') includeProducts?: boolean,
    @Query('includeAuditInfo') includeAuditInfo?: boolean,
  ): Promise<SuccessResponse<PaginatedResponse<BrandResponseDto>>> {
    const result = await this.brandService.findAll(query, {
      includeManufacturer: true,
      includeVariants: true,
    });
    return new SuccessResponse(
      ResponseMessages.foundItems(
        result.data.length,
        'brand',
        result.meta.totalItems,
      ),
      result,
    );
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get FMCG brand statistics and analytics' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Brand statistics retrieved successfully',
    type: BrandStatsDto,
  })
  async getStats(): Promise<SuccessResponse<BrandStatsDto>> {
    const stats = await this.brandService.getStats();
    return new SuccessResponse(ResponseMessages.statsRetrieved('Brand'), stats);
  }

  @Get('deleted')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get deleted FMCG brands (Admin only)' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Deleted brands retrieved successfully',
  })
  async getDeletedBrands(@Query() query: BrandQueryDto): Promise<
    SuccessResponse<
      PaginatedResponse<
        BrandResponseDto & {
          deletedAt: Date;
          deletedBy: { id: string; email: string; name: string };
        }
      >
    >
  > {
    const result = await this.brandService.getDeletedBrands(query);
    return new SuccessResponse(
      ResponseMessages.foundItems(
        result.data.length,
        'deleted brand',
        result.meta.totalItems,
      ),
      result,
    );
  }

  @Get('manufacturer/:manufacturerId')
  @ApiOperation({ summary: 'Get brands by manufacturer' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiParam({ name: 'manufacturerId', description: 'Manufacturer ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Manufacturer brands retrieved successfully',
    type: PaginatedResponse<BrandResponseDto>,
  })
  async getByManufacturer(
    @Param('manufacturerId') manufacturerId: string,
    @Query() query: BrandQueryDto,
  ): Promise<SuccessResponse<PaginatedResponse<BrandResponseDto>>> {
    const result = await this.brandService.getByManufacturer(
      manufacturerId,
      query,
    );
    return new SuccessResponse(
      ResponseMessages.foundItems(
        result.data.length,
        'brand',
        result.meta.totalItems,
      ),
      result,
      result.meta,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get brand by ID' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiParam({ name: 'id', description: 'Brand ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Brand retrieved successfully',
    type: BrandResponseDto,
  })
  async findOne(
    @Param('id') id: string,
    @Query('includeManufacturer') includeManufacturer?: boolean,
    @Query('includeProducts') includeProducts?: boolean,
    @Query('includeVariants') includeVariants?: boolean,
    @Query('includeAuditInfo') includeAuditInfo?: boolean,
  ): Promise<SuccessResponse<BrandResponseDto>> {
    const includesDto = {
      includeManufacturer,
      includeProducts,
      includeVariants,
      includeAuditInfo,
    };

    const brand = await this.brandService.findOne(id, includesDto);
    return new SuccessResponse(
      ResponseMessages.retrieved('Brand', brand.name),
      brand,
    );
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update brand' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Brand ID' })
  @ApiBody({
    description: 'Brand update data with optional logo upload',
    schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Brand name',
          example: 'Maggi Premium',
        },
        description: {
          type: 'string',
          description: 'Brand description',
          example: 'Premium seasoning brand',
        },
        manufacturerId: {
          type: 'string',
          description: 'Manufacturer ID this brand belongs to',
          example: 'b8e6cc4d-9e52-4a3b-9c6d-1f2a3b4c5d6e',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'INACTIVE'],
          description: 'Brand status',
          example: 'ACTIVE',
        },
        logo: {
          type: 'string',
          format: 'binary',
          description:
            'Brand logo file (JPEG, PNG, GIF) - optional replacement',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Brand updated successfully',
    type: BrandResponseDto,
  })
  @UseInterceptors(FileInterceptor('logo'))
  @AuditLog({ action: 'UPDATE', resource: 'Brand' })
  async update(
    @Param('id') id: string,
    @Body() updateBrandDto: UpdateBrandDto,
    @CurrentUserId() userId: string,
    @UploadedFile() logoFile?: Express.Multer.File,
  ): Promise<SuccessResponse<BrandResponseDto>> {
    const brand = await this.brandService.update(
      id,
      updateBrandDto,
      userId,
      logoFile,
    );
    return new SuccessResponse(
      ResponseMessages.updated('Brand', brand.name),
      brand,
    );
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update brand status' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiParam({ name: 'id', description: 'Brand ID' })
  @ApiBody({
    description: 'Brand status update data',
    type: UpdateBrandStatusDto,
    examples: {
      activate: {
        summary: 'Activate brand',
        description: 'Set brand status to active',
        value: {
          status: 'ACTIVE',
        },
      },
      deactivate: {
        summary: 'Deactivate brand',
        description: 'Set brand status to inactive',
        value: {
          status: 'INACTIVE',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Brand status updated successfully',
    type: BrandResponseDto,
  })
  @AuditLog({ action: 'STATUS_UPDATE', resource: 'Brand' })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateBrandStatusDto,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<BrandResponseDto>> {
    const brand = await this.brandService.updateStatus(
      id,
      updateStatusDto.status,
      userId,
    );
    return new SuccessResponse(
      ResponseMessages.statusChanged(
        'Brand',
        brand.name,
        updateStatusDto.status.toLowerCase(),
      ),
      brand,
    );
  }

  @Put(':id/logo')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update or upload brand logo' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiParam({ name: 'id', description: 'Brand ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Brand logo file',
    type: UpdateBrandLogoDto,
    schema: {
      type: 'object',
      properties: {
        logo: {
          type: 'string',
          format: 'binary',
          description: 'Brand logo file (JPEG, PNG, GIF)',
        },
      },
      required: ['logo'],
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Brand logo updated successfully',
    type: BrandResponseDto,
  })
  @UseInterceptors(FileInterceptor('logo'))
  @AuditLog({ action: 'LOGO_UPDATE', resource: 'Brand' })
  async updateLogo(
    @Param('id') id: string,
    @UploadedFile() logoFile: Express.Multer.File,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<BrandResponseDto>> {
    if (!logoFile) {
      throw new BadRequestException('Logo file is required');
    }
    const brand = await this.brandService.updateLogo(id, logoFile, userId);
    return new SuccessResponse(
      ResponseMessages.updated('Brand logo', brand.name),
      brand,
    );
  }

  @Delete(':id/logo')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete brand logo' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiParam({ name: 'id', description: 'Brand ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Brand logo deleted successfully',
    type: BrandResponseDto,
  })
  @AuditLog({ action: 'LOGO_DELETE', resource: 'Brand' })
  async deleteLogo(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<BrandResponseDto>> {
    const brand = await this.brandService.deleteLogo(id, userId);
    return new SuccessResponse(
      ResponseMessages.deleted('Brand logo', brand.name),
      brand,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete brand (soft delete)' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiParam({ name: 'id', description: 'Brand ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Brand deleted successfully',
    type: BaseResponse,
  })
  @AuditLog({ action: 'DELETE', resource: 'Brand' })
  async remove(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<null>> {
    const { brandName } = await this.brandService.remove(id, userId);
    return new SuccessResponse(
      ResponseMessages.deleted('Brand', brandName),
      null,
    );
  }

  @Post('bulk/delete')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete multiple brands',
    description:
      'Soft delete multiple brands by their IDs. Returns success/failure status for each brand.',
  })
  @ApiBody({
    description: 'Array of brand IDs to delete',
    type: BulkDeleteBrandDto,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk delete operation completed',
    type: BulkDeleteResultDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid brand IDs or empty array' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @AuditLog({ action: 'BULK_DELETE', resource: 'brand' })
  async removeMany(
    @Body() bulkDeleteDto: BulkDeleteBrandDto,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<BulkDeleteResultDto>> {
    const result = await this.brandService.removeMany(
      bulkDeleteDto.brandIds,
      userId,
    );

    let message = `Bulk delete completed: ${result.successful} brands deleted successfully`;
    if (result.failed > 0) {
      message += `, ${result.failed} failed`;
    }

    return new SuccessResponse(message, result);
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reactivate brand (restore from soft delete)' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or Super Admin role required' })
  @ApiParam({ name: 'id', description: 'Brand ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Brand reactivated successfully',
    type: BrandResponseDto,
  })
  @AuditLog({ action: 'ACTIVATE', resource: 'Brand' })
  async activate(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<BrandResponseDto>> {
    const brand = await this.brandService.activate(id, userId);
    return new SuccessResponse(
      ResponseMessages.activated('Brand', brand.name),
      brand,
    );
  }
}
