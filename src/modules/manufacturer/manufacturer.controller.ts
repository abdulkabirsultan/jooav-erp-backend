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
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { UserRole, ManufacturerStatus } from '@prisma/client';

import { ManufacturerService } from './manufacturer.service';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import {
  CurrentUser,
  CurrentUserId,
} from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedResponse } from '../../common/dto/paginated-response.dto';
import { SuccessResponse } from '../../common/dto/api-response.dto';
import { ResponseMessages } from '../../common/utils/response-messages.util';
import {
  CreateManufacturerDto,
  UpdateManufacturerDto,
  UpdateManufacturerStatusDto,
  ManufacturerQueryDto,
} from './dto/manufacturer.dto';
import {
  ManufacturerResponseDto,
  ManufacturerStatsDto,
} from './dto/manufacturer-response.dto';
import {
  BulkManufacturerOperationDto,
  BulkOperationResultDto,
} from './dto/bulk-manufacturer-operation.dto';

@ApiTags('Manufacturers')
@Controller('manufacturers')
@UseGuards(UnifiedAuthGuard, RolesGuard)
@ApiBearerAuth('admin-access-token')
export class ManufacturerController {
  constructor(private readonly manufacturerService: ManufacturerService) {}

  // ================================
  // MANUFACTURER CRUD OPERATIONS (ADMIN ONLY)
  // ================================

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new manufacturer (Admin only)',
    description:
      'Create a new manufacturer with business details and contact information',
  })
  @ApiBody({ type: CreateManufacturerDto })
  @ApiResponse({
    status: 201,
    description: 'Manufacturer successfully created',
    type: ManufacturerResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      'Manufacturer with this name or registration number already exists',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async create(
    @Body() createManufacturerDto: CreateManufacturerDto,
    @CurrentUserId() adminId: string,
    @Request() req: any,
  ): Promise<SuccessResponse<ManufacturerResponseDto>> {
    const manufacturer = await this.manufacturerService.create(
      createManufacturerDto,
      adminId,
      req,
    );
    return new SuccessResponse(
      ResponseMessages.created('Manufacturer', manufacturer.name),
      manufacturer,
    );
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get all manufacturers with pagination and filters (Admin only)',
    description:
      'Retrieve a paginated list of manufacturers with optional filtering',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10, max: 100)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search in name or description',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ManufacturerStatus,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'includeBrands',
    required: false,
    type: Boolean,
    description: 'Include brands in response',
  })
  @ApiQuery({
    name: 'includeProducts',
    required: false,
    type: Boolean,
    description: 'Include products in response',
  })
  @ApiQuery({
    name: 'includeAuditInfo',
    required: false,
    type: Boolean,
    description: 'Include audit information (createdBy, updatedBy, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of manufacturers retrieved successfully',
    type: PaginatedResponse<ManufacturerResponseDto>,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async findAll(
    @Query() queryDto: ManufacturerQueryDto,
  ): Promise<SuccessResponse<PaginatedResponse<ManufacturerResponseDto>>> {
    // Create proper pagination DTO
    const paginationDto = new PaginationDto();
    paginationDto.page = queryDto.page ? parseInt(queryDto.page, 10) : 1;
    paginationDto.limit = queryDto.limit ? parseInt(queryDto.limit, 10) : 10;
    paginationDto.search = queryDto.search;

    const filtersDto = {
      search: queryDto.search,
      status: queryDto.status,
    };

    const includesDto = {
      includeBrands: queryDto.includeBrands,
      includeProducts: queryDto.includeProducts,
      includeAuditInfo: queryDto.includeAuditInfo,
    };

    const result = await this.manufacturerService.findAll(
      paginationDto,
      filtersDto,
      includesDto,
    );

    return new SuccessResponse(
      ResponseMessages.foundItems(
        result.data.length,
        'manufacturer',
        result.meta.totalItems,
      ),
      result,
    );
  }

  @Get('stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get manufacturer statistics (Admin only)',
    description:
      'Retrieve aggregate statistics about manufacturers for dashboard',
  })
  @ApiResponse({
    status: 200,
    description: 'Manufacturer statistics retrieved successfully',
    type: ManufacturerStatsDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getStats(): Promise<SuccessResponse<ManufacturerStatsDto>> {
    const stats = await this.manufacturerService.getStats();
    return new SuccessResponse(
      ResponseMessages.statsRetrieved('Manufacturer'),
      stats,
    );
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get manufacturer by ID (Admin only)',
    description: 'Retrieve detailed information about a specific manufacturer',
  })
  @ApiParam({ name: 'id', description: 'Manufacturer ID' })
  @ApiQuery({
    name: 'includeBrands',
    required: false,
    type: Boolean,
    description: 'Include brands in response (default: true)',
  })
  @ApiQuery({
    name: 'includeProducts',
    required: false,
    type: Boolean,
    description: 'Include products in response (default: true)',
  })
  @ApiQuery({
    name: 'includeAuditInfo',
    required: false,
    type: Boolean,
    description: 'Include audit information (default: true)',
  })
  @ApiResponse({
    status: 200,
    description: 'Manufacturer details retrieved successfully',
    type: ManufacturerResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Manufacturer not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async findOne(
    @Param('id') id: string,
    @Query('includeBrands') includeBrands?: boolean,
    @Query('includeProducts') includeProducts?: boolean,
    @Query('includeAuditInfo') includeAuditInfo?: boolean,
  ): Promise<SuccessResponse<ManufacturerResponseDto>> {
    const includesDto = {
      includeBrands,
      includeProducts,
      includeAuditInfo,
    };

    const manufacturer = await this.manufacturerService.findOne(
      id,
      includesDto,
    );
    return new SuccessResponse(
      ResponseMessages.retrieved('Manufacturer', manufacturer.name),
      manufacturer,
    );
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update manufacturer (Admin only)',
    description: 'Update manufacturer information with audit logging',
  })
  @ApiParam({ name: 'id', description: 'Manufacturer ID' })
  @ApiBody({ type: UpdateManufacturerDto })
  @ApiResponse({
    status: 200,
    description: 'Manufacturer updated successfully',
    type: ManufacturerResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Manufacturer not found',
  })
  @ApiResponse({
    status: 409,
    description:
      'Manufacturer with this name or registration number already exists',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async update(
    @Param('id') id: string,
    @Body() updateManufacturerDto: UpdateManufacturerDto,
    @CurrentUserId() adminId: string,
    @Request() req: any,
  ): Promise<SuccessResponse<ManufacturerResponseDto>> {
    const manufacturer = await this.manufacturerService.update(
      id,
      updateManufacturerDto,
      adminId,
      req,
    );
    return new SuccessResponse(
      ResponseMessages.updated('Manufacturer', manufacturer.name),
      manufacturer,
    );
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Soft delete manufacturer (Admin only)',
    description: 'Soft delete manufacturer by setting status to SUSPENDED',
  })
  @ApiParam({ name: 'id', description: 'Manufacturer ID' })
  @ApiResponse({
    status: 200,
    description: 'Manufacturer deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Manufacturer successfully deleted',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Manufacturer not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete manufacturer with active products',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUserId() adminId: string,
    @Request() req: any,
  ): Promise<SuccessResponse<null>> {
    const result = await this.manufacturerService.remove(id, adminId, req);
    // Extract manufacturer name from the service response if available
    const manufacturerName = result.manufacturerName || 'Manufacturer';
    return new SuccessResponse(
      ResponseMessages.deleted('Manufacturer', manufacturerName),
      null,
    );
  }

  @Patch(':id/activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Reactivate manufacturer (Admin only)',
    description: 'Reactivate a manufacturer from soft delete state',
  })
  @ApiParam({ name: 'id', description: 'Manufacturer ID' })
  @ApiResponse({
    status: 200,
    description: 'Manufacturer reactivated successfully',
    type: ManufacturerResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Manufacturer not found or not in deleted state',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Manufacturer with same name already exists',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async activate(
    @Param('id') id: string,
    @CurrentUserId() adminId: string,
    @Request() req: any,
  ): Promise<SuccessResponse<ManufacturerResponseDto>> {
    const manufacturer = await this.manufacturerService.activate(
      id,
      adminId,
      req,
    );
    return new SuccessResponse(
      ResponseMessages.activated('Manufacturer', manufacturer.name),
      manufacturer,
    );
  }

  // ================================
  // MANUFACTURER PRODUCTS & ORDERS
  // ================================

  @Get(':id/products')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get manufacturer products (Admin only)',
    description: 'Retrieve all products by a specific manufacturer',
  })
  @ApiParam({ name: 'id', description: 'Manufacturer ID' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'Manufacturer products retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Manufacturer not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getManufacturerProducts(
    @Param('id') id: string,
    @Query() paginationDto: PaginationDto,
  ): Promise<SuccessResponse<any>> {
    const result = await this.manufacturerService.getManufacturerProducts(
      id,
      paginationDto,
    );
    const { manufacturerName, ...paginatedData } = result;
    return new SuccessResponse(
      ResponseMessages.foundItems(
        paginatedData.data.length,
        `${manufacturerName} product`,
        paginatedData.meta?.totalItems,
      ),
      paginatedData,
    );
  }

  @Get(':id/orders')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get manufacturer orders (Admin only)',
    description: 'Retrieve all orders for a specific manufacturer',
  })
  @ApiParam({ name: 'id', description: 'Manufacturer ID' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'Manufacturer orders retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Manufacturer not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getManufacturerOrders(
    @Param('id') id: string,
    @Query() paginationDto: PaginationDto,
  ): Promise<SuccessResponse<any>> {
    const result = await this.manufacturerService.getManufacturerOrders(
      id,
      paginationDto,
    );
    const { manufacturerName, ...paginatedData } = result;
    return new SuccessResponse(
      ResponseMessages.foundItems(
        paginatedData.data.length,
        `${manufacturerName} order`,
        paginatedData.meta?.totalItems,
      ),
      paginatedData,
    );
  }

  // ================================
  // ADMIN-ONLY DELETED MANUFACTURERS
  // ================================

  @Get('deleted/list')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get all deleted manufacturers (Admin only)',
    description:
      'Retrieve a paginated list of manufacturers that have been soft deleted for audit purposes',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10, max: 100)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search in name or description',
  })
  @ApiResponse({
    status: 200,
    description: 'List of deleted manufacturers retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            allOf: [
              { $ref: '#/components/schemas/ManufacturerResponseDto' },
              {
                type: 'object',
                properties: {
                  deletedBy: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', example: 'admin123' },
                      email: {
                        type: 'string',
                        example: 'admin@jooav.com',
                      },
                      name: { type: 'string', example: 'John Admin' },
                    },
                  },
                },
              },
            ],
          },
        },
        pagination: { $ref: '#/components/schemas/PaginationMeta' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getDeletedManufacturers(
    @Query() queryDto: ManufacturerQueryDto,
  ): Promise<
    SuccessResponse<
      PaginatedResponse<
        ManufacturerResponseDto & {
          deletedBy: { id: string; email: string; name: string };
        }
      >
    >
  > {
    const paginationDto = new PaginationDto();
    paginationDto.page = queryDto.page ? parseInt(queryDto.page, 10) : 1;
    paginationDto.limit = queryDto.limit ? parseInt(queryDto.limit, 10) : 10;

    const filtersDto = {
      search: queryDto.search,
    };

    const result = await this.manufacturerService.getDeletedManufacturers(
      paginationDto,
      filtersDto,
    );

    return new SuccessResponse(
      ResponseMessages.foundItems(
        result.data.length,
        'deleted manufacturer',
        result.meta.totalItems,
      ),
      result,
    );
  }
}
