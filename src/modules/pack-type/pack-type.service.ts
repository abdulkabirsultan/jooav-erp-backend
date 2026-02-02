import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePackTypeDto, UpdatePackTypeDto } from './dto';
import { PackTypeStatus } from '../../common/enums';

@Injectable()
export class PackTypeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPackTypeDto: CreatePackTypeDto, userId: string) {
    const { name, variantId } = createPackTypeDto;

    // Check if variant exists
    const variant = await this.prisma.variant.findUnique({
      where: { id: variantId },
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    // Check if pack type name already exists for this variant
    const existingPackType = await this.prisma.packType.findUnique({
      where: {
        variantId_name: {
          variantId,
          name: name.trim(),
        },
      },
    });

    if (existingPackType) {
      throw new BadRequestException(
        `Pack type "${name}" already exists for this variant`,
      );
    }

    return this.prisma.packType.create({
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

  async findAll(variantId?: string) {
    const where: any = {
      status: PackTypeStatus.ACTIVE,
      deletedAt: null,
    };

    if (variantId) {
      where.variantId = variantId;
    }

    return this.prisma.packType.findMany({
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
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const packType = await this.prisma.packType.findUnique({
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

    if (!packType) {
      throw new NotFoundException('Pack type not found');
    }

    return packType;
  }

  async update(
    id: string,
    updatePackTypeDto: UpdatePackTypeDto,
    userId: string,
  ) {
    const packType = await this.findOne(id);

    if (packType.status === PackTypeStatus.ARCHIVED) {
      throw new BadRequestException('Cannot update archived pack type');
    }

    const { name } = updatePackTypeDto;

    // Check if name will change (affects product names and SKUs)
    const willAffectProducts = name && name.trim() !== packType.name;

    // If name is being updated, check for uniqueness
    if (name && name !== packType.name) {
      const existingPackType = await this.prisma.packType.findUnique({
        where: {
          variantId_name: {
            variantId: packType.variantId,
            name: name.trim(),
          },
        },
      });

      if (existingPackType && existingPackType.id !== id) {
        throw new BadRequestException(
          `Pack type "${name}" already exists for this variant`,
        );
      }
    }

    // Use transaction if pack type name changes to update products
    return this.prisma.$transaction(async (tx) => {
      const updatedPackType = await tx.packType.update({
        where: { id },
        data: {
          ...updatePackTypeDto,
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

      // If pack type name changed, update all linked product names and SKUs
      if (willAffectProducts) {
        const linkedProducts = await tx.product.findMany({
          where: {
            packTypeId: id,
            deletedAt: null,
          },
          select: {
            id: true,
            brand: { select: { name: true } },
            variant: { select: { name: true } },
            packSize: { select: { name: true } },
          },
        });

        // Update each product's name and SKU
        for (const product of linkedProducts) {
          const newName = `${product.brand.name} ${product.variant.name} ${product.packSize.name} (${updatedPackType.name})`;
          const newSku = `${product.brand.name.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-${product.variant.name.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-${product.packSize.name.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-${updatedPackType.name.toUpperCase().replace(/[^A-Z0-9]/g, '-')}`;

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

      return updatedPackType;
    });
  }

  async remove(id: string, userId: string) {
    const packType = await this.findOne(id);

    // Check if any LIVE products are using this pack type
    const liveProducts = await this.prisma.product.findMany({
      where: {
        packTypeId: id,
        status: 'LIVE',
        deletedAt: null,
      },
    });

    if (liveProducts.length > 0) {
      throw new BadRequestException(
        `Cannot delete pack type. ${liveProducts.length} live product(s) are using it. Please delete or archive the products first.`,
      );
    }

    // Soft delete by setting status to ARCHIVED
    return this.prisma.packType.update({
      where: { id },
      data: {
        status: PackTypeStatus.ARCHIVED,
        deletedAt: new Date(),
        deletedBy: userId,
        updatedBy: userId,
      },
    });
  }

  async activate(id: string, userId: string) {
    const packType = await this.findOne(id);

    if (packType.status === PackTypeStatus.ACTIVE) {
      throw new BadRequestException('Pack type is already active');
    }

    return this.prisma.packType.update({
      where: { id },
      data: {
        status: PackTypeStatus.ACTIVE,
        deletedAt: null,
        deletedBy: null,
        updatedBy: userId,
      },
    });
  }

  async findByVariant(variantId: string) {
    return this.prisma.packType.findMany({
      where: {
        variantId,
        status: PackTypeStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }
}
