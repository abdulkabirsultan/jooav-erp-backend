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
import { PackTypeService } from './pack-type.service';
import {
  CreatePackTypeDto,
  UpdatePackTypeDto,
  PackTypeResponseDto,
} from './dto';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { SuccessResponse } from '../../common/dto';
import { ResponseMessages } from '../../common/utils/response-messages.util';

@ApiTags('Pack Types')
@Controller('pack-types')
@UseGuards(UnifiedAuthGuard)
export class PackTypeController {
  constructor(private readonly packTypeService: PackTypeService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create pack type (Admin only)',
    description: 'Create a new pack type for a variant',
  })
  @ApiResponse({
    status: 201,
    description: 'Pack type created successfully',
    type: PackTypeResponseDto,
  })
  async create(@Body() createPackTypeDto: CreatePackTypeDto, @Req() req: any) {
    const userId = req.user.id;
    const packType = await this.packTypeService.create(
      createPackTypeDto,
      userId,
    );

    return new SuccessResponse(
      ResponseMessages.created('Pack type', packType.name),
      packType,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get all pack types',
    description: 'Retrieve all active pack types',
  })
  @ApiQuery({
    name: 'variantId',
    required: false,
    description: 'Filter by variant ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Pack types retrieved successfully',
    type: [PackTypeResponseDto],
  })
  async findAll(@Query('variantId') variantId?: string) {
    const packTypes = await this.packTypeService.findAll(variantId);

    return new SuccessResponse(
      ResponseMessages.foundItems(packTypes.length, 'pack type'),
      packTypes,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get pack type by ID',
    description: 'Retrieve a specific pack type',
  })
  @ApiParam({ name: 'id', description: 'Pack type ID' })
  @ApiResponse({
    status: 200,
    description: 'Pack type retrieved successfully',
    type: PackTypeResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const packType = await this.packTypeService.findOne(id);

    return new SuccessResponse(
      ResponseMessages.retrieved('Pack type', packType.name),
      packType,
    );
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update pack type (Admin only)',
    description: 'Update a pack type',
  })
  @ApiParam({ name: 'id', description: 'Pack type ID' })
  @ApiResponse({
    status: 200,
    description: 'Pack type updated successfully',
    type: PackTypeResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() updatePackTypeDto: UpdatePackTypeDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    const packType = await this.packTypeService.update(
      id,
      updatePackTypeDto,
      userId,
    );

    return new SuccessResponse(
      ResponseMessages.updated('Pack type', packType.name),
      packType,
    );
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete pack type (Admin only)',
    description: 'Soft delete a pack type (archives it)',
  })
  @ApiParam({ name: 'id', description: 'Pack type ID' })
  @ApiResponse({
    status: 204,
    description: 'Pack type deleted successfully',
  })
  async remove(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.id;
    const packType = await this.packTypeService.findOne(id);
    await this.packTypeService.remove(id, userId);

    return new SuccessResponse(
      ResponseMessages.deleted('Pack type', packType.name),
      null,
    );
  }

  @Post(':id/activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate pack type (Admin only)',
    description: 'Activate an archived pack type',
  })
  @ApiParam({ name: 'id', description: 'Pack type ID' })
  @ApiResponse({
    status: 200,
    description: 'Pack type activated successfully',
    type: PackTypeResponseDto,
  })
  async activate(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.id;
    const packType = await this.packTypeService.activate(id, userId);

    return new SuccessResponse(
      ResponseMessages.activated('Pack type', packType.name),
      packType,
    );
  }
}
