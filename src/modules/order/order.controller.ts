import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  Logger,
  BadRequestException,
  Headers,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { OrderService } from './order.service';
import { MonnifyService } from '../payment/monnify.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserId,
} from '../../common/decorators/current-user.decorator';
import { UserRole, OrderStatus } from '@prisma/client';
import {
  CreateOrderDto,
  CheckoutResponseDto,
  PaymentConfirmationDto,
  UpdateOrderItemStatusDto,
  ListOrdersQueryDto,
} from './dto/create-order.dto';
import { WebhookResponseDto } from './dto/webhook.dto';
import {
  AssignOrderDto,
  AssignmentResponseDto,
  AssignmentStatusDto,
  BulkUpdateOrderItemsDto,
  BulkUpdateResultDto,
  UpdateAvailabilityDto,
  AvailabilityStatusDto,
} from './dto/assignment.dto';
import { UnifiedAuthGuard } from 'src/common/guards/unified-auth.guard';
import { Public } from 'src/common/decorators/public.decorator';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(UnifiedAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
@ApiBearerAuth('admin-access-token')
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly monnifyService: MonnifyService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.WHOLESALER)
  @ApiOperation({
    summary: 'Create order with Monnify payment integration',
    description:
      'Creates order and generates dynamic virtual account + checkout URL for payment',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Order created successfully with payment options',
    type: CheckoutResponseDto,
  })
  async createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUserId() userId: string,
  ): Promise<CheckoutResponseDto> {
    return this.orderService.createOrder(createOrderDto, userId);
  }

  @Post(':orderNumber/verify-payment')
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.WHOLESALER,
    UserRole.PROCUREMENT_OFFICER,
  )
  @ApiOperation({
    summary: 'Verify payment status',
    description: 'Checks Monnify payment status and updates order accordingly',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Order number to verify payment for',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment verification result',
    type: PaymentConfirmationDto,
  })
  async verifyPayment(
    @Param('orderNumber') orderNumber: string,
    @CurrentUserId() userId: string,
  ): Promise<PaymentConfirmationDto> {
    return this.orderService.verifyPayment(orderNumber, userId);
  }

  @Patch(':orderNumber/items/:itemId/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PROCUREMENT_OFFICER)
  @ApiOperation({
    summary: 'Update order item status',
    description:
      'Updates the status of a specific order item (admin or assigned procurement officer)',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Order number',
  })
  @ApiParam({
    name: 'itemId',
    description: 'Order item ID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order item status updated successfully',
  })
  async updateOrderItemStatus(
    @Param('orderNumber') orderNumber: string,
    @Param('itemId') itemId: string,
    @Body() updateDto: UpdateOrderItemStatusDto,
    @CurrentUserId() userId: string,
  ) {
    return this.orderService.updateOrderItemStatus(
      orderNumber,
      itemId,
      updateDto,
      userId,
    );
  }

  @Patch(':orderNumber/items/bulk-update')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PROCUREMENT_OFFICER)
  @ApiOperation({
    summary: 'Bulk update order items status',
    description:
      'Updates the status of multiple order items in a single request (admin or assigned procurement officer)',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Order number',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk update completed successfully',
    type: BulkUpdateResultDto,
  })
  async bulkUpdateOrderItemsStatus(
    @Param('orderNumber') orderNumber: string,
    @Body() bulkUpdateDto: BulkUpdateOrderItemsDto,
    @CurrentUserId() userId: string,
  ): Promise<BulkUpdateResultDto> {
    return this.orderService.bulkUpdateOrderItemsStatus(
      orderNumber,
      bulkUpdateDto,
      userId,
    );
  }

  @Get(':orderNumber')
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.WHOLESALER,
    UserRole.PROCUREMENT_OFFICER,
  )
  @ApiOperation({
    summary: 'Get order details',
    description:
      'Retrieves detailed order information including items and payment status',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Order number to retrieve',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order details retrieved successfully',
  })
  async getOrderDetails(
    @Param('orderNumber') orderNumber: string,
    @CurrentUserId() userId: string,
  ) {
    return this.orderService.getOrderDetails(orderNumber, userId);
  }

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.WHOLESALER,
    UserRole.PROCUREMENT_OFFICER,
  )
  @ApiOperation({
    summary: 'List orders',
    description: 'Lists orders with optional filtering and pagination',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Orders retrieved successfully',
  })
  async listOrders(
    @CurrentUserId() userId: string,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.orderService.listOrders(userId, query);
  }

  @Patch(':orderNumber/assign')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Assign order to procurement officer (Admin only)',
    description: 'Assigns a confirmed and paid order to a procurement officer',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Order number to assign',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order assigned successfully',
    type: AssignmentStatusDto,
  })
  async assignOrder(
    @Param('orderNumber') orderNumber: string,
    @Body() assignDto: AssignOrderDto,
    @CurrentUserId() userId: string,
  ): Promise<AssignmentStatusDto> {
    return this.orderService.assignOrder(orderNumber, assignDto, userId);
  }

  @Post(':orderNumber/auto-assign')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Manually trigger auto-assignment (Admin only)',
    description:
      'Manually trigger auto-assignment for a specific order based on availability',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Order number to auto-assign',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Auto-assignment triggered successfully',
    type: AssignmentStatusDto,
  })
  async triggerAutoAssignment(
    @Param('orderNumber') orderNumber: string,
    @CurrentUserId() userId: string,
  ): Promise<AssignmentStatusDto | { message: string }> {
    const result = await this.orderService.autoAssignOrder(orderNumber, userId);
    if (!result) {
      return {
        message:
          'Order could not be auto-assigned (may already be assigned or no officers available)',
      };
    }
    return result;
  }

  @Patch(':orderNumber/assignment/respond')
  @Roles(UserRole.PROCUREMENT_OFFICER)
  @ApiOperation({
    summary: 'Accept or reject order assignment (Procurement Officer only)',
    description:
      'Allows procurement officer to accept or reject an order assignment',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Order number to respond to',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Assignment response recorded successfully',
    type: AssignmentStatusDto,
  })
  async respondToAssignment(
    @Param('orderNumber') orderNumber: string,
    @Body() responseDto: AssignmentResponseDto,
    @CurrentUserId() userId: string,
  ): Promise<AssignmentStatusDto> {
    return this.orderService.respondToAssignment(
      orderNumber,
      responseDto,
      userId,
    );
  }

  @Get(':orderNumber/assignment/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PROCUREMENT_OFFICER)
  @ApiOperation({
    summary: 'Get assignment status',
    description: 'Gets the current assignment status of an order',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Order number to check assignment status',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Assignment status retrieved successfully',
    type: AssignmentStatusDto,
  })
  async getAssignmentStatus(
    @Param('orderNumber') orderNumber: string,
    @CurrentUserId() userId: string,
  ): Promise<AssignmentStatusDto> {
    return this.orderService.getAssignmentStatus(orderNumber, userId);
  }

  // Procurement Officer Availability Management
  @Put('procurement-officer/availability')
  @ApiOperation({
    summary: 'Update procurement officer availability',
    description:
      'Allows procurement officers to update their availability status for order assignment',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Availability updated successfully',
    type: AvailabilityStatusDto,
  })
  @Roles(UserRole.PROCUREMENT_OFFICER)
  async updateOfficerAvailability(
    @CurrentUserId() userId: string,
    @Body() updateData: UpdateAvailabilityDto,
  ) {
    return this.orderService.updateOfficerAvailability(userId, updateData);
  }

  @Get('procurement-officer/availability')
  @ApiOperation({
    summary: 'Get procurement officer availability',
    description:
      'Retrieves current availability status for the procurement officer',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Availability status retrieved successfully',
    type: AvailabilityStatusDto,
  })
  @Roles(UserRole.PROCUREMENT_OFFICER)
  async getOfficerAvailability(@CurrentUserId() userId: string) {
    return this.orderService.getOfficerAvailability(userId);
  }

  @Get('admin/procurement-officers/availability')
  @ApiOperation({
    summary: 'Get all procurement officers availability',
    description: 'Admin view of all procurement officers availability status',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All officers availability retrieved successfully',
    isArray: true,
  })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAllOfficersAvailability(@CurrentUserId() userId: string) {
    return this.orderService.getAllOfficersAvailability();
  }

  @Post('webhook/monnify')
  @Public() // Skip authentication for webhook endpoints
  @ApiOperation({
    summary: 'Monnify payment webhook',
    description:
      'Handles Monnify payment notifications with signature verification',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook processed successfully',
    type: WebhookResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid webhook signature or data',
  })
  async handleMonnifyWebhook(
    @Body() webhookData: any,
    @Headers('monnify-signature') signature: string,
    @Req() request: any,
  ): Promise<WebhookResponseDto> {
    // Log webhook receipt immediately
    this.logger.log(`Received Monnify webhook: ${webhookData.eventType}`, {
      transactionReference: webhookData.eventData?.transactionReference,
      clientIP: request.ip || request.connection?.remoteAddress,
    });

    try {
      // Step 1: Validate IP address (Best Practice #2)
      const clientIP =
        request.ip ||
        request.connection?.remoteAddress ||
        request.headers['x-forwarded-for'];
      const isValidIP = await this.monnifyService.validateWebhookIP(clientIP);

      if (!isValidIP) {
        this.logger.warn(`Webhook rejected: Invalid IP ${clientIP}`);
        throw new BadRequestException('Unauthorized IP address');
      }

      // Step 2: Verify webhook signature (Best Practice #1)
      const isValidSignature = await this.monnifyService.verifyWebhook(
        webhookData,
        signature,
      );
      if (!isValidSignature) {
        this.logger.warn('Webhook rejected: Invalid signature');
        throw new BadRequestException('Invalid webhook signature');
      }

      // Step 3: Immediately respond with 200 (Best Practice #4)
      // We'll process asynchronously to avoid timeouts
      const processingPromise = this.orderService
        .handleMonnifyWebhook(webhookData)
        .catch((error) => {
          this.logger.error(
            'Async webhook processing failed:',
            error.message,
            error.stack,
          );
        });

      // Don't await - respond immediately to prevent timeout
      setImmediate(() => {
        processingPromise;
      });

      return {
        success: true,
        message: 'Webhook received and processing initiated',
        data: {
          eventType: webhookData.eventType,
          transactionReference: webhookData.eventData?.transactionReference,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(
        'Webhook processing error:',
        error.message,
        error.stack,
      );

      // Still return 200 to prevent retries for validation errors
      if (
        error.message.includes('Invalid webhook signature') ||
        error.message.includes('Unauthorized IP')
      ) {
        return {
          success: false,
          message: error.message,
        };
      }

      throw error;
    }
  }
}
