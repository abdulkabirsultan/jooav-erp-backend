import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PackSizeService } from './pack-size.service';
import {
  CreatePackSizeDto,
  UpdatePackSizeDto,
  PackSizeResponseDto,
  PackSizeQueryDto,
} from './dto';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { SuccessResponse } from '../../common/dto';
import { ResponseMessages } from '../../common/utils/response-messages.util';

@ApiTags('Pack Sizes')
@Controller('pack-sizes')
@UseGuards(UnifiedAuthGuard)
export class PackSizeController {
  constructor(private readonly packSizeService: PackSizeService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create pack size (Admin only)',
    description: 'Create a new pack size for a variant',
  })
  @ApiResponse({
    status: 201,
    description: 'Pack size created successfully',
    type: PackSizeResponseDto,
  })
  async create(@Body() createPackSizeDto: CreatePackSizeDto, @Req() req: any) {
    const userId = req.user.id;
    const packSize = await this.packSizeService.create(
      createPackSizeDto,
      userId,
    );

    return new SuccessResponse(
      ResponseMessages.created('Pack size', packSize.name),
      packSize,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get all pack sizes',
    description:
      'Retrieve all active pack sizes with optional filtering and sorting',
  })
  @ApiQuery({
    name: 'variantId',
    required: false,
    description: 'Filter by variant ID',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['name', 'createdAt', 'updatedAt'],
    description: 'Sort by field',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order',
  })
  @ApiResponse({
    status: 200,
    description: 'Pack sizes retrieved successfully',
    type: [PackSizeResponseDto],
  })
  async findAll(@Query() query: PackSizeQueryDto) {
    const packSizes = await this.packSizeService.findAll({
      variantId: query.variantId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return new SuccessResponse(
      ResponseMessages.foundItems(packSizes.length, 'pack size'),
      packSizes,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get pack size by ID',
    description: 'Retrieve a specific pack size',
  })
  @ApiParam({ name: 'id', description: 'Pack size ID' })
  @ApiResponse({
    status: 200,
    description: 'Pack size retrieved successfully',
    type: PackSizeResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const packSize = await this.packSizeService.findOne(id);

    return new SuccessResponse(
      ResponseMessages.retrieved('Pack size', packSize.name),
      packSize,
    );
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update pack size (Admin only)',
    description: 'Update a pack size',
  })
  @ApiParam({ name: 'id', description: 'Pack size ID' })
  @ApiResponse({
    status: 200,
    description: 'Pack size updated successfully',
    type: PackSizeResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() updatePackSizeDto: UpdatePackSizeDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    const packSize = await this.packSizeService.update(
      id,
      updatePackSizeDto,
      userId,
    );

    return new SuccessResponse(
      ResponseMessages.updated('Pack size', packSize.name),
      packSize,
    );
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete pack size (Admin only)',
    description: 'Soft delete a pack size (archives it)',
  })
  @ApiParam({ name: 'id', description: 'Pack size ID' })
  @ApiResponse({
    status: 204,
    description: 'Pack size deleted successfully',
  })
  async remove(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.id;
    const packSize = await this.packSizeService.findOne(id);
    await this.packSizeService.remove(id, userId);

    return new SuccessResponse(
      ResponseMessages.deleted('Pack size', packSize.name),
      null,
    );
  }

  @Post(':id/activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate pack size (Admin only)',
    description: 'Activate an archived pack size',
  })
  @ApiParam({ name: 'id', description: 'Pack size ID' })
  @ApiResponse({
    status: 200,
    description: 'Pack size activated successfully',
    type: PackSizeResponseDto,
  })
  async activate(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.id;
    const packSize = await this.packSizeService.activate(id, userId);

    return new SuccessResponse(
      ResponseMessages.activated('Pack size', packSize.name),
      packSize,
    );
  }
}
