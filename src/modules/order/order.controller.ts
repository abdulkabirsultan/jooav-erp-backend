import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  ParseUUIDPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, OrderStatus } from '@prisma/client';

@ApiTags('Orders')
@ApiBearerAuth('access-token')
@ApiBearerAuth('admin-access-token')
@Controller('orders')
@UseGuards(UnifiedAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @Roles(UserRole.WHOLESALER)
  @ApiOperation({ summary: 'Create a new order (Wholesaler only)' })
  @ApiResponse({
    status: 201,
    description: 'Order created successfully',
    type: OrderResponseDto,
  })
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @Request() req: any,
  ): Promise<OrderResponseDto> {
    if (!req.user?.wholesalerProfile?.id) {
      throw new BadRequestException('Wholesaler profile not found for user');
    }

    return this.orderService.createOrder(
      createOrderDto,
      req.user.wholesalerProfile.id,
      req.user.id,
    );
  }

  @Patch(':id/submit')
  @Roles(UserRole.WHOLESALER)
  @ApiOperation({ summary: 'Submit draft order (Wholesaler only)' })
  @ApiResponse({
    status: 200,
    description: 'Order submitted successfully',
    type: OrderResponseDto,
  })
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<OrderResponseDto> {
    if (!req.user?.wholesalerProfile?.id) {
      throw new BadRequestException('Wholesaler profile not found for user');
    }

    return this.orderService.submitOrder(id, req.user.wholesalerProfile.id);
  }

  @Patch(':id/confirm')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Confirm submitted order (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Order confirmed successfully',
    type: OrderResponseDto,
  })
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponseDto> {
    return this.orderService.confirmOrder(id);
  }

  @Patch(':id/assign')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Assign procurement officer (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Procurement officer assigned successfully',
    type: OrderResponseDto,
  })
  async assignProcurementOfficer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('procurementOfficerId') procurementOfficerId: string,
  ): Promise<OrderResponseDto> {
    if (!procurementOfficerId) {
      throw new BadRequestException('Procurement officer ID is required');
    }

    return this.orderService.assignProcurementOfficer(id, procurementOfficerId);
  }

  @Patch(':id/status')
  @Roles(UserRole.PROCUREMENT_OFFICER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update order status (Procurement Officer/Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
    type: OrderResponseDto,
  })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @Request() req: any,
  ): Promise<OrderResponseDto> {
    const procurementOfficerId =
      req.user.role === UserRole.PROCUREMENT_OFFICER
        ? req.user.procurementOfficerProfile?.id
        : undefined;

    return this.orderService.updateOrderStatus(
      id,
      updateOrderDto.status as OrderStatus,
      procurementOfficerId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get orders with pagination and filtering' })
  @ApiResponse({
    status: 200,
    description: 'Orders retrieved successfully',
  })
  @ApiQuery({ name: 'page', required: false, type: 'number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: 'number', example: 10 })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  async findAll(
    @Request() req: any,
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
    @Query('status') status?: OrderStatus,
  ) {
    // Validate pagination parameters
    if (page < 1) page = 1;
    if (limit < 1 || limit > 100) limit = 10;

    // Wholesalers can only see their own orders
    const wholesalerId =
      req.user.role === UserRole.WHOLESALER
        ? req.user.wholesalerProfile?.id
        : undefined;

    // Procurement officers can only see orders assigned to them
    const procurementOfficerId =
      req.user.role === UserRole.PROCUREMENT_OFFICER
        ? req.user.procurementOfficerProfile?.id
        : undefined;

    return this.orderService.getOrders(
      page,
      limit,
      wholesalerId,
      procurementOfficerId,
      status,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({
    status: 200,
    description: 'Order retrieved successfully',
    type: OrderResponseDto,
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<OrderResponseDto> {
    // Wholesalers can only see their own orders
    const wholesalerId =
      req.user.role === UserRole.WHOLESALER
        ? req.user.wholesalerProfile?.id
        : undefined;

    return this.orderService.getOrder(id, wholesalerId);
  }
}
