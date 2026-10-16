import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpStatus,
  Logger,
  BadRequestException,
  Headers,
  Req,
  HttpCode,
  type RawBodyRequest,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { OrderService } from './order.service';
import { MonnifyService } from '../payment/monnify.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Cache } from '../../common/decorators/cache.decorator';
import { CacheInterceptor } from '../../common/interceptors/cache.interceptor';
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
  InitiatePaymentDto,
  PaymentResponseDto,
  ManualPaymentResponseDto,
  DraftOrderResponseDto,
  VerifyPaymentDto,
  RejectPaymentClaimDto,
} from './dto/create-order.dto';
import {
  CreateOutOfStockReportDto,
  OutOfStockReportListResponseDto,
  OutOfStockReportResponseDto,
} from './dto/out-of-stock.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { WebhookResponseDto } from './dto/webhook.dto';
import { SuccessResponse } from '../../common/dto/api-response.dto';
import {
  AssignOrderDto,
  AssignmentResponseDto,
  AssignmentStatusDto,
  BulkUpdateOrderItemsDto,
  BulkUpdateResultDto,
  UpdateAvailabilityDto,
  AvailabilityStatusDto,
} from './dto/assignment.dto';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

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
    summary: 'Create draft order',
    description:
      'Creates a draft order that can be edited. Items are optional and no payment is initiated.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Draft order created successfully',
    type: DraftOrderResponseDto,
  })
  async createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUserId() userId: string,
  ): Promise<DraftOrderResponseDto> {
    return this.orderService.createOrder(createOrderDto, userId);
  }

  @Post(':orderNumber/initiate-payment')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.WHOLESALER)
  @ApiOperation({
    summary: 'Initiate payment for draft order',
    description:
      'Converts a DRAFT order to PENDING_PAYMENT and generates a Monnify virtual account. ' +
      '\n\n**Address rules:**' +
      '\n- `deliveryAddress` is strictly required for all users. Only the `address` sub-field is mandatory; all others (city, state, contactName, contactPhone) are optional.' +
      "\n\n**Phone fallback**: If `contactPhone` is omitted from the address, it will be auto-filled from the wholesaler's user profile." +
      '\n\n**Items**: Always sourced from the draft order in the database — do not include items in this request.',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Draft order number to initiate payment for',
    example: 'DRAFT-1536724985',
  })
  @ApiBadRequestResponse({
    description:
      'Validation failed — e.g. deliveryAddress missing for wholesaler, empty order, or zero total',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment initiated successfully',
    type: PaymentResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Access denied or order belongs to another user',
  })
  @ApiNotFoundResponse({
    description: 'Order not found',
  })
  async initiatePayment(
    @Param('orderNumber') orderNumber: string,
    @Body() initiatePaymentDto: InitiatePaymentDto,
    @CurrentUserId() userId: string,
    @Headers('origin') requestOrigin?: string,
  ): Promise<PaymentResponseDto> {
    return this.orderService.initiatePayment(
      orderNumber,
      userId,
      initiatePaymentDto,
      undefined,
      requestOrigin,
    );
  }

  @Post(':orderNumber/initiate-manual-payment')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.WHOLESALER)
  @ApiOperation({
    summary: 'Initiate manual payment for draft order (no Monnify)',
    description:
      'Converts a DRAFT order to PENDING_PAYMENT without Monnify integration. ' +
      'Admin must manually confirm payment after verification. ' +
      '\n\n**Address rules:**' +
      '\n- `deliveryAddress` is strictly required for all users. Only the `address` sub-field is mandatory; all others (city, state, contactName, contactPhone) are optional.' +
      "\n\n**Phone fallback**: If `contactPhone` is omitted from the address, it will be auto-filled from the wholesaler's user profile." +
      '\n\n**Items**: Always sourced from the draft order in the database — do not include items in this request.',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Draft order number to initiate manual payment for',
    example: 'DRAFT-1536724985',
  })
  @ApiBadRequestResponse({
    description:
      'Validation failed — e.g. deliveryAddress missing, empty order, or zero total',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Manual payment initiated successfully',
    type: ManualPaymentResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Access denied or order belongs to another user',
  })
  @ApiNotFoundResponse({
    description: 'Order not found',
  })
  async initiateManualPayment(
    @Param('orderNumber') orderNumber: string,
    @Body() initiatePaymentDto: InitiatePaymentDto,
    @CurrentUserId() userId: string,
  ): Promise<ManualPaymentResponseDto> {
    return this.orderService.initiateManualPayment(
      orderNumber,
      userId,
      initiatePaymentDto,
    );
  }

  @Post(':orderNumber/reinitiate-payment')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.WHOLESALER)
  @ApiOperation({
    summary: 'Reinitiate payment for expired orders',
    description:
      'Returns existing payment details if not expired, or recreates the order with new payment details if expired',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Order number to reinitiate payment for',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Payment reinitiated successfully or existing details returned',
    type: PaymentResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Access denied or order belongs to another user',
  })
  @ApiNotFoundResponse({
    description: 'Order not found',
  })
  async reinitiatePayment(
    @Param('orderNumber') orderNumber: string,
    @CurrentUserId() userId: string,
    @Headers('origin') requestOrigin?: string,
  ): Promise<PaymentResponseDto> {
    return this.orderService.reinitiatePayment(
      orderNumber,
      userId,
      requestOrigin,
    );
  }

  @Get('stats')
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.WHOLESALER,
    UserRole.PROCUREMENT_OFFICER,
  )
  @ApiOperation({
    summary: 'Get order statistics',
    description:
      'Get order statistics grouped by status with role-based filtering',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order statistics retrieved successfully',
  })
  async getOrderStats(@CurrentUserId() userId: string) {
    return this.orderService.getOrderStats(userId);
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
    description:
      'Verifies payment for an order. Supports two modes:\n\n' +
      '**Auto mode (default):** Checks Monnify payment status via API\n\n' +
      '**Manual mode:** Admin confirms payment without Monnify (requires ADMIN/SUPER_ADMIN role)\n\n' +
      'Both modes result in order confirmation if payment is verified.',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Order number to verify payment for',
    example: 'JOO-1234567890',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment verification result',
    type: PaymentConfirmationDto,
  })
  @ApiForbiddenResponse({
    description: 'Access denied or insufficient permissions for manual mode',
  })
  @ApiNotFoundResponse({
    description: 'Order or user not found',
  })
  @ApiBadRequestResponse({
    description: 'Verification failed or invalid order status',
  })
  async verifyPayment(
    @Param('orderNumber') orderNumber: string,
    @Body() verifyPaymentDto: VerifyPaymentDto,
    @CurrentUserId() userId: string,
  ): Promise<PaymentConfirmationDto> {
    return this.orderService.verifyPayment(
      orderNumber,
      userId,
      verifyPaymentDto?.mode,
    );
  }

  @Post(':orderNumber/payment-claim')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.WHOLESALER)
  @ApiOperation({
    summary: 'Claim payment made (manual bank transfer)',
    description:
      'The customer asserts that a bank transfer was made for a manual-payment order. The claim is recorded on the order and reviewed by an admin.',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Order number to claim payment for',
    example: 'JOO-1234567890',
  })
  async createPaymentClaim(
    @Param('orderNumber') orderNumber: string,
    @CurrentUserId() userId: string,
  ) {
    return this.orderService.createPaymentClaim(orderNumber, userId);
  }

  @Post(':orderNumber/payment-claim/reject')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Reject a pending payment claim',
    description:
      'Rejects the customer payment claim with an optional reason. The order stays awaiting payment and the customer can claim again.',
  })
  @ApiParam({
    name: 'orderNumber',
    description: 'Order number whose payment claim should be rejected',
    example: 'JOO-1234567890',
  })
  async rejectPaymentClaim(
    @Param('orderNumber') orderNumber: string,
    @Body() dto: RejectPaymentClaimDto,
    @CurrentUserId() userId: string,
  ) {
    return this.orderService.rejectPaymentClaim(
      orderNumber,
      userId,
      dto?.reason,
    );
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

  @Delete(':orderNumber/cancel')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.WHOLESALER,
    UserRole.PROCUREMENT_OFFICER,
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Cancel/Delete order',
    description:
      'Cancel or delete order based on status. DRAFT orders are completely deleted, other orders are marked as cancelled. Wholesalers can only delete their own DRAFT orders, admins can cancel/delete any order.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order cancelled/deleted successfully',
  })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions or invalid order status',
  })
  async cancelOrder(
    @Param('orderNumber') orderNumber: string,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<any>> {
    const result = await this.orderService.cancelOrder(orderNumber, userId);

    return new SuccessResponse(result.message, result.data);
  }

  @Patch(':orderNumber')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.WHOLESALER,
    UserRole.PROCUREMENT_OFFICER,
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update draft order',
    description:
      'Update DRAFT orders only. Role-based permissions: Wholesalers/POs can edit items & delivery address, Admins can edit all fields.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order updated successfully',
  })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiForbiddenResponse({
    description:
      'Access denied - only DRAFT orders can be edited or insufficient permissions',
  })
  async updateOrder(
    @Param('orderNumber') orderNumber: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<any>> {
    const result = await this.orderService.updateOrder(
      orderNumber,
      updateOrderDto,
      userId,
    );

    return new SuccessResponse(result.message, result.data);
  }

  @Post('out-of-stock-reports')
  @Roles(UserRole.WHOLESALER)
  @ApiOperation({
    summary: 'Report out-of-stock items',
    description:
      'Wholesaler marks one or more items from completed orders as out of stock',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Out-of-stock report created successfully',
    type: OutOfStockReportResponseDto,
  })
  async createOutOfStockReport(
    @Body() createDto: CreateOutOfStockReportDto,
    @CurrentUserId() userId: string,
  ): Promise<OutOfStockReportResponseDto> {
    return this.orderService.createOutOfStockReport(createDto, userId);
  }

  @Get('out-of-stock-reports')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List open out-of-stock reports',
    description:
      'Admin retrieves all open out-of-stock reports with full wholesaler and item details (no pagination)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Open out-of-stock reports retrieved successfully',
    type: OutOfStockReportListResponseDto,
  })
  async listOpenOutOfStockReports(
    @CurrentUserId() userId: string,
  ): Promise<OutOfStockReportListResponseDto> {
    return this.orderService.listOpenOutOfStockReports(userId);
  }

  @Patch('out-of-stock-reports/:reportId/resolve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Resolve out-of-stock report',
    description:
      'Admin marks an out-of-stock report as resolved so it no longer appears in open list',
  })
  @ApiParam({ name: 'reportId', description: 'Out-of-stock report ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Out-of-stock report resolved successfully',
    type: OutOfStockReportResponseDto,
  })
  async resolveOutOfStockReport(
    @Param('reportId') reportId: string,
    @CurrentUserId() userId: string,
  ): Promise<OutOfStockReportResponseDto> {
    return this.orderService.resolveOutOfStockReport(reportId, userId);
  }

  @Get(':orderNumber')
  @UseInterceptors(CacheInterceptor)
  @Cache({
    key: 'order-details',
    ttl: 180, // 3 minutes - order details change moderately
    includeParams: true,
    includeUserId: true,
    tags: ['orders', 'order-details'],
  })
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
  @UseInterceptors(CacheInterceptor)
  @Cache({
    key: 'orders',
    ttl: 300, // 5 minutes - orders change frequently
    includeParams: true,
    includeUserId: true, // User-specific caching for role-based filtering
    tags: ['orders'],
  })
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.WHOLESALER,
    UserRole.PROCUREMENT_OFFICER,
  )
  @ApiOperation({
    summary: 'List orders',
    description:
      'Lists orders with optional status filtering, sorting, and pagination',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: OrderStatus,
    description: 'Filter by order status',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: 'string',
    description:
      'Search by order number, product fields, or item details within orders',
    example: '',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description:
      'Sort orders by creation date (asc = oldest first, desc = newest first)',
    example: 'desc',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: 'integer',
    description: 'Page number (starting from 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'integer',
    description: 'Number of items per page',
    example: 10,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Orders retrieved successfully with pagination',
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
  @HttpCode(HttpStatus.OK)
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
    @Req() request: RawBodyRequest<Request>,
  ): Promise<WebhookResponseDto> {
    // Log webhook receipt immediately
    this.logger.log(`Received Monnify webhook: ${webhookData.eventType}`, {
      transactionReference: webhookData.eventData?.transactionReference,
      clientIP: request.ip || request.connection?.remoteAddress,
    });

    try {
      // Step 1: Validate IP address (Best Practice #2)
      const forwardedFor = request.headers['x-forwarded-for'];
      const clientIP =
        request.ip ||
        request.connection?.remoteAddress ||
        (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) ||
        '';
      const isValidIP = await this.monnifyService.validateWebhookIP(clientIP);

      if (!isValidIP) {
        this.logger.warn(`Webhook rejected: Invalid IP ${clientIP}`);
        throw new BadRequestException('Unauthorized IP address');
      }

      // Step 2: Verify webhook signature (Best Practice #1)
      // Must verify against the raw request bytes: re-serializing the parsed
      // body can alter number formatting/unicode and break the HMAC.
      const rawBody = request.rawBody;
      if (!rawBody) {
        this.logger.error(
          'Webhook rejected: raw request body unavailable for signature verification',
        );
        throw new BadRequestException('Invalid webhook payload');
      }

      const isValidSignature = await this.monnifyService.verifyWebhook(
        rawBody,
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

      // Reject with a real error status: any 2xx is treated as delivered by
      // Monnify, which hides failures from their dashboard and suppresses
      // retries. A 4xx surfaces the failure and lets Monnify retry.
      throw error;
    }
  }
}
