import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePackSizeDto, UpdatePackSizeDto } from './dto';
import { PackSizeStatus } from '../../common/enums';

@Injectable()
export class PackSizeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPackSizeDto: CreatePackSizeDto, userId: string) {
    const { name, variantId } = createPackSizeDto;

    // Check if variant exists
    const variant = await this.prisma.variant.findUnique({
      where: { id: variantId },
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    // Check if pack size name already exists for this variant
    const existingPackSize = await this.prisma.packSize.findUnique({
      where: {
        variantId_name: {
          variantId,
          name: name.trim(),
        },
      },
    });

    if (existingPackSize) {
      throw new BadRequestException(
        `Pack size "${name}" already exists for this variant`,
      );
    }

    return this.prisma.packSize.create({
      data: {
        name: name.trim(),
        variantId,
        createdBy: userId,
        updatedBy: userId,
      },
      include: {
        variant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findAll(query?: {
    variantId?: string;
    sortBy?: 'name' | 'createdAt' | 'updatedAt';
    sortOrder?: 'asc' | 'desc';
  }) {
    const { variantId, sortBy = 'createdAt', sortOrder = 'desc' } = query || {};

    const where: any = {
      status: PackSizeStatus.ACTIVE,
      deletedAt: null,
    };

    if (variantId) {
      where.variantId = variantId;
    }

    return this.prisma.packSize.findMany({
      where,
      include: {
        variant: {
          select: {
            id: true,
            name: true,
            brand: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
    });
  }

  async findOne(id: string) {
    const packSize = await this.prisma.packSize.findUnique({
      where: { id },
      include: {
        variant: {
          select: {
            id: true,
            name: true,
            brand: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!packSize) {
      throw new NotFoundException('Pack size not found');
    }

    return packSize;
  }

  async update(
    id: string,
    updatePackSizeDto: UpdatePackSizeDto,
    userId: string,
  ) {
    const packSize = await this.findOne(id);

    if (packSize.status === PackSizeStatus.ARCHIVED) {
      throw new BadRequestException('Cannot update archived pack size');
    }

    const { name } = updatePackSizeDto;

    // Check if name will change (affects product names and SKUs)
    const willAffectProducts = name && name.trim() !== packSize.name;

    // If name is being updated, check for uniqueness
    if (name && name !== packSize.name) {
      const existingPackSize = await this.prisma.packSize.findUnique({
        where: {
          variantId_name: {
            variantId: packSize.variantId,
            name: name.trim(),
          },
        },
      });

      if (existingPackSize && existingPackSize.id !== id) {
        throw new BadRequestException(
          `Pack size "${name}" already exists for this variant`,
        );
      }
    }

    // Use transaction if pack size name changes to update products
    return this.prisma.$transaction(async (tx) => {
      const updatedPackSize = await tx.packSize.update({
        where: { id },
        data: {
          ...updatePackSizeDto,
          name: name ? name.trim() : undefined,
          updatedBy: userId,
        },
        include: {
          variant: {
            select: {
              id: true,
              name: true,
              brand: { select: { name: true } },
            },
          },
        },
      });

      // If pack size name changed, update all linked product names and SKUs
      if (willAffectProducts) {
        const linkedProducts = await tx.product.findMany({
          where: {
            packSizeId: id,
            deletedAt: null,
          },
          select: {
            id: true,
            brand: { select: { name: true } },
            variant: { select: { name: true } },
            packType: { select: { name: true } },
          },
        });

        // Update each product's name and SKU
        for (const product of linkedProducts) {
          const newName = `${product.brand.name} ${product.variant.name} ${updatedPackSize.name} (${product.packType.name})`;
          const newSku = `${product.brand.name.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-${product.variant.name.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-${updatedPackSize.name.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-${product.packType.name.toUpperCase().replace(/[^A-Z0-9]/g, '-')}`;

          await tx.product.update({
            where: { id: product.id },
            data: {
              name: newName,
              sku: newSku,
              updatedBy: userId,
            },
          });
        }
      }

      return updatedPackSize;
    });
  }

  async remove(id: string, userId: string) {
    const packSize = await this.findOne(id);

    // Check if any LIVE products are using this pack size
    const liveProducts = await this.prisma.product.findMany({
      where: {
        packSizeId: id,
        status: 'LIVE',
        deletedAt: null,
      },
    });

    if (liveProducts.length > 0) {
      throw new BadRequestException(
        `Cannot delete pack size. ${liveProducts.length} live product(s) are using it. Please delete or archive the products first.`,
      );
    }

    // Soft delete by setting status to ARCHIVED
    return this.prisma.packSize.update({
      where: { id },
      data: {
        status: PackSizeStatus.ARCHIVED,
        deletedAt: new Date(),
        deletedBy: userId,
        updatedBy: userId,
      },
    });
  }

  async activate(id: string, userId: string) {
    const packSize = await this.findOne(id);

    if (packSize.status === PackSizeStatus.ACTIVE) {
      throw new BadRequestException('Pack size is already active');
    }

    return this.prisma.packSize.update({
      where: { id },
      data: {
        status: PackSizeStatus.ACTIVE,
        deletedAt: null,
        deletedBy: null,
        updatedBy: userId,
      },
    });
  }

  async findByVariant(variantId: string) {
    return this.prisma.packSize.findMany({
      where: {
        variantId,
        status: PackSizeStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }
}
