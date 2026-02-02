import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';
import { PackSizeService } from '../pack-size/pack-size.service';
import { PackTypeService } from '../pack-type/pack-type.service';
import { Prisma } from '@prisma/client';
import {
  CreateVariantDto,
  UpdateVariantDto,
  VariantQueryDto,
  VariantResponseDto,
  VariantStatsDto,
} from './dto';
import { PaginatedResponse } from '../../common/dto/paginated-response.dto';
import { AuditLog } from '../../common/decorators/audit-log.decorator';

@Injectable()
export class VariantService {
  constructor(
    private prisma: PrismaService,
    private cacheInvalidationService: CacheInvalidationService,
    private packSizeService: PackSizeService,
    private packTypeService: PackTypeService,
  ) {}

  @AuditLog({
    action: 'CREATE',
    resource: 'VARIANT',
  })
  async create(
    createVariantDto: CreateVariantDto,
    userId: string,
  ): Promise<VariantResponseDto> {
    const { name, description, brandId, packSizes, packTypes } =
      createVariantDto;

    // Check if brand exists
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId, deletedAt: null },
    });

    if (!brand) {
      throw new BadRequestException('Brand not found');
    }

    // Check if variant name already exists for this brand among active records
    const existingVariant = await this.prisma.variant.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        brandId,
        deletedAt: null, // Only check active variants
      },
    });

    if (existingVariant) {
      throw new ConflictException(
        `Variant with name "${name}" already exists for this brand`,
      );
    }

    // Validate pack entity names are unique within arrays
    if (packSizes) {
      const packSizeNames = packSizes.map((ps) => ps.name.toLowerCase());
      const uniquePackSizeNames = new Set(packSizeNames);
      if (packSizeNames.length !== uniquePackSizeNames.size) {
        throw new BadRequestException('Pack size names must be unique');
      }
    }

    if (packTypes) {
      const packTypeNames = packTypes.map((pt) => pt.name.toLowerCase());
      const uniquePackTypeNames = new Set(packTypeNames);
      if (packTypeNames.length !== uniquePackTypeNames.size) {
        throw new BadRequestException('Pack type names must be unique');
      }
    }

    const variant = await this.prisma.variant.create({
      data: {
        name,
        description,
        brandId,
        createdBy: userId,
        updatedBy: userId,
      },
      include: {
        brand: {
          select: {
            id: true,
            name: true,
          },
        },
        packSizes: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
          },
          orderBy: { name: 'asc' },
        },
        packTypes: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
          },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    // Create pack sizes if provided
    if (packSizes && packSizes.length > 0) {
      await Promise.all(
        packSizes.map((packSize) =>
          this.packSizeService.create(
            {
              name: packSize.name,
              variantId: variant.id,
            },
            userId,
          ),
        ),
      );
    }

    // Create pack types if provided
    if (packTypes && packTypes.length > 0) {
      await Promise.all(
        packTypes.map((packType) =>
          this.packTypeService.create(
            {
              name: packType.name,
              variantId: variant.id,
            },
            userId,
          ),
        ),
      );
    }

    // Fetch the complete variant with pack entities
    const completeVariant = await this.prisma.variant.findUnique({
      where: { id: variant.id },
      include: {
        brand: {
          select: {
            id: true,
            name: true,
          },
        },
        packSizes: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
          },
          orderBy: { name: 'asc' },
        },
        packTypes: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
          },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    // Invalidate variant-related caches
    await this.cacheInvalidationService.invalidateVariant(variant.id);

    return completeVariant as VariantResponseDto;
  }

  async findAll(
    query: VariantQueryDto,
    includes?: {
      includeBrand?: boolean;
      includeProductsCount?: boolean;
      includeAuditInfo?: boolean;
    },
  ): Promise<PaginatedResponse<VariantResponseDto>> {
    const {
      page = 1,
      limit = 10,
      search,
      brandId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    // Convert string params to numbers
    const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
    const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.VariantWhereInput = {
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { brand: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
      ...(brandId && { brandId }),
    };

    const orderBy: Prisma.VariantOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    // Build dynamic include object
    const includeObject: any = {
      // Always include pack entities
      packSizes: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      },
      packTypes: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      },
    };

    // Include brand if requested
    if (includes?.includeBrand === true) {
      includeObject.brand = {
        select: {
          id: true,
          name: true,
        },
      };
    }

    // Include products count if requested
    if (includes?.includeProductsCount === true) {
      includeObject._count = {
        select: {
          products: true,
        },
      };
    }

    // Include audit info if requested
    if (includes?.includeAuditInfo === true) {
      includeObject.createdByUser = {
        select: { id: true, email: true, firstName: true, lastName: true },
      };
      includeObject.updatedByUser = {
        select: { id: true, email: true, firstName: true, lastName: true },
      };
      includeObject.deletedByUser = {
        select: { id: true, email: true, firstName: true, lastName: true },
      };
    }

    const [variants, totalCount] = await Promise.all([
      this.prisma.variant.findMany({
        where,
        skip,
        take: limitNum,
        orderBy,
        include: includeObject,
      }),
      this.prisma.variant.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    return {
      data: variants as VariantResponseDto[],
      meta: {
        page: pageNum,
        limit: limitNum,
        totalItems: totalCount,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1,
      },
    };
  }

  async findOne(
    id: string,
    includes?: {
      includeBrand?: boolean;
      includeProductsCount?: boolean;
      includeAuditInfo?: boolean;
    },
  ): Promise<VariantResponseDto> {
    // Build dynamic include object
    const includeObject: any = {
      // Always include pack entities
      packSizes: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      },
      packTypes: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      },
    };

    // Include brand if requested
    if (includes?.includeBrand === true) {
      includeObject.brand = {
        select: {
          id: true,
          name: true,
        },
      };
    }

    // Include products count if requested
    if (includes?.includeProductsCount === true) {
      includeObject._count = {
        select: {
          products: true,
        },
      };
    }

    // Include audit info if requested
    if (includes?.includeAuditInfo === true) {
      includeObject.createdByUser = {
        select: { id: true, email: true, firstName: true, lastName: true },
      };
      includeObject.updatedByUser = {
        select: { id: true, email: true, firstName: true, lastName: true },
      };
      includeObject.deletedByUser = {
        select: { id: true, email: true, firstName: true, lastName: true },
      };
    }

    const variant = await this.prisma.variant.findFirst({
      where: { id, deletedAt: null },
      include: includeObject,
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    return variant as VariantResponseDto;
  }

  @AuditLog({
    action: 'UPDATE',
    resource: 'VARIANT',
  })
  async update(
    id: string,
    updateVariantDto: UpdateVariantDto,
    userId: string,
  ): Promise<VariantResponseDto> {
    const { name, description, brandId, packSizes, packTypes } =
      updateVariantDto;

    // Check if variant exists
    const existingVariant = await this.prisma.variant.findFirst({
      where: { id, deletedAt: null },
      include: {
        brand: {
          select: { id: true, name: true },
        },
        packSizes: {
          where: { status: 'ACTIVE' },
          select: { id: true, name: true },
        },
        packTypes: {
          where: { status: 'ACTIVE' },
          select: { id: true, name: true },
        },
      },
    });

    if (!existingVariant) {
      throw new NotFoundException('Variant not found');
    }

    // If name is being updated, check for duplicates among active records
    if (name && name !== existingVariant.name) {
      const duplicateVariant = await this.prisma.variant.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          brandId: brandId || existingVariant.brandId,
          deletedAt: null, // Only check active variants
          id: { not: id },
        },
      });

      if (duplicateVariant) {
        throw new ConflictException(
          `Variant with name "${name}" already exists for this brand`,
        );
      }
    }

    // Validate pack entity names are unique within arrays
    if (packSizes) {
      const packSizeNames = packSizes.map((ps) => ps.name.toLowerCase());
      const uniquePackSizeNames = new Set(packSizeNames);
      if (packSizeNames.length !== uniquePackSizeNames.size) {
        throw new BadRequestException('Pack size names must be unique');
      }
    }

    if (packTypes) {
      const packTypeNames = packTypes.map((pt) => pt.name.toLowerCase());
      const uniquePackTypeNames = new Set(packTypeNames);
      if (packTypeNames.length !== uniquePackTypeNames.size) {
        throw new BadRequestException('Pack type names must be unique');
      }
    }

    // If brandId is being updated, check if brand exists and get brand info
    let newBrand: { id: string; name: string } | null = null;
    if (brandId && brandId !== existingVariant.brandId) {
      newBrand = await this.prisma.brand.findUnique({
        where: { id: brandId, deletedAt: null },
        select: { id: true, name: true },
      });

      if (!newBrand) {
        throw new BadRequestException('Brand not found');
      }
    }

    // Check if this update will affect product names/SKUs
    const willAffectProducts =
      (name && name !== existingVariant.name) ||
      (brandId && brandId !== existingVariant.brandId);

    // Use transaction to ensure consistency
    const result = await this.prisma.$transaction(async (tx) => {
      // Update the variant first
      const updatedVariant = await tx.variant.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(brandId && { brandId }),
          updatedBy: userId,
        },
        include: {
          brand: {
            select: {
              id: true,
              name: true,
            },
          },
          packSizes: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true,
            },
            orderBy: { name: 'asc' },
          },
          packTypes: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true,
            },
            orderBy: { name: 'asc' },
          },
          _count: {
            select: {
              products: true,
            },
          },
        },
      });

      // Handle pack size updates if provided
      if (packSizes !== undefined) {
        // Get current pack sizes
        const currentPackSizes = existingVariant.packSizes;

        // Process pack sizes updates
        const packSizesToUpdate = packSizes.filter((ps) => ps.id);
        const packSizesToCreate = packSizes.filter((ps) => !ps.id);
        const packSizeIdsToKeep = new Set(
          packSizes.map((ps) => ps.id).filter(Boolean),
        );
        const packSizesToArchive = currentPackSizes.filter(
          (ps) => !packSizeIdsToKeep.has(ps.id),
        );

        // Archive pack sizes that are not in the update list
        for (const packSize of packSizesToArchive) {
          // Check if pack size has linked products
          const linkedProducts = await tx.product.count({
            where: { packSizeId: packSize.id, status: 'LIVE' },
          });

          if (linkedProducts > 0) {
            throw new BadRequestException(
              `Cannot remove pack size "${packSize.name}" because it has linked live products`,
            );
          }

          await tx.packSize.update({
            where: { id: packSize.id },
            data: { status: 'ARCHIVED', updatedBy: userId },
          });
        }

        // Update existing pack sizes
        for (const packSize of packSizesToUpdate) {
          await tx.packSize.update({
            where: { id: packSize.id! },
            data: { name: packSize.name, updatedBy: userId },
          });
        }

        // Create new pack sizes
        for (const packSize of packSizesToCreate) {
          await tx.packSize.create({
            data: {
              name: packSize.name,
              variantId: id,
              createdBy: userId,
              updatedBy: userId,
            },
          });
        }
      }

      // Handle pack type updates if provided
      if (packTypes !== undefined) {
        // Get current pack types
        const currentPackTypes = existingVariant.packTypes;

        // Process pack types updates
        const packTypesToUpdate = packTypes.filter((pt) => pt.id);
        const packTypesToCreate = packTypes.filter((pt) => !pt.id);
        const packTypeIdsToKeep = new Set(
          packTypes.map((pt) => pt.id).filter(Boolean),
        );
        const packTypesToArchive = currentPackTypes.filter(
          (pt) => !packTypeIdsToKeep.has(pt.id),
        );

        // Archive pack types that are not in the update list
        for (const packType of packTypesToArchive) {
          // Check if pack type has linked products
          const linkedProducts = await tx.product.count({
            where: { packTypeId: packType.id, status: 'LIVE' },
          });

          if (linkedProducts > 0) {
            throw new BadRequestException(
              `Cannot remove pack type "${packType.name}" because it has linked live products`,
            );
          }

          await tx.packType.update({
            where: { id: packType.id },
            data: { status: 'ARCHIVED', updatedBy: userId },
          });
        }

        // Update existing pack types
        for (const packType of packTypesToUpdate) {
          await tx.packType.update({
            where: { id: packType.id! },
            data: { name: packType.name, updatedBy: userId },
          });
        }

        // Create new pack types
        for (const packType of packTypesToCreate) {
          await tx.packType.create({
            data: {
              name: packType.name,
              variantId: id,
              createdBy: userId,
              updatedBy: userId,
            },
          });
        }
      }

      // If changes affect product names/SKUs, update all linked products
      if (willAffectProducts) {
        // Get all products linked to this variant
        const linkedProducts = await tx.product.findMany({
          where: {
            variantId: id,
            deletedAt: null,
          },
          select: {
            id: true,
            packSizeId: true,
            packTypeId: true,
            packSize: { select: { name: true } },
            packType: { select: { name: true } },
            brand: { select: { name: true } },
            brandId: true,
            manufacturerId: true,
          },
        });

        // Check for products that would have identical specifications after update
        const effectiveBrandName = newBrand
          ? newBrand.name
          : existingVariant.brand.name;
        const effectiveVariantName = name || existingVariant.name;

        const specMap = new Map<string, string[]>();
        for (const product of linkedProducts) {
          const specKey =
            `${effectiveBrandName}-${effectiveVariantName}-${product.packSize.name}-${product.packType.name}`.toLowerCase();
          if (!specMap.has(specKey)) {
            specMap.set(specKey, []);
          }
          specMap.get(specKey)!.push(product.id);
        }

        // Find duplicates
        const duplicateSpecs = Array.from(specMap.entries()).filter(
          ([_, productIds]) => productIds.length > 1,
        );

        if (duplicateSpecs.length > 0) {
          const duplicateInfo = duplicateSpecs
            .map(
              ([spec, productIds]) =>
                `${productIds.length} products with specs: ${spec} (IDs: ${productIds.join(', ')})`,
            )
            .join('\n');

          throw new ConflictException(
            `Cannot update variant because it would create products with identical specifications:\n${duplicateInfo}\n\nPlease ensure all products have unique combinations of brand, variant, pack size, and packaging type.`,
          );
        }

        // Update each product's name and SKU
        for (const product of linkedProducts) {
          // Determine the effective brand (use new brand if brandId is being updated)
          const effectiveBrandName = newBrand
            ? newBrand.name
            : product.brand.name;
          const effectiveVariantName = name || existingVariant.name;

          // Generate new name and SKU
          const newName = `${effectiveBrandName} ${effectiveVariantName} ${product.packSize.name} (${product.packType.name})`;
          const newSku = `${effectiveBrandName.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-${effectiveVariantName.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-${product.packSize.name.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-${product.packType.name.toUpperCase().replace(/[^A-Z0-9]/g, '-')}`;

          // Update the product
          await tx.product.update({
            where: { id: product.id },
            data: {
              name: newName,
              sku: newSku,
              ...(brandId && { brandId }), // Update brandId if variant's brand changed
              updatedBy: userId,
            },
          });
        }
      }

      // Fetch the complete updated variant with all pack entities
      const completeVariant = await tx.variant.findUnique({
        where: { id },
        include: {
          brand: {
            select: {
              id: true,
              name: true,
            },
          },
          packSizes: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true,
            },
            orderBy: { name: 'asc' },
          },
          packTypes: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true,
            },
            orderBy: { name: 'asc' },
          },
          _count: {
            select: {
              products: true,
            },
          },
        },
      });

      return completeVariant;
    });

    // Invalidate variant and product caches (since products may have been updated)
    await this.cacheInvalidationService.invalidateVariant(id);
    if (willAffectProducts) {
      await this.cacheInvalidationService.invalidateProducts();
    }

    return result as VariantResponseDto;
  }

  @AuditLog({
    action: 'DELETE',
    resource: 'VARIANT',
  })
  async remove(id: string, userId: string): Promise<{ message: string }> {
    // Check if variant exists
    const existingVariant = await this.prisma.variant.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            products: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!existingVariant) {
      throw new NotFoundException('Variant not found');
    }

    // Check if variant has associated active products
    if (existingVariant._count.products > 0) {
      throw new BadRequestException(
        `Cannot delete variant with ${existingVariant._count.products} active product(s). Please remove or archive all products first.`,
      );
    }

    // Soft delete the variant and cascade to pack entities if no live products reference them
    const result = await this.prisma.$transaction(async (tx) => {
      // Check for pack sizes that have live products
      const packSizesWithProducts = await tx.packSize.findMany({
        where: {
          variantId: id,
          products: {
            some: { deletedAt: null },
          },
        },
        select: { id: true, name: true },
      });

      // Check for pack types that have live products
      const packTypesWithProducts = await tx.packType.findMany({
        where: {
          variantId: id,
          products: {
            some: { deletedAt: null },
          },
        },
        select: { id: true, name: true },
      });

      if (packSizesWithProducts.length > 0) {
        const packNames = packSizesWithProducts.map((p) => p.name).join(', ');
        throw new BadRequestException(
          `Cannot delete variant because pack sizes (${packNames}) have live products referencing them.`,
        );
      }

      if (packTypesWithProducts.length > 0) {
        const packNames = packTypesWithProducts.map((p) => p.name).join(', ');
        throw new BadRequestException(
          `Cannot delete variant because pack types (${packNames}) have live products referencing them.`,
        );
      }

      // Safe to cascade delete - soft delete pack entities first
      await tx.packSize.updateMany({
        where: { variantId: id },
        data: {
          status: 'ARCHIVED',
          deletedAt: new Date(),
          deletedBy: userId,
          updatedBy: userId,
        },
      });

      await tx.packType.updateMany({
        where: { variantId: id },
        data: {
          status: 'ARCHIVED',
          deletedAt: new Date(),
          deletedBy: userId,
          updatedBy: userId,
        },
      });

      // Finally, soft delete the variant
      return await tx.variant.update({
        where: { id },
        data: {
          deletedBy: userId,
          deletedAt: new Date(),
        },
      });
    });

    // Invalidate variant-related caches
    await this.cacheInvalidationService.invalidateVariant(id);

    return {
      message: 'Variant and its pack configurations deleted successfully',
    };
  }

  async activate(id: string, userId: string): Promise<VariantResponseDto> {
    // Check if variant exists in deleted state
    const deletedVariant = await this.prisma.variant.findFirst({
      where: { id, deletedAt: { not: null } },
      include: { brand: true },
    });

    if (!deletedVariant) {
      throw new NotFoundException(
        'Variant not found or is not in deleted state',
      );
    }

    // Check if brand is still active
    if (deletedVariant.brand.deletedAt) {
      throw new BadRequestException(
        'Cannot reactivate variant because its brand is deleted. Reactivate the brand first.',
      );
    }

    // Check for name conflicts with active variants in the same brand
    const conflictVariant = await this.prisma.variant.findFirst({
      where: {
        name: { equals: deletedVariant.name, mode: 'insensitive' },
        brandId: deletedVariant.brandId,
        deletedAt: null,
        NOT: { id },
      },
    });

    if (conflictVariant) {
      throw new ConflictException(
        `A variant with name "${deletedVariant.name}" already exists in this brand`,
      );
    }

    // Reactivate the variant and its pack configurations in a transaction
    const variant = await this.prisma.$transaction(async (tx) => {
      // Reactivate the variant
      const reactivatedVariant = await tx.variant.update({
        where: { id },
        data: {
          deletedAt: null,
          deletedBy: null,
          updatedBy: userId,
        },
        include: {
          brand: true,
          _count: {
            select: { products: { where: { deletedAt: null } } },
          },
        },
      });

      // Reactivate associated pack entities that were deleted with this variant
      await tx.packSize.updateMany({
        where: {
          variantId: id,
          deletedAt: { not: null },
        },
        data: {
          status: 'ACTIVE',
          deletedAt: null,
          deletedBy: null,
          updatedBy: userId,
        },
      });

      await tx.packType.updateMany({
        where: {
          variantId: id,
          deletedAt: { not: null },
        },
        data: {
          status: 'ACTIVE',
          deletedAt: null,
          deletedBy: null,
          updatedBy: userId,
        },
      });

      return reactivatedVariant;
    });

    // Get the reactivated pack entities for response
    const reactivatedVariantWithPacks = await this.prisma.variant.findUnique({
      where: { id },
      include: {
        brand: true,
        packSizes: {
          where: { deletedAt: null },
        },
        packTypes: {
          where: { deletedAt: null },
        },
        _count: {
          select: { products: { where: { deletedAt: null } } },
        },
      },
    });

    // Invalidate variant-related caches
    await this.cacheInvalidationService.invalidateVariant(id);

    return {
      id: reactivatedVariantWithPacks!.id,
      name: reactivatedVariantWithPacks!.name,
      description: reactivatedVariantWithPacks!.description || undefined,
      brandId: reactivatedVariantWithPacks!.brandId,
      createdBy: reactivatedVariantWithPacks!.createdBy,
      updatedBy: reactivatedVariantWithPacks!.updatedBy,
      createdAt: reactivatedVariantWithPacks!.createdAt,
      updatedAt: reactivatedVariantWithPacks!.updatedAt,
      brand: {
        id: reactivatedVariantWithPacks!.brand.id,
        name: reactivatedVariantWithPacks!.brand.name,
      },
      _count: { products: reactivatedVariantWithPacks!._count.products },
      packSizes: reactivatedVariantWithPacks!.packSizes.map((packSize) => ({
        id: packSize.id,
        name: packSize.name,
        status: packSize.status,
        createdAt: packSize.createdAt,
        updatedAt: packSize.updatedAt,
      })),
      packTypes: reactivatedVariantWithPacks!.packTypes.map((packType) => ({
        id: packType.id,
        name: packType.name,
        status: packType.status,
        createdAt: packType.createdAt,
        updatedAt: packType.updatedAt,
      })),
    };
  }

  async getStats(): Promise<VariantStatsDto> {
    // Get total variants count
    const totalVariants = await this.prisma.variant.count({
      where: { deletedAt: null },
    });

    // Get variants by brand
    const variantsByBrandData = await this.prisma.variant.groupBy({
      by: ['brandId'],
      where: { deletedAt: null },
      _count: true,
    });

    // Transform to brand name: count format
    const variantsByBrand: Record<string, number> = {};
    for (const item of variantsByBrandData) {
      // Note: We'll need to fetch brand names separately since groupBy doesn't support include
      const brand = await this.prisma.brand.findUnique({
        where: { id: item.brandId },
        select: { name: true },
      });
      if (brand) {
        variantsByBrand[brand.name] = item._count;
      }
    }

    // Get most popular variants by product count
    const popularVariantsData = await this.prisma.variant.findMany({
      where: { deletedAt: null },
      select: {
        name: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
      orderBy: {
        products: {
          _count: 'desc',
        },
      },
      take: 10,
    });

    const popularVariants = popularVariantsData.map((variant) => ({
      name: variant.name,
      productCount: variant._count.products,
    }));

    return {
      totalVariants,
      variantsByBrand,
      popularVariants,
    };
  }
}
