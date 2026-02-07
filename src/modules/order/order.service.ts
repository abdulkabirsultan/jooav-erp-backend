import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { Prisma, OrderStatus, ItemStatus } from '@prisma/client';

@Injectable()
export class OrderService {
  constructor(private prisma: PrismaService) {}

  async createOrder(
    createOrderDto: CreateOrderDto,
    wholesalerId: string,
    createdById: string,
  ): Promise<OrderResponseDto> {
    // Validate wholesaler exists
    if (!wholesalerId) {
      throw new BadRequestException('Wholesaler ID is required');
    }

    const wholesaler = await this.prisma.wholesaler.findUnique({
      where: { id: wholesalerId },
    });

    if (!wholesaler) {
      throw new NotFoundException('Wholesaler not found');
    }
    // Validate minimum quantities
    for (const item of createOrderDto.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException(
          `Quantity must be a positive integer for product ${item.productId}`,
        );
      }
      if (item.quantity < 10) {
        throw new BadRequestException(
          `Minimum order quantity is 10 for each product`,
        );
      }
    }

    // Generate order number
    const orderNumber = await this.generateOrderNumber();

    // Get product details and calculate totals
    const { orderItems, subtotal } = await this.calculateOrderTotals(
      createOrderDto.items,
    );

    // Create order in transaction
    const order = await this.prisma.$transaction(async (prisma) => {
      const newOrder = await prisma.order.create({
        data: {
          orderNumber,
          wholesalerId,
          createdById,
          status: OrderStatus.DRAFT,
          subtotal,
          totalAmount: subtotal,
          deliveryAddress:
            (createOrderDto.deliveryAddress as unknown) ?? undefined,
          customerNotes: createOrderDto.customerNotes,
          orderDate: new Date(),
          items: {
            create: orderItems,
          },
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          wholesaler: true,
        },
      });

      return newOrder;
    });

    return this.formatOrderResponse(order);
  }

  async submitOrder(
    orderId: string,
    wholesalerId: string,
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        wholesalerId,
        status: OrderStatus.DRAFT,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found or cannot be submitted');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.SUBMITTED,
        submittedAt: new Date(),
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        wholesaler: true,
        assignedProcurementOfficer: {
          include: {
            user: true,
          },
        },
      },
    });

    return this.formatOrderResponse(updatedOrder);
  }

  async confirmOrder(orderId: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.SUBMITTED) {
      throw new BadRequestException('Only submitted orders can be confirmed');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        wholesaler: true,
        assignedProcurementOfficer: {
          include: {
            user: true,
          },
        },
      },
    });

    return this.formatOrderResponse(updatedOrder);
  }

  async assignProcurementOfficer(
    orderId: string,
    procurementOfficerId: string,
  ): Promise<OrderResponseDto> {
    // Verify procurement officer exists
    const procurementOfficer =
      await this.prisma.procurementOfficerProfile.findUnique({
        where: { id: procurementOfficerId },
      });

    if (!procurementOfficer) {
      throw new NotFoundException('Procurement officer not found');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed orders can be assigned');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.ASSIGNED,
        assignedProcurementOfficerId: procurementOfficerId,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        wholesaler: true,
        assignedProcurementOfficer: {
          include: {
            user: true,
          },
        },
      },
    });

    return this.formatOrderResponse(updatedOrder);
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    procurementOfficerId?: string,
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // If procurement officer is specified, verify they're assigned to this order
    if (
      procurementOfficerId &&
      order.assignedProcurementOfficerId !== procurementOfficerId
    ) {
      throw new ForbiddenException('You are not assigned to this order');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        wholesaler: true,
        assignedProcurementOfficer: {
          include: {
            user: true,
          },
        },
      },
    });

    return this.formatOrderResponse(updatedOrder);
  }

  async getOrder(
    orderId: string,
    wholesalerId?: string,
  ): Promise<OrderResponseDto> {
    const whereCondition: any = { id: orderId };
    if (wholesalerId) {
      whereCondition.wholesalerId = wholesalerId;
    }

    const order = await this.prisma.order.findFirst({
      where: whereCondition,
      include: {
        items: {
          include: {
            product: true,
          },
        },
        wholesaler: true,
        assignedProcurementOfficer: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.formatOrderResponse(order);
  }

  async getOrders(
    page = 1,
    limit = 10,
    wholesalerId?: string,
    procurementOfficerId?: string,
    status?: OrderStatus,
  ) {
    // Validate pagination parameters
    if (page < 1) page = 1;
    if (limit < 1 || limit > 100) limit = 10;

    const skip = (page - 1) * limit;
    const whereCondition: any = {};

    if (wholesalerId) whereCondition.wholesalerId = wholesalerId;
    if (procurementOfficerId)
      whereCondition.assignedProcurementOfficerId = procurementOfficerId;
    if (status) whereCondition.status = status;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: whereCondition,
        include: {
          items: {
            include: {
              product: true,
            },
          },
          wholesaler: true,
          assignedProcurementOfficer: {
            include: {
              user: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where: whereCondition }),
    ]);

    return {
      data: orders.map((order) => this.formatOrderResponse(order)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Helper methods
  private async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear().toString().slice(-2);
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');

    const prefix = `ORD-${year}${month}${day}`;

    const lastOrder = await this.prisma.order.findFirst({
      where: {
        orderNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        orderNumber: 'desc',
      },
    });

    let sequence = 1;
    if (lastOrder) {
      const lastSequence = parseInt(lastOrder.orderNumber.slice(-3));
      if (!isNaN(lastSequence) && lastSequence >= 0) {
        sequence = lastSequence + 1;
      }
    }

    return `${prefix}-${sequence.toString().padStart(3, '0')}`;
  }

  private async calculateOrderTotals(items: OrderItemDto[]) {
    // Check for duplicate products
    const productIds = items.map((item) => item.productId);
    const uniqueProductIds = new Set(productIds);
    if (productIds.length !== uniqueProductIds.size) {
      throw new BadRequestException(
        'Duplicate products are not allowed in the same order',
      );
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
      },
    });

    if (products.length !== items.length) {
      throw new BadRequestException('Some products not found');
    }

    let subtotal = 0;
    const orderItems: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        throw new BadRequestException(`Product ${item.productId} not found`);
      }

      if (product.price === null || product.price === undefined) {
        throw new BadRequestException(
          `Product ${product.name || item.productId} does not have a price configured`,
        );
      }

      const unitPriceNum = Number(product.price);
      if (unitPriceNum < 0) {
        throw new BadRequestException(
          `Product ${product.name || item.productId} has invalid negative price`,
        );
      }
      if (unitPriceNum > 999999.99) {
        throw new BadRequestException(
          `Product ${product.name || item.productId} price is too high`,
        );
      }

      const lineTotal = unitPriceNum * item.quantity;
      if (lineTotal > 99999999.99) {
        throw new BadRequestException(
          `Line total for product ${product.name || item.productId} exceeds maximum allowed amount`,
        );
      }

      subtotal += lineTotal;
      if (subtotal > 99999999.99) {
        throw new BadRequestException(
          'Order total exceeds maximum allowed amount',
        );
      }

      orderItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.price,
        lineTotal,
        status: ItemStatus.PENDING,
      });
    }

    return { orderItems, subtotal };
  }

  private formatOrderResponse(order: any): OrderResponseDto {
    if (!order) {
      throw new Error('Order data is required');
    }

    return {
      id: order.id || '',
      orderNumber: order.orderNumber || '',
      wholesalerId: order.wholesalerId || '',
      wholesalerBusinessName: order.wholesaler?.businessName || 'N/A',
      status: order.status || 'DRAFT',
      assignedProcurementOfficerId: order.assignedProcurementOfficerId || null,
      procurementOfficerName:
        order.assignedProcurementOfficer?.user?.fullName || null,
      subtotal: order.subtotal,
      totalAmount: order.totalAmount,
      deliveryAddress: order.deliveryAddress,
      customerNotes: order.customerNotes,
      orderDate: order.orderDate,
      submittedAt: order.submittedAt,
      confirmedAt: order.confirmedAt,
      createdAt: order.createdAt,
      items: order.items.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product?.name || 'N/A',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        status: item.status,
      })),
    };
  }
}
