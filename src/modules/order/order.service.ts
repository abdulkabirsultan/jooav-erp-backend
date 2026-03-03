import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MonnifyService } from '../payment/monnify.service';
import {
  CreateOrderDto,
  UpdateOrderItemStatusDto,
} from './dto/create-order.dto';
import {
  AssignOrderDto,
  AssignmentResponseDto,
  AssignmentResponseType,
  AssignmentStatusDto,
  BulkUpdateOrderItemsDto,
  BulkUpdateResultDto,
  UpdateAvailabilityDto,
  AvailabilityStatusDto,
} from './dto/assignment.dto';
import {
  OrderStatus,
  OrderItemStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
  AssignmentStatus,
  ProcurementOfficerStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly monnifyService: MonnifyService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create order with Monnify integration
   * Supports both admin and wholesaler order creation
   */
  async createOrder(createOrderDto: CreateOrderDto, userId: string) {
    // Get user and their role
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userRole = user.role;
    this.logger.log(`Creating order for user ${userId} with role ${userRole}`);

    // Validate permissions
    let targetWholesalerId: string;
    if (userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN) {
      if (!createOrderDto.wholesalerId) {
        throw new BadRequestException(
          'Admin must specify wholesaler user ID when creating order',
        );
      }

      // For admins, validate that the provided ID is a wholesaler user
      const wholesalerUser = await this.prismaService.user.findUnique({
        where: { id: createOrderDto.wholesalerId },
        include: { wholesalerProfile: true },
      });

      if (!wholesalerUser) {
        throw new NotFoundException('Wholesaler user not found');
      }

      if (wholesalerUser.role !== UserRole.WHOLESALER) {
        throw new BadRequestException('Provided user ID is not a wholesaler');
      }

      if (!wholesalerUser.wholesalerProfile) {
        throw new NotFoundException('Wholesaler profile not found for user');
      }

      targetWholesalerId = wholesalerUser.wholesalerProfile.id;
    } else if (userRole === UserRole.WHOLESALER) {
      // For wholesalers, find their wholesaler record using userId
      const wholesalerProfile = await this.prismaService.wholesaler.findUnique({
        where: { userId: userId },
      });

      if (!wholesalerProfile) {
        throw new NotFoundException('Wholesaler profile not found for user');
      }

      if (
        createOrderDto.wholesalerId &&
        createOrderDto.wholesalerId !== userId
      ) {
        throw new ForbiddenException(
          'Wholesaler can only create orders for themselves',
        );
      }
      targetWholesalerId = wholesalerProfile.id;
    } else {
      throw new ForbiddenException(
        'Only admins and wholesalers can create orders',
      );
    }

    // Validate wholesaler exists
    const wholesaler = await this.prismaService.wholesaler.findUnique({
      where: { id: targetWholesalerId },
      include: { user: true },
    });

    if (!wholesaler) {
      throw new NotFoundException('Wholesaler not found');
    }

    // Validate products and calculate total
    const productIds = createOrderDto.items.map((item) => item.productId);
    const products = await this.prismaService.product.findMany({
      where: {
        id: { in: productIds },
        deletedAt: null,
        status: 'LIVE', // Only allow orders for live products
      },
      select: { id: true, name: true, quantity: true, price: true },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('Some products not found or not available');
    }

    // Validate inventory availability
    const inventoryErrors: string[] = [];
    createOrderDto.items.forEach((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (product && product.quantity < item.quantity) {
        inventoryErrors.push(
          `Insufficient stock for ${product.name}. Available: ${product.quantity}, Requested: ${item.quantity}`,
        );
      }
    });

    if (inventoryErrors.length > 0) {
      throw new BadRequestException(
        `Inventory validation failed: ${inventoryErrors.join('; ')}`,
      );
    }

    // Calculate total amount
    let totalAmount = 0;
    const orderItemsData = createOrderDto.items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const itemTotal = item.quantity * item.unitPrice;
      totalAmount += itemTotal;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: itemTotal,
        status: OrderItemStatus.PENDING,
        statusUpdatedBy: userId,
      };
    });

    // Generate order number
    const orderNumber = await this.generateOrderNumber();

    try {
      // Create Monnify invoice
      const invoiceData = {
        amount: totalAmount,
        invoiceReference: orderNumber,
        customerName:
          wholesaler.user.firstName + ' ' + wholesaler.user.lastName,
        customerEmail: wholesaler.user.email,
        description: `Payment for Order ${orderNumber}`,
        contractCode: this.configService.get('MONNIFY_CONTRACT_CODE'),
        currencyCode: 'NGN',
        expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        paymentMethods: ['ACCOUNT_TRANSFER', 'CARD'],
        redirectUrl:
          this.configService.get('APP_BASE_URL') +
          `/order/${orderNumber}/payment/success`,
      };

      const monnifyInvoice =
        await this.monnifyService.createInvoice(invoiceData);

      // Adapt to new Monnify response format
      const virtualAccounts = [
        {
          accountNumber: monnifyInvoice.responseBody.accountNumber,
          accountName: monnifyInvoice.responseBody.accountName,
          bankCode: monnifyInvoice.responseBody.bankCode,
          bankName: monnifyInvoice.responseBody.bankName,
        },
      ];

      // Parse the expiry date properly
      const expiryDate = new Date(
        monnifyInvoice.responseBody.expiryDate.replace(' ', 'T'),
      );

      // Create order in database
      const order = await this.prismaService.order.create({
        data: {
          orderNumber,
          wholesalerId: targetWholesalerId,
          status: OrderStatus.DRAFT,
          subtotal: totalAmount, // For now, subtotal equals total
          totalAmount,
          deliveryAddress: createOrderDto.deliveryAddress,
          customerNotes: createOrderDto.customerNotes,
          monnifyInvoiceRef: monnifyInvoice.responseBody.transactionReference,
          virtualAccounts: virtualAccounts,
          checkoutUrl: monnifyInvoice.responseBody.checkoutUrl,
          paymentExpiresAt: expiryDate,
          createdById: userId,
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true },
              },
            },
          },
          wholesaler: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      // Reserve inventory by reducing product quantities
      await this.reserveInventoryForOrder(createOrderDto.items);

      this.logger.log(
        `Order ${orderNumber} created successfully with Monnify invoice ${monnifyInvoice.responseBody.transactionReference}`,
      );

      return {
        success: true,
        message: 'Order created successfully',
        data: {
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            totalAmount: Number(order.totalAmount),
            status: order.status,
          },
          virtualAccounts: order.virtualAccounts as Array<{
            accountNumber: string;
            accountName: string;
            bankCode: string;
            bankName: string;
          }>,
          checkoutUrl: order.checkoutUrl || '',
          expiryDate: order.paymentExpiresAt?.toISOString() || '',
          invoiceReference: order.monnifyInvoiceRef || '',
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to create order: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        'Failed to create order and payment invoice',
      );
    }
  }

  /**
   * Verify payment status from Monnify
   */
  async verifyPayment(orderNumber: string, userId: string) {
    // Get user and their role
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userRole = user.role;
    this.logger.log(
      `Verifying payment for order ${orderNumber} by user ${userId}`,
    );

    const order = await this.prismaService.order.findUnique({
      where: { orderNumber },
      include: {
        wholesaler: true,
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check permissions
    if (userRole === UserRole.WHOLESALER) {
      // Find the wholesaler profile for this user
      const wholesalerProfile = await this.prismaService.wholesaler.findUnique({
        where: { userId: userId },
      });

      if (!wholesalerProfile) {
        throw new NotFoundException('Wholesaler profile not found for user');
      }

      if (order.wholesalerId !== wholesalerProfile.id) {
        throw new ForbiddenException('You can only verify your own orders');
      }
    }
    // Procurement officers can verify any order (removed assignment restriction)

    try {
      // Use the orderNumber as the invoice reference, not the monnify transaction ref
      const invoiceStatus = await this.monnifyService.getInvoiceStatus(
        order.orderNumber,
      );
      if (invoiceStatus.responseBody.paymentStatus === 'PAID') {
        // Check if payment already recorded
        const existingPayment = order.payments.find(
          (p) =>
            p.monnifyInvoiceRef === order.monnifyInvoiceRef &&
            p.status === PaymentStatus.COMPLETED,
        );

        if (!existingPayment) {
          // Record the payment
          await this.prismaService.payment.create({
            data: {
              orderId: order.id,
              amount: invoiceStatus.responseBody.amountPaid,
              paymentMethod: this.mapMonnifyPaymentMethod(
                invoiceStatus.responseBody.paymentMethod,
              ),
              status: PaymentStatus.COMPLETED,
              monnifyInvoiceRef:
                invoiceStatus.responseBody.transactionReference,
              paidAt: new Date(),
            },
          });

          // Update order status
          await this.prismaService.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.CONFIRMED },
          });

          // Auto-confirm order items for paid orders
          await this.prismaService.orderItem.updateMany({
            where: {
              orderId: order.id,
              status: OrderItemStatus.PENDING,
            },
            data: {
              status: OrderItemStatus.PAID,
              statusUpdatedAt: new Date(),
              statusUpdatedBy: userId, // Use the actual user ID instead of 'system'
            },
          });

          // Trigger auto-assignment for paid orders
          try {
            await this.autoAssignOrder(order.orderNumber, userId);
            this.logger.log(
              `Auto-assignment triggered for order ${order.orderNumber}`,
            );
          } catch (autoAssignError) {
            // Log but don't fail payment verification if auto-assignment fails
            this.logger.warn(
              `Auto-assignment failed for order ${order.orderNumber}: ${autoAssignError.message}`,
            );
          }
        }

        return {
          success: true,
          message: 'Payment confirmed successfully',
          paymentDetails: {
            transactionReference:
              invoiceStatus.responseBody.transactionReference,
            amountPaid: invoiceStatus.responseBody.amountPaid,
            paidOn: invoiceStatus.responseBody.paidOn,
            paymentMethod: invoiceStatus.responseBody.paymentMethod,
          },
        };
      } else {
        return {
          success: false,
          message: `Payment status: ${invoiceStatus.responseBody.paymentStatus}`,
        };
      }
    } catch (error) {
      this.logger.error(
        `Failed to verify payment for order ${orderNumber}: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Failed to verify payment status');
    }
  }

  /**
   * Update order item status (admin only)
   */
  async updateOrderItemStatus(
    orderNumber: string,
    itemId: string,
    updateDto: UpdateOrderItemStatusDto,
    userId: string,
  ) {
    // Get user and their role
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userRole = user.role;

    const orderItem = await this.prismaService.orderItem.findFirst({
      where: {
        id: itemId,
        order: { orderNumber },
      },
      include: {
        order: true,
        product: {
          select: {
            id: true,
            name: true,
            thumbnail: true,
            images: true,
            brand: { select: { name: true } },
            packSize: { select: { name: true } },
            packType: { select: { name: true } },
            price: true,
            discount: true,
            variant: { select: { id: true, name: true } },
            subcategory: {
              select: {
                name: true,
                category: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!orderItem) {
      throw new NotFoundException('Order item not found');
    }

    // Check permissions
    if (userRole === UserRole.PROCUREMENT_OFFICER) {
      // Procurement officers can only update items for orders assigned to them
      if (orderItem.order.assignedProcurementOfficerId !== userId) {
        throw new ForbiddenException(
          'You can only update items for orders assigned to you',
        );
      }
    } else if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only admins or assigned procurement officers can update order item status',
      );
    }

    // Validate status enum before proceeding
    if (!Object.values(OrderItemStatus).includes(updateDto.status)) {
      throw new BadRequestException(
        `Invalid status value. Must be one of: ${Object.values(OrderItemStatus).join(', ')}`,
      );
    }

    // Validate status transition rules
    if (updateDto.status === OrderItemStatus.DELIVERED) {
      const allowedPreviousStatuses: OrderItemStatus[] = [
        OrderItemStatus.SOURCING,
        OrderItemStatus.READY,
        OrderItemStatus.SHIPPED,
      ];

      if (!allowedPreviousStatuses.includes(orderItem.status)) {
        throw new BadRequestException(
          `Cannot mark item as delivered. Item must first be in progress (SOURCING, READY, or SHIPPED) before it can be marked as completed.`,
        );
      }
    }

    // Prevent status modification for draft orders (payment hasn't been made)
    if (orderItem.order.status === OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Cannot modify order item status for draft orders. Payment must be completed first.',
      );
    }

    const updatedItem = await this.prismaService.orderItem.update({
      where: { id: itemId },
      data: {
        status: updateDto.status as OrderItemStatus,
        processingNotes: updateDto.processingNotes,
        statusUpdatedAt: new Date(),
        statusUpdatedBy: userId,
      },
    });

    // Auto-transition order status based on item changes
    await this.updateOrderStatusBasedOnItems(orderItem.order.id, userId);

    this.logger.log(
      `Order item ${itemId} status updated to ${updateDto.status} by admin ${userId}`,
    );

    return {
      success: true,
      message: 'Order item status updated successfully',
      item: {
        id: updatedItem.id,
        status: updatedItem.status,
        processingNotes: updatedItem.processingNotes,
        updatedAt: updatedItem.statusUpdatedAt,
      },
    };
  }

  /**
   * Bulk update order items status
   */
  async bulkUpdateOrderItemsStatus(
    orderNumber: string,
    bulkUpdateDto: BulkUpdateOrderItemsDto,
    userId: string,
  ): Promise<BulkUpdateResultDto> {
    // Get user and their role
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Get the order
    const order = await this.prismaService.order.findUnique({
      where: { orderNumber },
      include: {
        items: {
          include: {
            product: {
              include: {
                brand: true,
                subcategory: true,
              },
            },
          },
        },
        createdBy: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    // Check access permissions
    if (
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.ADMIN &&
      user.role === UserRole.WHOLESALER &&
      order.createdById !== user.id
    ) {
      throw new ForbiddenException('Access denied to this order');
    }

    // Prevent bulk status modification for draft orders (payment hasn't been made)
    if (order.status === OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Cannot modify order item status for draft orders. Payment must be completed first.',
      );
    }

    // Get all requested items to validate they exist and belong to this order
    const existingItems = await this.prismaService.orderItem.findMany({
      where: {
        id: { in: bulkUpdateDto.items.map((item) => item.itemId) },
        orderId: order.id,
      },
      include: {
        product: {
          include: {
            brand: true,
            subcategory: true,
          },
        },
      },
    });

    // Check if all items exist
    const existingItemIds = existingItems.map((item) => item.id);
    const missingItemIds = bulkUpdateDto.items
      .map((item) => item.itemId)
      .filter((id) => !existingItemIds.includes(id));

    if (missingItemIds.length > 0) {
      throw new BadRequestException(
        `Order items not found: ${missingItemIds.join(', ')}`,
      );
    }

    const results: Array<{
      itemId: string;
      success: boolean;
      message: string;
      updatedItem?: any;
    }> = [];

    // Process each item update
    for (const updateItem of bulkUpdateDto.items) {
      try {
        const existingItem = existingItems.find(
          (item) => item.id === updateItem.itemId,
        );

        // Validate procurement officer assignment
        if (user.role === UserRole.PROCUREMENT_OFFICER) {
          // Procurement officers can only update items for orders assigned to them
          if (order.assignedProcurementOfficerId !== user.id) {
            results.push({
              itemId: updateItem.itemId,
              success: false,
              message: 'You can only update items for orders assigned to you',
            });
            continue;
          }
        }

        // Safety check for data consistency
        if (!existingItem) {
          results.push({
            itemId: updateItem.itemId,
            success: false,
            message: 'Item not found',
          });
          continue;
        }

        // Validate status transition rules
        if (updateItem.status === OrderItemStatus.DELIVERED) {
          const allowedPreviousStatuses: OrderItemStatus[] = [
            OrderItemStatus.SOURCING,
            OrderItemStatus.READY,
            OrderItemStatus.SHIPPED,
          ];

          if (!allowedPreviousStatuses.includes(existingItem.status)) {
            results.push({
              itemId: updateItem.itemId,
              success: false,
              message:
                'Cannot mark item as delivered. Item must first be in progress (SOURCING, READY, or SHIPPED) before it can be marked as completed.',
            });
            continue;
          }
        }

        // Update the item
        const updatedItem = await this.prismaService.orderItem.update({
          where: { id: updateItem.itemId },
          data: {
            status: updateItem.status,
            processingNotes:
              updateItem.processingNotes || existingItem.processingNotes,
            statusUpdatedAt: new Date(),
            statusUpdatedBy: user.id,
          },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                thumbnail: true,
                images: true,
                brand: { select: { name: true } },
                packSize: { select: { name: true } },
                packType: { select: { name: true } },
                price: true,
                discount: true,
                variant: { select: { id: true, name: true } },
                subcategory: {
                  select: {
                    name: true,
                    category: { select: { name: true } },
                  },
                },
              },
            },
          },
        });

        results.push({
          itemId: updateItem.itemId,
          success: true,
          message: 'Item status updated successfully',
          updatedItem: {
            id: updatedItem.id,
            status: updatedItem.status,
            processingNotes: updatedItem.processingNotes,
            updatedAt: updatedItem.statusUpdatedAt,
          },
        });
      } catch (error) {
        results.push({
          itemId: updateItem.itemId,
          success: false,
          message: error.message || 'Failed to update item status',
        });
      }
    }

    // Update order status based on items (only if all updates succeeded)
    const successfulUpdates = results.filter((result) => result.success);
    if (successfulUpdates.length === bulkUpdateDto.items.length) {
      try {
        await this.updateOrderStatusBasedOnItems(order.id, user.id);
      } catch (error) {
        // Log but don't fail the bulk operation
        console.error('Failed to update order status:', error);
      }
    }

    const successCount = results.filter((result) => result.success).length;
    const failureCount = results.filter((result) => !result.success).length;

    return {
      success: true,
      message: `Bulk update completed: ${successCount} successful, ${failureCount} failed`,
      data: {
        totalItems: bulkUpdateDto.items.length,
        successCount,
        failureCount,
        results,
      },
    };
  }

  /**
   * Get order details with items
   */
  async getOrderDetails(orderNumber: string, userId: string) {
    // Get user and their role
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userRole = user.role;
    const order = await this.prismaService.order.findUnique({
      where: { orderNumber },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                thumbnail: true,
                images: true,
                brand: { select: { name: true } },
                packSize: { select: { name: true } },
                packType: { select: { name: true } },
                price: true,
                discount: true,
                variant: { select: { id: true, name: true } },
                subcategory: {
                  select: {
                    name: true,
                    category: { select: { name: true } },
                  },
                },
              },
            },
            statusUpdatedByUser: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        wholesaler: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        assignedProcurementOfficer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        payments: {
          where: { status: PaymentStatus.COMPLETED },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check permissions
    if (userRole === UserRole.WHOLESALER) {
      // Find the wholesaler profile for this user
      const wholesalerProfile = await this.prismaService.wholesaler.findUnique({
        where: { userId: userId },
      });

      if (!wholesalerProfile) {
        throw new NotFoundException('Wholesaler profile not found for user');
      }

      if (order.wholesalerId !== wholesalerProfile.id) {
        throw new ForbiddenException('You can only view your own orders');
      }
    } else if (userRole === UserRole.PROCUREMENT_OFFICER) {
      // Procurement officers can only view orders assigned to them
      if (order.assignedProcurementOfficerId !== userId) {
        throw new ForbiddenException(
          'You can only view orders assigned to you',
        );
      }
    }

    return {
      success: true,
      message: 'Order details retrieved successfully',
      data: {
        ...order,
        procurementOfficerName: order.assignedProcurementOfficer
          ? `${order.assignedProcurementOfficer.firstName} ${order.assignedProcurementOfficer.lastName}`
          : null,
      },
    };
  }

  /**
   * List orders with filtering and pagination
   */
  async listOrders(userId: string, queryDto: any = {}) {
    // Get user and their role
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userRole = user.role;
    const where: any = {};

    // Set pagination defaults
    const page = queryDto.page || 1;
    const limit = queryDto.limit || 10;
    const offset = (page - 1) * limit;

    // Apply role-based filtering
    if (userRole === UserRole.WHOLESALER) {
      // Find the wholesaler profile for this user
      const wholesalerProfile = await this.prismaService.wholesaler.findUnique({
        where: { userId: userId },
      });

      if (!wholesalerProfile) {
        throw new NotFoundException('Wholesaler profile not found for user');
      }

      where.wholesalerId = wholesalerProfile.id;
    } else if (userRole === UserRole.PROCUREMENT_OFFICER) {
      // Procurement officers can see orders assigned to them
      where.assignedProcurementOfficerId = userId;
    }

    // Apply additional filters
    if (queryDto.status) {
      where.status = queryDto.status;
    }

    // Set sort order (default: desc)
    const sortOrder = queryDto.sortOrder || 'desc';

    // Get total count for pagination
    const totalCount = await this.prismaService.order.count({ where });

    const orders = await this.prismaService.order.findMany({
      where,
      include: {
        wholesaler: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        assignedProcurementOfficer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          select: {
            id: true,
            quantity: true,
            lineTotal: true,
            status: true,
            product: {
              select: {
                id: true,
                name: true,
                thumbnail: true,
                images: true,
                brand: { select: { name: true } },
                packSize: { select: { name: true } },
                packType: { select: { name: true } },
                price: true,
                discount: true,
                variant: { select: { id: true, name: true } },
                subcategory: {
                  select: {
                    name: true,
                    category: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: sortOrder as 'asc' | 'desc' },
      skip: offset,
      take: limit,
    });

    // Transform orders to include PO name
    const transformedOrders = orders.map((order) => ({
      ...order,
      procurementOfficerName: order.assignedProcurementOfficer
        ? `${order.assignedProcurementOfficer.firstName} ${order.assignedProcurementOfficer.lastName}`
        : null,
    }));

    const totalPages = Math.ceil(totalCount / limit);

    return {
      success: true,
      message: 'Orders retrieved successfully',
      data: {
        orders: transformedOrders,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    };
  }

  /**
   * Handle Monnify webhook with proper duplicate prevention and processing
   */
  async handleMonnifyWebhook(webhookData: any) {
    // Basic validation
    if (!webhookData.eventType || !webhookData.eventData) {
      this.logger.error('Invalid webhook data: missing eventType or eventData');
      return {
        success: false,
        message: 'Invalid webhook data structure',
      };
    }

    const { eventType, eventData } = webhookData;
    const transactionReference = eventData?.transactionReference;

    if (!transactionReference) {
      this.logger.error('Webhook missing transactionReference');
      return {
        success: false,
        message: 'Invalid webhook data - missing transaction reference',
      };
    }

    this.logger.log(
      `Processing Monnify webhook: ${eventType} for transaction: ${transactionReference}`,
    );

    // Step 1: Check for duplicate webhook processing using existing payment records
    const existingPayment = await this.prismaService.payment.findFirst({
      where: {
        monnifyInvoiceRef: transactionReference,
        status: PaymentStatus.COMPLETED,
      },
    });

    if (existingPayment) {
      this.logger.log(
        `Duplicate webhook detected for transaction: ${transactionReference}. Already processed.`,
      );
      return {
        success: true,
        message: 'Webhook already processed',
        processed: false,
      };
    }

    try {
      // Process the webhook based on event type
      let result;

      switch (eventType) {
        case 'SUCCESSFUL_TRANSACTION':
          result = await this.processSuccessfulTransaction(eventData);
          break;
        case 'FAILED_TRANSACTION':
          result = await this.processFailedTransaction(eventData);
          break;
        case 'SUCCESSFUL_REFUND':
          result = await this.processRefund(eventData);
          break;
        default:
          this.logger.warn(`Unhandled webhook event type: ${eventType}`);
          result = {
            success: true,
            message: `Event type ${eventType} received but not processed`,
          };
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to process webhook for transaction ${transactionReference}:`,
        error.message,
        error.stack,
      );

      throw error;
    }
  }

  /**
   * Process successful transaction webhook
   */
  private async processSuccessfulTransaction(eventData: any) {
    // Validate required fields
    if (!eventData.paymentReference || !eventData.transactionReference) {
      this.logger.error(
        'Missing required webhook fields: paymentReference or transactionReference',
      );
      return { success: false, message: 'Missing required webhook fields' };
    }

    const orderNumber = eventData.paymentReference; // This is the order number
    const transactionReference = eventData.transactionReference; // This is Monnify's transaction ID

    const order = await this.prismaService.order.findFirst({
      where: { orderNumber: orderNumber },
    });

    if (!order) {
      this.logger.warn(
        `Order not found for order number: ${orderNumber} (Monnify transaction: ${transactionReference})`,
      );
      return { success: false, message: 'Order not found' };
    }

    // Check if payment already processed to prevent double processing
    const existingPayment = await this.prismaService.payment.findFirst({
      where: {
        orderId: order.id,
        monnifyInvoiceRef: transactionReference,
        status: PaymentStatus.COMPLETED,
      },
    });

    if (existingPayment) {
      this.logger.log(
        `Payment already processed for order ${order.orderNumber}`,
      );
      return {
        success: true,
        message: 'Payment already processed',
        processed: false,
      };
    }

    // Process the payment
    await this.prismaService.$transaction(async (tx) => {
      // Record payment
      await tx.payment.create({
        data: {
          orderId: order.id,
          amount: eventData.amountPaid || eventData.totalPayable || 0,
          paymentMethod: this.mapMonnifyPaymentMethod(eventData.paymentMethod),
          monnifyInvoiceRef: transactionReference,
          status: PaymentStatus.COMPLETED,
          paidAt: new Date(eventData.paidOn),
        },
      });

      // Update order status
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CONFIRMED },
      });

      // Auto-confirm order items for paid orders (same as verify-payment)
      await tx.orderItem.updateMany({
        where: {
          orderId: order.id,
          status: OrderItemStatus.PENDING,
        },
        data: {
          status: OrderItemStatus.PAID,
          statusUpdatedAt: new Date(),
          statusUpdatedBy: 'webhook', // Use 'webhook' identifier for webhook updates
        },
      });
    });

    // Trigger auto-assignment if enabled (async - don't block webhook response)
    setImmediate(async () => {
      try {
        const autoAssignEnabled =
          this.configService.get('AUTO_ASSIGN_ENABLED', 'true') === 'true';
        if (autoAssignEnabled) {
          await this.autoAssignOrder(order.orderNumber, 'webhook-system');
          this.logger.log(
            `Auto-assignment triggered for order ${order.orderNumber}`,
          );
        }
      } catch (autoAssignError) {
        this.logger.error(
          `Auto-assignment failed for order ${order.orderNumber}: ${autoAssignError.message}`,
        );
      }
    });

    this.logger.log(
      `Payment processed successfully for order ${order.orderNumber}`,
    );

    return {
      success: true,
      message: 'Payment processed successfully',
      data: {
        orderNumber: order.orderNumber,
        amount: eventData.amountPaid,
        transactionReference: eventData.transactionReference,
      },
    };
  }

  /**
   * Process failed transaction webhook
   */
  private async processFailedTransaction(eventData: any) {
    const order = await this.prismaService.order.findFirst({
      where: { monnifyInvoiceRef: eventData.transactionReference },
    });

    if (!order) {
      this.logger.warn(
        `Order not found for failed transaction: ${eventData.transactionReference}`,
      );
      return { success: false, message: 'Order not found' };
    }

    // Log the failed payment attempt
    await this.prismaService.payment.create({
      data: {
        orderId: order.id,
        amount: eventData.amountPaid || 0,
        paymentMethod: this.mapMonnifyPaymentMethod(eventData.paymentMethod),
        monnifyInvoiceRef: eventData.transactionReference,
        status: PaymentStatus.FAILED,
      },
    });

    this.logger.log(`Failed payment recorded for order ${order.orderNumber}`);

    return {
      success: true,
      message: 'Failed payment recorded',
      data: {
        orderNumber: order.orderNumber,
        transactionReference: eventData.transactionReference,
      },
    };
  }

  /**
   * Process refund webhook
   */
  private async processRefund(eventData: any) {
    // Handle refund processing
    this.logger.log(
      `Refund webhook received for transaction: ${eventData.transactionReference}`,
    );

    return {
      success: true,
      message: 'Refund webhook received',
      data: {
        transactionReference: eventData.transactionReference,
      },
    };
  }

  /**
   * Map Monnify payment methods to our payment method enum
   */
  private mapMonnifyPaymentMethod(monnifyMethod: string): PaymentMethod {
    switch (monnifyMethod) {
      case 'ACCOUNT_TRANSFER':
        return PaymentMethod.BANK_TRANSFER;
      case 'CARD':
        return PaymentMethod.CHECKOUT_URL;
      case 'CASH':
        return PaymentMethod.BANK_TRANSFER;
      default:
        return PaymentMethod.BANK_TRANSFER;
    }
  }

  /**
   * Generate unique order number
   */
  private async generateOrderNumber(): Promise<string> {
    const prefix = 'JOO';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
  }

  /**
   * Auto-transition order status based on item statuses
   */
  private async updateOrderStatusBasedOnItems(orderId: string, userId: string) {
    const order = await this.prismaService.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) return;

    const items = order.items;

    // Auto-transition to IN_PROGRESS when any item status changes from PENDING
    // (regardless of assignment acceptance status - admins can start working on items)
    const hasNonPendingItems = items.some(
      (item) => item.status !== OrderItemStatus.PENDING,
    );

    if (order.status === OrderStatus.CONFIRMED && hasNonPendingItems) {
      await this.prismaService.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.IN_PROGRESS },
      });
      this.logger.log(
        `Order ${order.orderNumber} auto-transitioned to IN_PROGRESS (item status changed)`,
      );
      return;
    }

    // Also handle transition from ASSIGNED to IN_PROGRESS
    if (order.status === OrderStatus.ASSIGNED && hasNonPendingItems) {
      await this.prismaService.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.IN_PROGRESS },
      });
      this.logger.log(
        `Order ${order.orderNumber} auto-transitioned to IN_PROGRESS`,
      );
      return;
    }

    // Auto-transition to COMPLETED when all items are delivered
    const allDelivered = items.every(
      (item) => item.status === OrderItemStatus.DELIVERED,
    );
    if (allDelivered && order.status === OrderStatus.IN_PROGRESS) {
      await this.prismaService.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.COMPLETED },
      });
      this.logger.log(
        `Order ${order.orderNumber} auto-completed - all items delivered`,
      );
      return;
    }

    // Auto-transition to CANCELLED when all items are cancelled
    const allCancelled = items.every(
      (item) => item.status === OrderItemStatus.CANCELLED,
    );
    if (allCancelled && order.status !== OrderStatus.CANCELLED) {
      await this.prismaService.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          assignedProcurementOfficerId: null, // Remove assignment
          updatedAt: new Date(),
        },
      });
      this.logger.log(
        `Order ${order.orderNumber} auto-cancelled - all items cancelled`,
      );
    }
  }

  /**
   * Auto-assign order based on procurement officer availability
   * Assigns to officer with least active orders
   */
  async autoAssignOrder(
    orderNumber: string,
    triggeredByUserId: string,
  ): Promise<AssignmentStatusDto | null> {
    // Check if auto-assignment is enabled (you can make this configurable)
    const autoAssignEnabled =
      this.configService.get('AUTO_ASSIGN_ENABLED', 'true') === 'true';
    if (!autoAssignEnabled) {
      this.logger.log('Auto-assignment is disabled');
      return null;
    }

    // Get the order
    const order = await this.prismaService.order.findUnique({
      where: { orderNumber },
      include: {
        payments: { where: { status: PaymentStatus.COMPLETED } },
        assignedProcurementOfficer: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Only auto-assign confirmed, paid orders that aren't already assigned
    if (order.status !== OrderStatus.CONFIRMED) {
      this.logger.log(
        `Order ${orderNumber} is not confirmed, skipping auto-assignment`,
      );
      return null;
    }

    if (order.payments.length === 0) {
      this.logger.log(
        `Order ${orderNumber} is not paid, skipping auto-assignment`,
      );
      return null;
    }

    if (order.assignedProcurementOfficerId) {
      this.logger.log(
        `Order ${orderNumber} already assigned, skipping auto-assignment`,
      );
      return null;
    }

    // Find available procurement officer with least workload
    const availableOfficer = await this.findMostAvailableOfficer();

    if (!availableOfficer) {
      // Try to assign to any procurement officer (even unavailable ones)
      const anyOfficer = await this.findAnyProcurementOfficer();

      if (!anyOfficer) {
        this.logger.warn('No procurement officers exist for auto-assignment');
        return null;
      }

      // Assign to unavailable officer
      const updatedOrder = await this.prismaService.order.update({
        where: { orderNumber },
        data: {
          assignedProcurementOfficerId: anyOfficer.userId,
          assignmentStatus: AssignmentStatus.PENDING_ACCEPTANCE,
          assignedAt: new Date(),
          assignmentNotes:
            'Auto-assigned to unavailable officer due to no available officers',
        },
      });

      this.logger.log(
        `Order ${orderNumber} auto-assigned to unavailable officer ${anyOfficer.user.firstName} ${anyOfficer.user.lastName} (no available officers found)`,
      );

      return {
        success: true,
        message: 'Order auto-assigned successfully (no officers available)',
        data: {
          orderNumber: updatedOrder.orderNumber,
          status: AssignmentStatus.PENDING_ACCEPTANCE,
          procurementOfficerName: `${anyOfficer.user.firstName} ${anyOfficer.user.lastName}`,
          assignedAt: updatedOrder.assignedAt!,
        },
      };
    }

    // Auto-assign the order
    const updatedOrder = await this.prismaService.order.update({
      where: { orderNumber },
      data: {
        assignedProcurementOfficerId: availableOfficer.userId,
        assignmentStatus: AssignmentStatus.PENDING_ACCEPTANCE,
        assignedAt: new Date(),
        assignmentNotes: 'Auto-assigned based on availability',
        assignmentResponseReason: null,
      },
    });

    this.logger.log(
      `Order ${orderNumber} auto-assigned to ${availableOfficer.user.firstName} ${availableOfficer.user.lastName} (${availableOfficer.activeOrdersCount} active orders)`,
    );

    return {
      success: true,
      message: 'Order auto-assigned successfully',
      data: {
        orderNumber: updatedOrder.orderNumber,
        status: AssignmentStatus.PENDING_ACCEPTANCE,
        procurementOfficerName: `${availableOfficer.user.firstName} ${availableOfficer.user.lastName}`,
        assignedAt: updatedOrder.assignedAt!,
        assignmentNotes: updatedOrder.assignmentNotes || undefined,
      },
    };
  }

  /**
   * Find procurement officer with least active orders
   * @param excludeUserId - User ID to exclude from selection (e.g., officer who rejected)
   */
  private async findMostAvailableOfficer(excludeUserId?: string) {
    const officers =
      await this.prismaService.procurementOfficerProfile.findMany({
        include: {
          user: {
            include: {
              assignedOrders: {
                where: {
                  status: {
                    in: [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS],
                  },
                  assignmentStatus: {
                    in: [
                      AssignmentStatus.PENDING_ACCEPTANCE,
                      AssignmentStatus.ACCEPTED,
                    ],
                  },
                },
                select: { id: true },
              },
            },
          },
        },
        where: {
          user: {
            status: 'ACTIVE', // User account must be active
            ...(excludeUserId && { id: { not: excludeUserId } }),
          },
          // Officer must be available for new assignments
          availabilityStatus: ProcurementOfficerStatus.AVAILABLE,
          ...(excludeUserId && {
            userId: {
              not: excludeUserId,
            },
          }),
        },
      });

    if (officers.length === 0) {
      return null;
    }

    // Filter officers who haven't exceeded their maximum active orders
    const availableOfficers = officers.filter((officer) => {
      const activeOrders = officer.user.assignedOrders.length;
      const maxOrders = officer.maxActiveOrders || 5; // Default to 5 if not set
      return activeOrders < maxOrders;
    });

    if (availableOfficers.length === 0) {
      this.logger.warn(
        'No officers available - all have reached their maximum active orders',
      );
      return null;
    }

    // Calculate workload and find least busy officer
    const officersWithWorkload = availableOfficers.map((officer) => ({
      ...officer,
      activeOrdersCount: officer.user.assignedOrders.length,
    }));

    // Sort by active orders count (ascending), then by user ID for consistency
    officersWithWorkload.sort((a, b) => {
      if (a.activeOrdersCount !== b.activeOrdersCount) {
        return a.activeOrdersCount - b.activeOrdersCount;
      }
      return a.user.id.localeCompare(b.user.id);
    });

    return officersWithWorkload[0];
  }

  /**
   * Find any procurement officer (including unavailable ones)
   * Used as fallback when no available officers exist
   */
  private async findAnyProcurementOfficer() {
    const officers =
      await this.prismaService.procurementOfficerProfile.findMany({
        include: {
          user: {
            include: {
              assignedOrders: {
                where: {
                  status: {
                    in: [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS],
                  },
                  assignmentStatus: {
                    in: [
                      AssignmentStatus.PENDING_ACCEPTANCE,
                      AssignmentStatus.ACCEPTED,
                    ],
                  },
                },
                select: { id: true },
              },
            },
          },
        },
        where: {
          user: {
            status: 'ACTIVE', // User account must be active
          },
        },
      });

    if (officers.length === 0) {
      return null;
    }

    // Sort by active orders count to pick the least busy one
    const officersWithWorkload = officers.map((officer) => ({
      ...officer,
      activeOrdersCount: officer.user.assignedOrders.length,
    }));

    officersWithWorkload.sort((a, b) => {
      if (a.activeOrdersCount !== b.activeOrdersCount) {
        return a.activeOrdersCount - b.activeOrdersCount;
      }
      return a.user.id.localeCompare(b.user.id);
    });

    return officersWithWorkload[0];
  }

  /**
   * Assign order to procurement officer (Admin only)
   * Supports both initial assignment and reassignment (admin override)
   */
  async assignOrder(
    orderNumber: string,
    assignDto: AssignOrderDto,
    adminId: string,
  ): Promise<AssignmentStatusDto> {
    // Verify admin permissions
    const admin = await this.prismaService.user.findUnique({
      where: { id: adminId },
      select: { id: true, role: true, firstName: true, lastName: true },
    });

    if (
      !admin ||
      (admin.role !== UserRole.ADMIN && admin.role !== UserRole.SUPER_ADMIN)
    ) {
      throw new ForbiddenException('Only admins can assign orders');
    }

    // Find the order
    const order = await this.prismaService.order.findUnique({
      where: { orderNumber },
      include: {
        payments: { where: { status: PaymentStatus.COMPLETED } },
        assignedProcurementOfficer: {
          select: { firstName: true, lastName: true, id: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Validate order is ready for assignment (any status except draft)
    if (order.status === OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Cannot assign draft orders. Payment must be completed first.',
      );
    }

    // Allow assignment even without payment for non-draft orders
    // This enables reassignment of orders regardless of their current status

    // Verify procurement officer exists by user ID
    const procurementOfficerUser = await this.prismaService.user.findUnique({
      where: { id: assignDto.procurementOfficerId },
      include: {
        procurementOfficerProfile: true,
      },
    });

    if (
      !procurementOfficerUser ||
      !procurementOfficerUser.procurementOfficerProfile
    ) {
      throw new NotFoundException('Procurement officer not found');
    }

    if (procurementOfficerUser.role !== UserRole.PROCUREMENT_OFFICER) {
      throw new BadRequestException('User is not a procurement officer');
    }

    if (procurementOfficerUser.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Cannot assign to inactive procurement officer',
      );
    }

    // Check if this is a reassignment (order was previously assigned)
    const isReassignment = order.assignedProcurementOfficerId !== null;
    const previousOfficer = order.assignedProcurementOfficer;

    // For reassignment, log the change
    if (isReassignment && previousOfficer) {
      this.logger.log(
        `Admin override: Order ${orderNumber} reassigned from ${previousOfficer.firstName} ${previousOfficer.lastName} to ${procurementOfficerUser.firstName} ${procurementOfficerUser.lastName} by admin ${admin.firstName} ${admin.lastName}`,
      );
    }

    // Update order with assignment
    const updatedOrder = await this.prismaService.order.update({
      where: { orderNumber },
      data: {
        assignedProcurementOfficerId: assignDto.procurementOfficerId,
        assignmentStatus: isReassignment
          ? AssignmentStatus.REASSIGNED
          : AssignmentStatus.PENDING_ACCEPTANCE,
        assignedAt: new Date(),
        assignmentNotes:
          assignDto.assignmentNotes ||
          (isReassignment ? 'Reassigned by admin' : undefined),
        assignmentRespondedAt: null, // Reset response when reassigning
        assignmentResponseReason: null, // Reset response reason when reassigning
        // Order status remains CONFIRMED until officer accepts
      },
    });

    const assignmentStatus = isReassignment
      ? AssignmentStatus.REASSIGNED
      : AssignmentStatus.PENDING_ACCEPTANCE;

    const logMessage = isReassignment
      ? `Order ${orderNumber} reassigned to ${procurementOfficerUser.firstName} ${procurementOfficerUser.lastName} by admin ${admin.firstName} ${admin.lastName}`
      : `Order ${orderNumber} assigned to ${procurementOfficerUser.firstName} ${procurementOfficerUser.lastName} by admin ${admin.firstName} ${admin.lastName}`;

    this.logger.log(logMessage);

    return {
      success: true,
      message: isReassignment
        ? 'Order reassigned successfully'
        : 'Order assigned successfully',
      data: {
        orderNumber: updatedOrder.orderNumber,
        status: assignmentStatus,
        procurementOfficerName: `${procurementOfficerUser.firstName} ${procurementOfficerUser.lastName}`,
        assignedAt: updatedOrder.assignedAt!,
        assignmentNotes: updatedOrder.assignmentNotes || undefined,
      },
    };
  }

  /**
   * Procurement officer responds to assignment
   */
  async respondToAssignment(
    orderNumber: string,
    responseDto: AssignmentResponseDto,
    userId: string,
  ): Promise<AssignmentStatusDto> {
    // Verify user is procurement officer
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, firstName: true, lastName: true },
    });

    if (!user || user.role !== UserRole.PROCUREMENT_OFFICER) {
      throw new ForbiddenException(
        'Only procurement officers can respond to assignments',
      );
    }

    // Find the order
    const order = await this.prismaService.order.findUnique({
      where: { orderNumber },
      include: {
        assignedProcurementOfficer: {
          select: { firstName: true, lastName: true, id: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Verify this officer is assigned to the order
    if (order.assignedProcurementOfficerId !== userId) {
      throw new ForbiddenException('You are not assigned to this order');
    }

    // Verify assignment is pending or reassigned
    if (
      order.assignmentStatus !== AssignmentStatus.PENDING_ACCEPTANCE &&
      order.assignmentStatus !== AssignmentStatus.REASSIGNED
    ) {
      throw new BadRequestException('Assignment has already been responded to');
    }

    const newAssignmentStatus =
      responseDto.response === AssignmentResponseType.ACCEPT
        ? AssignmentStatus.ACCEPTED
        : AssignmentStatus.REJECTED;

    // Only change order status to ASSIGNED when officer accepts
    const newOrderStatus =
      responseDto.response === AssignmentResponseType.ACCEPT
        ? OrderStatus.ASSIGNED // Officer accepted - now actively assigned
        : order.status; // Keep current status (CONFIRMED) if rejected

    // If rejecting, clear assignment
    const updateData: any = {
      assignmentStatus: newAssignmentStatus,
      assignmentRespondedAt: new Date(),
      assignmentResponseReason: responseDto.reason,
      status: newOrderStatus,
    };

    if (responseDto.response === AssignmentResponseType.REJECT) {
      updateData.assignedProcurementOfficerId = null;
      updateData.assignmentStatus = AssignmentStatus.REJECTED;
      // Order status stays CONFIRMED for reassignment
    }

    const updatedOrder = await this.prismaService.order.update({
      where: { orderNumber },
      data: updateData,
    });

    this.logger.log(
      `Order ${orderNumber} ${responseDto.response.toLowerCase()}ed by ${user.firstName} ${user.lastName}`,
    );

    // If officer rejected the assignment, trigger automatic reassignment
    if (responseDto.response === AssignmentResponseType.REJECT) {
      try {
        this.logger.log(
          `Triggering automatic reassignment for rejected order ${orderNumber}`,
        );

        // Use setTimeout to ensure response is sent first, then trigger reassignment asynchronously
        setTimeout(async () => {
          try {
            await this.autoReassignAfterRejection(orderNumber, userId);
          } catch (reassignError) {
            this.logger.error(
              `Failed to auto-reassign order ${orderNumber} after rejection: ${reassignError.message}`,
              reassignError.stack,
            );
          }
        }, 100); // Small delay to ensure response is sent
      } catch (error) {
        // Log but don't fail the response - rejection should still be recorded
        this.logger.warn(
          `Auto-reassignment scheduling failed for order ${orderNumber}: ${error.message}`,
        );
      }
    }

    return {
      success: true,
      message: `Assignment ${responseDto.response.toLowerCase()}ed successfully`,
      data: {
        orderNumber: updatedOrder.orderNumber,
        status: newAssignmentStatus,
        procurementOfficerName: `${user.firstName} ${user.lastName}`,
        assignedAt: updatedOrder.assignedAt!,
        respondedAt: updatedOrder.assignmentRespondedAt!,
        assignmentNotes: updatedOrder.assignmentNotes || undefined,
        responseReason: updatedOrder.assignmentResponseReason || undefined,
      },
    };
  }

  /**
   * Auto-reassign order after rejection with proper checks
   */
  private async autoReassignAfterRejection(
    orderNumber: string,
    rejectedByUserId: string,
  ): Promise<void> {
    try {
      // Check if auto-assignment is enabled
      const autoAssignEnabled =
        this.configService.get('AUTO_ASSIGN_ENABLED', 'true') === 'true';
      if (!autoAssignEnabled) {
        this.logger.log(`Auto-reassignment disabled for order ${orderNumber}`);
        return;
      }

      // Check if auto-reassignment after rejection is enabled
      const autoReassignEnabled =
        this.configService.get('AUTO_REASSIGN_AFTER_REJECTION', 'true') ===
        'true';
      if (!autoReassignEnabled) {
        this.logger.log(
          `Auto-reassignment after rejection disabled for order ${orderNumber}`,
        );
        return;
      }

      // Get maximum reassignment attempts
      const maxReassignAttempts = parseInt(
        this.configService.get('MAX_REASSIGN_ATTEMPTS', '3'),
      );

      // Get the current state of the order to ensure it's still rejected
      const order = await this.prismaService.order.findUnique({
        where: { orderNumber },
        include: {
          payments: { where: { status: PaymentStatus.COMPLETED } },
        },
      });

      if (!order) {
        this.logger.warn(
          `Order ${orderNumber} not found during auto-reassignment`,
        );
        return;
      }

      // Count previous rejections by checking assignment notes
      // This is a simple approach - in production, you might want a dedicated assignment history table
      const assignmentNotesHistory = order.assignmentNotes || '';
      const rejectionMatches = assignmentNotesHistory.match(
        /Auto-reassigned after rejection/g,
      );
      const rejectionCount = rejectionMatches ? rejectionMatches.length : 0;

      if (rejectionCount >= maxReassignAttempts) {
        this.logger.warn(
          `Order ${orderNumber} has reached maximum reassignment attempts (${maxReassignAttempts}). Manual intervention required.`,
        );
        // Mark order for manual intervention
        await this.prismaService.order.update({
          where: { orderNumber },
          data: {
            assignmentNotes: `${assignmentNotesHistory} | Maximum auto-reassignment attempts reached (${rejectionCount + 1}). Manual assignment required.`,
          },
        });
        return;
      }

      // Safety checks before reassignment
      if (order.assignmentStatus !== AssignmentStatus.REJECTED) {
        this.logger.log(
          `Order ${orderNumber} is no longer in rejected status, skipping auto-reassignment`,
        );
        return;
      }

      if (order.assignedProcurementOfficerId !== null) {
        this.logger.log(
          `Order ${orderNumber} has been manually reassigned, skipping auto-reassignment`,
        );
        return;
      }

      if (order.status !== OrderStatus.CONFIRMED) {
        this.logger.log(
          `Order ${orderNumber} is not in confirmed status, skipping auto-reassignment`,
        );
        return;
      }

      if (order.payments.length === 0) {
        this.logger.log(
          `Order ${orderNumber} is not paid, skipping auto-reassignment`,
        );
        return;
      }

      // Find an available officer (excluding the one who rejected)
      const availableOfficer =
        await this.findMostAvailableOfficer(rejectedByUserId);

      if (!availableOfficer) {
        this.logger.warn(
          `No available procurement officers for auto-reassignment of order ${orderNumber}`,
        );
        return;
      }

      // Auto-reassign the order
      const updatedOrder = await this.prismaService.order.update({
        where: { orderNumber },
        data: {
          assignedProcurementOfficerId: availableOfficer.userId,
          assignmentStatus: AssignmentStatus.REASSIGNED,
          assignedAt: new Date(),
          assignmentNotes: `${order.assignmentNotes || ''} | Auto-reassigned after rejection (attempt ${rejectionCount + 1}/${maxReassignAttempts})`,
          assignmentRespondedAt: null,
          assignmentResponseReason: null,
        },
      });

      this.logger.log(
        `Order ${orderNumber} auto-reassigned to ${availableOfficer.user.firstName} ${availableOfficer.user.lastName} after rejection (${availableOfficer.activeOrdersCount} active orders)`,
      );

      // Optional: Send notification to the new officer about the reassignment
      // You can implement this based on your notification system
    } catch (error) {
      this.logger.error(
        `Critical error in auto-reassignment for order ${orderNumber}: ${error.message}`,
        error.stack,
      );
      // Don't throw error to avoid affecting the main flow
    }
  }

  /**
   * Get assignment status for an order
   */
  async getAssignmentStatus(
    orderNumber: string,
    userId: string,
  ): Promise<AssignmentStatusDto> {
    // Get user and their role
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const order = await this.prismaService.order.findUnique({
      where: { orderNumber },
      include: {
        assignedProcurementOfficer: {
          select: { firstName: true, lastName: true, id: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check permissions
    if (user.role === UserRole.PROCUREMENT_OFFICER) {
      if (order.assignedProcurementOfficerId !== userId) {
        throw new ForbiddenException(
          'You can only view assignment status for orders assigned to you',
        );
      }
    }

    if (!order.assignedProcurementOfficer) {
      throw new BadRequestException(
        'Order has not been assigned to any procurement officer',
      );
    }

    return {
      success: true,
      message: 'Assignment status retrieved successfully',
      data: {
        orderNumber: order.orderNumber,
        status: order.assignmentStatus || AssignmentStatus.UNASSIGNED,
        procurementOfficerName: `${order.assignedProcurementOfficer.firstName} ${order.assignedProcurementOfficer.lastName}`,
        assignedAt: order.assignedAt!,
        respondedAt: order.assignmentRespondedAt || undefined,
        assignmentNotes: order.assignmentNotes || undefined,
        responseReason: order.assignmentResponseReason || undefined,
      },
    };
  }

  /**
   * Update procurement officer availability status (Officer only)
   */
  async updateOfficerAvailability(
    userId: string,
    updateDto: UpdateAvailabilityDto,
  ): Promise<AvailabilityStatusDto> {
    // Verify user is procurement officer
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user || user.role !== UserRole.PROCUREMENT_OFFICER) {
      throw new ForbiddenException(
        'Only procurement officers can update their availability',
      );
    }

    // Find the officer profile
    const officerProfile =
      await this.prismaService.procurementOfficerProfile.findUnique({
        where: { userId },
      });

    if (!officerProfile) {
      throw new NotFoundException('Procurement officer profile not found');
    }

    // Update availability
    const updatedProfile =
      await this.prismaService.procurementOfficerProfile.update({
        where: { userId },
        data: {
          availabilityStatus: updateDto.availabilityStatus,
          maxActiveOrders:
            updateDto.maxActiveOrders || officerProfile.maxActiveOrders,
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              assignedOrders: {
                where: {
                  status: {
                    in: [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS],
                  },
                  assignmentStatus: {
                    in: [
                      AssignmentStatus.PENDING_ACCEPTANCE,
                      AssignmentStatus.ACCEPTED,
                    ],
                  },
                },
                select: { id: true },
              },
            },
          },
        },
      });

    this.logger.log(
      `Procurement officer ${updatedProfile.user.firstName} ${updatedProfile.user.lastName} updated availability to ${updateDto.availabilityStatus}`,
    );

    return {
      officerId: updatedProfile.id,
      officerName: `${updatedProfile.user.firstName} ${updatedProfile.user.lastName}`,
      availabilityStatus: updatedProfile.availabilityStatus,
      activeOrdersCount: updatedProfile.user.assignedOrders.length,
      maxActiveOrders: updatedProfile.maxActiveOrders,
      updatedAt: updatedProfile.updatedAt,
    };
  }

  /**
   * Get procurement officer availability status
   */
  async getOfficerAvailability(userId: string) {
    // Get the officer profile
    const officerProfile =
      await this.prismaService.procurementOfficerProfile.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

    if (!officerProfile) {
      throw new NotFoundException('Procurement officer profile not found');
    }

    // Get active orders count separately
    const activeOrdersCount = await this.prismaService.order.count({
      where: {
        assignedProcurementOfficerId: userId,
        status: {
          in: [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS],
        },
        assignmentStatus: {
          in: [AssignmentStatus.PENDING_ACCEPTANCE, AssignmentStatus.ACCEPTED],
        },
      },
    });

    if (!officerProfile) {
      throw new NotFoundException('Procurement officer profile not found');
    }

    return {
      success: true,
      message: 'Officer availability retrieved successfully',
      data: {
        officerId: officerProfile.id,
        officerName: `${officerProfile.user.firstName} ${officerProfile.user.lastName}`,
        availabilityStatus: officerProfile.availabilityStatus,
        activeOrdersCount: activeOrdersCount,
        maxActiveOrders: officerProfile.maxActiveOrders,
        updatedAt: officerProfile.updatedAt,
      },
    };
  }

  /**
   * Get all procurement officers availability status (Admin only)
   */
  async getAllOfficersAvailability() {
    const officerProfiles =
      await this.prismaService.procurementOfficerProfile.findMany({
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

    // Get active and pending orders count for each officer
    const officersWithCounts = await Promise.all(
      officerProfiles.map(async (profile) => {
        const [activeOrdersCount, pendingOrdersCount] = await Promise.all([
          this.prismaService.order.count({
            where: {
              assignedProcurementOfficerId: profile.userId,
              assignmentStatus: AssignmentStatus.ACCEPTED,
              status: {
                in: [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS],
              },
            },
          }),
          this.prismaService.order.count({
            where: {
              assignedProcurementOfficerId: profile.userId,
              assignmentStatus: {
                in: [
                  AssignmentStatus.PENDING_ACCEPTANCE,
                  AssignmentStatus.REASSIGNED,
                ],
              },
            },
          }),
        ]);

        return {
          userId: profile.userId,
          officerId: profile.id,
          officerName: `${profile.user.firstName} ${profile.user.lastName}`,
          availabilityStatus: profile.availabilityStatus,
          activeOrdersCount: activeOrdersCount,
          pendingOrdersCount: pendingOrdersCount,
          maxActiveOrders: profile.maxActiveOrders,
          updatedAt: profile.updatedAt,
        };
      }),
    );

    return {
      success: true,
      message: 'All officers availability retrieved successfully',
      data: officersWithCounts,
    };
  }

  /**
   * Get order statistics by status (Admin and Procurement Officer access)
   */
  async getOrderStats(userId: string) {
    // Get user and their role
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userRole = user.role;
    const where: any = {};

    // Apply role-based filtering
    if (userRole === UserRole.WHOLESALER) {
      // Find the wholesaler profile for this user
      const wholesalerProfile = await this.prismaService.wholesaler.findUnique({
        where: { userId: userId },
      });

      if (!wholesalerProfile) {
        throw new NotFoundException('Wholesaler profile not found for user');
      }

      where.wholesalerId = wholesalerProfile.id;
    } else if (userRole === UserRole.PROCUREMENT_OFFICER) {
      // Procurement officers can see orders assigned to them
      where.assignedProcurementOfficerId = userId;
    }

    // Get counts for each order status
    const statusCounts = await Promise.all([
      this.prismaService.order.count({
        where: { ...where, status: OrderStatus.DRAFT },
      }),
      this.prismaService.order.count({
        where: { ...where, status: OrderStatus.CONFIRMED },
      }),
      this.prismaService.order.count({
        where: { ...where, status: OrderStatus.ASSIGNED },
      }),
      this.prismaService.order.count({
        where: { ...where, status: OrderStatus.IN_PROGRESS },
      }),
      this.prismaService.order.count({
        where: { ...where, status: OrderStatus.COMPLETED },
      }),
      this.prismaService.order.count({
        where: { ...where, status: OrderStatus.CANCELLED },
      }),
    ]);

    // Get total revenue from completed orders
    const completedOrdersRevenue = await this.prismaService.order.aggregate({
      where: { ...where, status: OrderStatus.COMPLETED },
      _sum: {
        totalAmount: true,
      },
    });

    const [
      draftCount,
      confirmedCount,
      assignedCount,
      inProgressCount,
      completedCount,
      cancelledCount,
    ] = statusCounts;

    const totalOrders = statusCounts.reduce((sum, count) => sum + count, 0);
    const totalRevenue = Number(completedOrdersRevenue._sum.totalAmount) || 0;

    // Calculate percentages
    const calculatePercentage = (count: number) =>
      totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;

    return {
      success: true,
      message: 'Order statistics retrieved successfully',
      data: {
        totalOrders,
        totalRevenue, // Total money from completed orders
        statusBreakdown: {
          draft: draftCount,
          confirmed: confirmedCount,
          assigned: assignedCount,
          inProgress: inProgressCount,
          completed: completedCount,
          cancelled: cancelledCount,
        },
        summary: {
          activeOrders: confirmedCount + assignedCount + inProgressCount,
          completedOrders: completedCount,
          cancelledOrders: cancelledCount,
          totalRevenue, // Also include in summary
        },
      },
    };
  }

  /**
   * Cancel order (Draft orders for wholesalers, any status for admins)
   */
  async cancelOrder(
    orderNumber: string,
    userId: string,
  ): Promise<{ success: boolean; message: string; data: any }> {
    // Get user and their role
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, firstName: true, lastName: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Find the order with its items
    const order = await this.prismaService.order.findFirst({
      where: { orderNumber },
      include: {
        items: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            status: true,
          },
        },
        wholesaler: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderNumber} not found`);
    }

    // Check permissions
    const isWholesaler = user.role === UserRole.WHOLESALER;
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    const isProcurementOfficer = user.role === UserRole.PROCUREMENT_OFFICER;

    if (isWholesaler) {
      // Wholesaler can only cancel DRAFT orders and only their own orders
      if (order.status !== OrderStatus.DRAFT) {
        throw new ForbiddenException(
          'Wholesalers can only cancel draft orders',
        );
      }

      if (order.wholesaler.userId !== userId) {
        throw new ForbiddenException('You can only cancel your own orders');
      }
    } else if (!isAdmin && !isProcurementOfficer) {
      throw new ForbiddenException('Insufficient permissions to cancel orders');
    }

    // Check if order is already cancelled
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Order is already cancelled');
    }

    try {
      await this.prismaService.$transaction(async (tx) => {
        // Cancel Monnify invoice if it's a draft order with invoice
        if (order.status === OrderStatus.DRAFT && order.monnifyInvoiceRef) {
          const cancelled =
            await this.monnifyService.cancelInvoice(orderNumber);
          if (cancelled) {
            this.logger.log(
              `Monnify invoice cancelled for order ${orderNumber}`,
            );
          } else {
            this.logger.warn(
              `Failed to cancel Monnify invoice for order ${orderNumber}`,
            );
          }
        }

        // Release inventory back to products
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              quantity: {
                increment: item.quantity,
              },
            },
          });
        }

        // Update all order items to CANCELLED status
        await tx.orderItem.updateMany({
          where: { orderId: order.id },
          data: {
            status: OrderItemStatus.CANCELLED,
            statusUpdatedAt: new Date(),
            statusUpdatedBy: userId,
          },
        });

        // Update order status to CANCELLED and remove assignment
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CANCELLED,
            assignedProcurementOfficerId: null, // Remove assignment
            updatedAt: new Date(),
          },
        });
      });

      // Create comprehensive audit log for cancellation
      const auditLog = {
        orderNumber,
        cancelledBy: `${user.firstName} ${user.lastName} (${user.role})`,
        timestamp: new Date().toISOString(),
        originalStatus: order.status,
        changes: {
          statusChange: {
            from: order.status,
            to: OrderStatus.CANCELLED,
          },
          inventoryReleased: order.items.map((item) => ({
            productId: item.productId,
            quantityReleased: item.quantity,
            itemStatus: { from: item.status, to: OrderItemStatus.CANCELLED },
          })),
          monnifyInvoice:
            order.status === OrderStatus.DRAFT && order.monnifyInvoiceRef
              ? {
                  action: 'CANCELLED',
                  invoiceRef: order.monnifyInvoiceRef,
                }
              : null,
          assignmentChange: order.assignedProcurementOfficerId
            ? {
                action: 'UNASSIGNED',
                previousAssignment: order.assignedProcurementOfficerId,
              }
            : null,
        },
      };

      this.logger.log(
        `Order ${orderNumber} cancelled - Field-level audit:`,
        JSON.stringify(auditLog, null, 2),
      );

      return {
        success: true,
        message: 'Order cancelled successfully',
        data: {
          orderNumber,
          audit: auditLog,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to cancel order ${orderNumber}:`,
        error.message,
      );
      throw new BadRequestException(`Failed to cancel order: ${error.message}`);
    }
  }

  /**
   * Update order (Admin only - comprehensive editing)
   */
  async updateOrder(
    orderNumber: string,
    updateOrderDto: any,
    userId: string,
  ): Promise<{ success: boolean; message: string; data: any }> {
    // Check admin permissions
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, firstName: true, lastName: true },
    });

    if (
      !user ||
      (user.role !== UserRole.ADMIN &&
        user.role !== UserRole.SUPER_ADMIN &&
        user.role !== UserRole.PROCUREMENT_OFFICER)
    ) {
      throw new ForbiddenException(
        'Only admins and procurement officers can update orders',
      );
    }

    // Find the order with its current items
    const order = await this.prismaService.order.findFirst({
      where: { orderNumber },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, price: true, quantity: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderNumber} not found`);
    }

    try {
      let recalculateNeeded = false;
      const inventoryAdjustments: {
        productId: string;
        quantityDelta: number;
      }[] = [];

      const result = await this.prismaService.$transaction(async (tx) => {
        // Handle item updates if provided
        if (updateOrderDto.items && Array.isArray(updateOrderDto.items)) {
          recalculateNeeded = true;

          for (const itemUpdate of updateOrderDto.items) {
            if (itemUpdate.action === 'UPDATE' && itemUpdate.itemId) {
              // Update existing item quantity
              const existingItem = order.items.find(
                (item) => item.id === itemUpdate.itemId,
              );
              if (existingItem && itemUpdate.quantity !== undefined) {
                const quantityDelta =
                  itemUpdate.quantity - existingItem.quantity;

                // Validate inventory availability for increases
                if (quantityDelta > 0) {
                  const product = existingItem.product;
                  // Check both available quantity and prevent negative inventory
                  const resultingQuantity = product.quantity - quantityDelta;
                  if (
                    product.quantity < quantityDelta ||
                    resultingQuantity < 0
                  ) {
                    throw new BadRequestException(
                      `Insufficient inventory for ${product.name}. Available: ${product.quantity}, Required: ${quantityDelta}, Would result in: ${resultingQuantity}`,
                    );
                  }
                }

                // Update item quantity and recalculate line total
                const currentPrice =
                  existingItem.product.price || existingItem.unitPrice;
                await tx.orderItem.update({
                  where: { id: itemUpdate.itemId },
                  data: {
                    quantity: itemUpdate.quantity,
                    lineTotal: itemUpdate.quantity * Number(currentPrice),
                  },
                });

                // Track inventory adjustment
                if (quantityDelta !== 0) {
                  inventoryAdjustments.push({
                    productId: existingItem.productId,
                    quantityDelta: -quantityDelta, // negative because we're adjusting reserved inventory
                  });
                }
              }
            } else if (itemUpdate.action === 'ADD' && itemUpdate.productId) {
              // Add new item to order
              const product = await tx.product.findUnique({
                where: { id: itemUpdate.productId },
                select: {
                  id: true,
                  name: true,
                  price: true,
                  quantity: true,
                  status: true,
                },
              });

              if (!product) {
                throw new BadRequestException(
                  `Product ${itemUpdate.productId} not found`,
                );
              }

              if (product.status !== 'LIVE') {
                throw new BadRequestException(
                  `Product ${product.name} is not available for ordering`,
                );
              }

              // Prevent negative inventory
              const resultingQuantity = product.quantity - itemUpdate.quantity;
              if (
                product.quantity < itemUpdate.quantity ||
                resultingQuantity < 0
              ) {
                throw new BadRequestException(
                  `Insufficient inventory for ${product.name}. Available: ${product.quantity}, Required: ${itemUpdate.quantity}, Would result in: ${resultingQuantity}`,
                );
              }

              const currentPrice = product.price || 0;
              await tx.orderItem.create({
                data: {
                  orderId: order.id,
                  productId: itemUpdate.productId,
                  quantity: itemUpdate.quantity,
                  unitPrice: currentPrice,
                  lineTotal: itemUpdate.quantity * Number(currentPrice),
                  status: OrderItemStatus.PENDING,
                  statusUpdatedBy: userId,
                },
              });

              // Reserve inventory for new item
              inventoryAdjustments.push({
                productId: itemUpdate.productId,
                quantityDelta: -itemUpdate.quantity,
              });
            } else if (itemUpdate.action === 'REMOVE' && itemUpdate.itemId) {
              // Remove item from order
              const existingItem = order.items.find(
                (item) => item.id === itemUpdate.itemId,
              );
              if (existingItem) {
                await tx.orderItem.delete({
                  where: { id: itemUpdate.itemId },
                });

                // Release reserved inventory
                inventoryAdjustments.push({
                  productId: existingItem.productId,
                  quantityDelta: existingItem.quantity,
                });
              }
            }
          }
        }

        // Apply inventory adjustments
        for (const adjustment of inventoryAdjustments) {
          await tx.product.update({
            where: { id: adjustment.productId },
            data: {
              quantity: {
                increment: adjustment.quantityDelta,
              },
            },
          });
        }

        // Recalculate order totals if items were modified
        let updatedOrder = order;
        if (recalculateNeeded) {
          // Get updated items to recalculate totals
          const updatedItems = await tx.orderItem.findMany({
            where: { orderId: order.id },
          });

          const newSubtotal = updatedItems.reduce(
            (sum, item) => sum + Number(item.lineTotal),
            0,
          );
          const newTotalAmount = newSubtotal; // Add any additional fees/taxes here if needed

          updatedOrder = await tx.order.update({
            where: { id: order.id },
            data: {
              subtotal: newSubtotal,
              totalAmount: newTotalAmount,
              updatedAt: new Date(),
            },
            include: {
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      price: true,
                      quantity: true,
                    },
                  },
                },
              },
            },
          });
        }

        // Update other order fields (status, delivery address, notes, etc.)
        const { items, ...otherUpdates } = updateOrderDto;
        if (Object.keys(otherUpdates).length > 0) {
          // Handle status-specific timestamp updates
          const statusUpdateData: any = { ...otherUpdates };
          if (otherUpdates.status) {
            switch (otherUpdates.status) {
              case OrderStatus.CONFIRMED:
                statusUpdateData.confirmedAt = new Date();
                break;
              case OrderStatus.ASSIGNED:
                statusUpdateData.assignedAt = new Date();
                break;
              case OrderStatus.COMPLETED:
                statusUpdateData.completedAt = new Date();
                break;
            }
          }

          updatedOrder = await tx.order.update({
            where: { id: order.id },
            data: {
              ...statusUpdateData,
              updatedAt: new Date(),
            },
            include: {
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      price: true,
                      quantity: true,
                    },
                  },
                },
              },
            },
          });
        }

        return updatedOrder;
      });

      // Create comprehensive audit log of changes
      const auditLog = {
        orderNumber,
        updatedBy: `${user.firstName} ${user.lastName} (${user.role})`,
        timestamp: new Date().toISOString(),
        changes: {
          itemModifications: updateOrderDto.items
            ? {
                totalItemChanges: updateOrderDto.items.length,
                actions: updateOrderDto.items.map((item) => ({
                  action: item.action,
                  itemId: item.itemId || 'new',
                  productId: item.productId,
                  quantity: item.quantity,
                })),
              }
            : null,
          fieldUpdates:
            Object.keys(updateOrderDto).filter((key) => key !== 'items')
              .length > 0
              ? Object.keys(updateOrderDto)
                  .filter((key) => key !== 'items')
                  .reduce((changes, key) => {
                    changes[key] = { newValue: updateOrderDto[key] };
                    return changes;
                  }, {})
              : null,
          inventoryAdjustments:
            inventoryAdjustments.length > 0
              ? inventoryAdjustments.map((adj) => ({
                  productId: adj.productId,
                  quantityChange: adj.quantityDelta,
                  action: adj.quantityDelta > 0 ? 'RELEASED' : 'RESERVED',
                }))
              : null,
          totalsRecalculated: recalculateNeeded,
        },
      };

      this.logger.log(
        `Order ${orderNumber} updated - Field-level audit:`,
        JSON.stringify(auditLog, null, 2),
      );

      return {
        success: true,
        message: 'Order updated successfully',
        data: {
          order: result,
          audit: auditLog,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to update order ${orderNumber}:`,
        error.message,
      );
      throw new BadRequestException(`Failed to update order: ${error.message}`);
    }
  }

  /**
   * Reserve inventory for order items
   * Reduces product quantities when order is created
   */
  private async reserveInventoryForOrder(
    orderItems: { productId: string; quantity: number }[],
  ): Promise<void> {
    for (const item of orderItems) {
      await this.prismaService.product.update({
        where: { id: item.productId },
        data: {
          quantity: {
            decrement: item.quantity,
          },
        },
      });

      this.logger.debug(
        `Reserved ${item.quantity} units for product ${item.productId}`,
      );
    }
  }

  /**
   * Release inventory for order items
   * Restores product quantities when order is cancelled
   */
  private async releaseInventoryForOrder(
    orderItems: { productId: string; quantity: number }[],
  ): Promise<void> {
    for (const item of orderItems) {
      await this.prismaService.product.update({
        where: { id: item.productId },
        data: {
          quantity: {
            increment: item.quantity,
          },
        },
      });

      this.logger.debug(
        `Released ${item.quantity} units for product ${item.productId}`,
      );
    }
  }
}
