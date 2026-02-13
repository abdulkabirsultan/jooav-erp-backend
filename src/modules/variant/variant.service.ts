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
import { BulkDeleteResultDto } from '../../common/dto';
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

    // Check for duplicate variant name within the brand
    const duplicateVariant = await this.prisma.variant.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        brandId,
        deletedAt: null,
      },
    });

    if (duplicateVariant) {
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

    const result = await this.prisma.$transaction(async (tx) => {
      // Create the variant
      const variant = await tx.variant.create({
        data: {
          name,
          description,
          brandId,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      // Create pack sizes if provided
      if (packSizes && packSizes.length > 0) {
        await tx.packSize.createMany({
          data: packSizes.map((ps) => ({
            name: ps.name,
            variantId: variant.id,
            createdBy: userId,
            updatedBy: userId,
          })),
        });
      }

      // Create pack types if provided
      if (packTypes && packTypes.length > 0) {
        await tx.packType.createMany({
          data: packTypes.map((pt) => ({
            name: pt.name,
            variantId: variant.id,
            createdBy: userId,
            updatedBy: userId,
          })),
        });
      }

      return variant;
    });

    // Invalidate cache
    await this.cacheInvalidationService.invalidateVariant(result.id);

    return this.findOne(result.id);
  }

  async findAll(
    query: VariantQueryDto,
  ): Promise<PaginatedResponse<VariantResponseDto>> {
    const {
      page = '1',
      limit = '10',
      search,
      brandId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.VariantWhereInput = {
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(brandId && { brandId }),
    };

    const [variants, total] = await Promise.all([
      this.prisma.variant.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        include: {
          brand: {
            select: { id: true, name: true },
          },
          packSizes: {
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, status: true, createdAt: true },
          },
          packTypes: {
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, status: true, createdAt: true },
          },
        },
      }),
      this.prisma.variant.count({ where }),
    ]);

    return new PaginatedResponse(
      variants.map((v) => ({
        ...v,
        description: v.description || undefined,
        deletedBy: v.deletedBy || undefined,
        deletedAt: v.deletedAt || undefined,
      })),
      pageNum,
      limitNum,
      total,
    );
  }

  async findOne(id: string): Promise<VariantResponseDto> {
    const variant = await this.prisma.variant.findFirst({
      where: { id, deletedAt: null },
      include: {
        brand: {
          select: { id: true, name: true },
        },
        packSizes: {
          where: { status: 'ACTIVE' },
          select: { id: true, name: true, status: true, createdAt: true },
        },
        packTypes: {
          where: { status: 'ACTIVE' },
          select: { id: true, name: true, status: true, createdAt: true },
        },
      },
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    return {
      ...variant,
      description: variant.description || undefined,
      deletedBy: variant.deletedBy || undefined,
      deletedAt: variant.deletedAt || undefined,
    };
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
    const {
      name,
      description,
      brandId,
      createPackSizes = [],
      updatePackSizes = [],
      deletePackSizeIds = [],
      createPackTypes = [],
      updatePackTypes = [],
      deletePackTypeIds = [],
      forceDeleteConfigs = false,
    } = updateVariantDto;

    // Check if variant exists
    const existingVariant = await this.prisma.variant.findFirst({
      where: { id, deletedAt: null },
      include: {
        brand: {
          select: { id: true, name: true },
        },
        packSizes: {
          where: { status: 'ACTIVE' },
          select: { id: true, name: true, status: true, createdAt: true },
        },
        packTypes: {
          where: { status: 'ACTIVE' },
          select: { id: true, name: true, status: true, createdAt: true },
        },
      },
    });

    if (!existingVariant) {
      throw new NotFoundException('Variant not found');
    }

    return await this.prisma.$transaction(async (tx) => {
      // Prepare variant update data
      const updateData: any = {
        updatedBy: userId,
      };

      // Handle name update with duplicate check
      if (name && name !== existingVariant.name) {
        const duplicateVariant = await tx.variant.findFirst({
          where: {
            name: { equals: name, mode: 'insensitive' },
            brandId: brandId || existingVariant.brandId,
            deletedAt: null,
            id: { not: id },
          },
        });

        if (duplicateVariant) {
          throw new ConflictException(
            `Variant with name "${name}" already exists for this brand`,
          );
        }
        updateData.name = name;
      }

      if (description !== undefined) {
        updateData.description = description;
      }

      // Handle brand update with validation
      if (brandId && brandId !== existingVariant.brandId) {
        const newBrand = await tx.brand.findUnique({
          where: { id: brandId, deletedAt: null },
          select: { id: true, name: true },
        });

        if (!newBrand) {
          throw new BadRequestException('Brand not found');
        }
        updateData.brandId = brandId;
      }

      // Update the variant first
      const updatedVariant = await tx.variant.update({
        where: { id },
        data: updateData,
      });

      const operationsSummary = {
        packSizes: { created: 0, updated: 0, deleted: 0 },
        packTypes: { created: 0, updated: 0, deleted: 0 },
        productsAffected: 0,
        errors: [] as string[],
      };

      // 1. Handle Pack Size Operations
      // Delete operations first (check for product dependencies)
      if (deletePackSizeIds.length > 0) {
        for (const packSizeId of deletePackSizeIds) {
          // Verify pack size belongs to this variant
          const packSize = await tx.packSize.findFirst({
            where: {
              id: packSizeId,
              variantId: id,
              status: 'ACTIVE',
            },
            include: {
              _count: {
                select: { products: { where: { deletedAt: null } } },
              },
            },
          });

          if (!packSize) {
            operationsSummary.errors.push(
              `Pack size ${packSizeId} not found or doesn't belong to this variant`,
            );
            continue;
          }

          const productCount = packSize._count.products;

          if (productCount > 0 && !forceDeleteConfigs) {
            operationsSummary.errors.push(
              `Cannot delete pack size "${packSize.name}" - it has ${productCount} products. Use forceDeleteConfigs=true to cascade delete.`,
            );
            continue;
          }

          if (productCount > 0 && forceDeleteConfigs) {
            // Cascade delete: soft delete all products using this pack size
            await tx.product.updateMany({
              where: {
                packSizeId: packSizeId,
                deletedAt: null,
              },
              data: {
                deletedAt: new Date(),
                deletedBy: userId,
              },
            });
            operationsSummary.productsAffected += productCount;
          }

          // Soft delete the pack size
          await tx.packSize.update({
            where: { id: packSizeId },
            data: {
              status: 'ARCHIVED',
              deletedAt: new Date(),
              deletedBy: userId,
            },
          });

          operationsSummary.packSizes.deleted++;
        }
      }

      // Update pack sizes
      if (updatePackSizes.length > 0) {
        for (const updateOp of updatePackSizes) {
          const { id: packSizeId, name: newName } = updateOp;

          // Verify pack size belongs to this variant
          const existingPackSize = await tx.packSize.findFirst({
            where: {
              id: packSizeId,
              variantId: id,
              status: 'ACTIVE',
            },
          });

          if (!existingPackSize) {
            operationsSummary.errors.push(
              `Pack size ${packSizeId} not found or doesn't belong to this variant`,
            );
            continue;
          }

          // Check for name conflicts within the variant
          if (newName !== existingPackSize.name) {
            const conflictPackSize = await tx.packSize.findFirst({
              where: {
                variantId: id,
                name: { equals: newName, mode: 'insensitive' },
                status: 'ACTIVE',
                NOT: { id: packSizeId },
              },
            });

            if (conflictPackSize) {
              operationsSummary.errors.push(
                `Pack size name "${newName}" already exists in this variant`,
              );
              continue;
            }
          }

          await tx.packSize.update({
            where: { id: packSizeId },
            data: {
              name: newName,
              updatedBy: userId,
            },
          });

          operationsSummary.packSizes.updated++;
        }
      }

      // Create new pack sizes
      if (createPackSizes.length > 0) {
        // Validate new pack size names for duplicates
        const newPackSizeNames = createPackSizes.map((ps) =>
          ps.name.trim().toLowerCase(),
        );
        const duplicateNames = newPackSizeNames.filter(
          (name, index) => newPackSizeNames.indexOf(name) !== index,
        );

        if (duplicateNames.length > 0) {
          throw new BadRequestException(
            `Duplicate pack size names in request: ${duplicateNames.join(', ')}`,
          );
        }

        // Check for conflicts with existing pack sizes
        const existingPackSizes = await tx.packSize.findMany({
          where: {
            variantId: id,
            name: {
              in: newPackSizeNames,
              mode: 'insensitive',
            },
            status: 'ACTIVE',
          },
          select: { name: true },
        });

        if (existingPackSizes.length > 0) {
          throw new ConflictException(
            `Pack size names already exist: ${existingPackSizes.map((ps) => ps.name).join(', ')}`,
          );
        }

        // Create new pack sizes
        for (const packSize of createPackSizes) {
          await tx.packSize.create({
            data: {
              name: packSize.name.trim(),
              variantId: id,
              createdBy: userId,
              updatedBy: userId,
            },
          });
          operationsSummary.packSizes.created++;
        }
      }

      // 2. Handle Pack Type Operations (similar pattern)
      // Delete operations first
      if (deletePackTypeIds.length > 0) {
        for (const packTypeId of deletePackTypeIds) {
          const packType = await tx.packType.findFirst({
            where: {
              id: packTypeId,
              variantId: id,
              status: 'ACTIVE',
            },
            include: {
              _count: {
                select: { products: { where: { deletedAt: null } } },
              },
            },
          });

          if (!packType) {
            operationsSummary.errors.push(
              `Pack type ${packTypeId} not found or doesn't belong to this variant`,
            );
            continue;
          }

          const productCount = packType._count.products;

          if (productCount > 0 && !forceDeleteConfigs) {
            operationsSummary.errors.push(
              `Cannot delete pack type "${packType.name}" - it has ${productCount} products. Use forceDeleteConfigs=true to cascade delete.`,
            );
            continue;
          }

          if (productCount > 0 && forceDeleteConfigs) {
            // Cascade delete: soft delete all products using this pack type
            await tx.product.updateMany({
              where: {
                packTypeId: packTypeId,
                deletedAt: null,
              },
              data: {
                deletedAt: new Date(),
                deletedBy: userId,
              },
            });
            operationsSummary.productsAffected += productCount;
          }

          await tx.packType.update({
            where: { id: packTypeId },
            data: {
              status: 'ARCHIVED',
              deletedAt: new Date(),
              deletedBy: userId,
            },
          });

          operationsSummary.packTypes.deleted++;
        }
      }

      // Update pack types
      if (updatePackTypes.length > 0) {
        for (const updateOp of updatePackTypes) {
          const { id: packTypeId, name: newName } = updateOp;

          const existingPackType = await tx.packType.findFirst({
            where: {
              id: packTypeId,
              variantId: id,
              status: 'ACTIVE',
            },
          });

          if (!existingPackType) {
            operationsSummary.errors.push(
              `Pack type ${packTypeId} not found or doesn't belong to this variant`,
            );
            continue;
          }

          if (newName !== existingPackType.name) {
            const conflictPackType = await tx.packType.findFirst({
              where: {
                variantId: id,
                name: { equals: newName, mode: 'insensitive' },
                status: 'ACTIVE',
                NOT: { id: packTypeId },
              },
            });

            if (conflictPackType) {
              operationsSummary.errors.push(
                `Pack type name "${newName}" already exists in this variant`,
              );
              continue;
            }
          }

          await tx.packType.update({
            where: { id: packTypeId },
            data: {
              name: newName,
              updatedBy: userId,
            },
          });

          operationsSummary.packTypes.updated++;
        }
      }

      // Create new pack types
      if (createPackTypes.length > 0) {
        const newPackTypeNames = createPackTypes.map((pt) =>
          pt.name.trim().toLowerCase(),
        );
        const duplicateNames = newPackTypeNames.filter(
          (name, index) => newPackTypeNames.indexOf(name) !== index,
        );

        if (duplicateNames.length > 0) {
          throw new BadRequestException(
            `Duplicate pack type names in request: ${duplicateNames.join(', ')}`,
          );
        }

        const existingPackTypes = await tx.packType.findMany({
          where: {
            variantId: id,
            name: {
              in: newPackTypeNames,
              mode: 'insensitive',
            },
            status: 'ACTIVE',
          },
          select: { name: true },
        });

        if (existingPackTypes.length > 0) {
          throw new ConflictException(
            `Pack type names already exist: ${existingPackTypes.map((pt) => pt.name).join(', ')}`,
          );
        }

        for (const packType of createPackTypes) {
          await tx.packType.create({
            data: {
              name: packType.name.trim(),
              variantId: id,
              createdBy: userId,
              updatedBy: userId,
            },
          });
          operationsSummary.packTypes.created++;
        }
      }

      // If there were any errors, include them in the response or throw
      if (operationsSummary.errors.length > 0) {
        throw new BadRequestException({
          message: 'Some pack configuration operations failed',
          errors: operationsSummary.errors,
          summary: operationsSummary,
        });
      }

      // Return updated variant with fresh data
      return await this.findOne(id);
    });
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
      throw new ConflictException(
        `Cannot delete variant with ${existingVariant._count.products} active product(s). Please remove or archive all products first.`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Archive pack sizes
      await tx.packSize.updateMany({
        where: {
          variantId: id,
          status: 'ACTIVE',
        },
        data: {
          status: 'ARCHIVED',
          deletedAt: new Date(),
          deletedBy: userId,
        },
      });

      // Archive pack types
      await tx.packType.updateMany({
        where: {
          variantId: id,
          status: 'ACTIVE',
        },
        data: {
          status: 'ARCHIVED',
          deletedAt: new Date(),
          deletedBy: userId,
        },
      });

      // Soft delete the variant
      await tx.variant.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy: userId,
        },
      });
    });

    await this.cacheInvalidationService.invalidateVariant(id);

    return { message: 'Variant deleted successfully' };
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
      throw new ConflictException(
        'Cannot activate variant because its brand is deleted',
      );
    }

    // Check for name conflict with active variants
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

    // Reactivate the variant and its pack configurations
    const variant = await this.prisma.$transaction(async (tx) => {
      // Reactivate variant
      await tx.variant.update({
        where: { id },
        data: {
          deletedAt: null,
          deletedBy: null,
          updatedBy: userId,
        },
      });

      // Reactivate pack sizes
      await tx.packSize.updateMany({
        where: {
          variantId: id,
          status: 'ARCHIVED',
        },
        data: {
          status: 'ACTIVE',
          deletedAt: null,
          deletedBy: null,
          updatedBy: userId,
        },
      });

      // Reactivate pack types
      await tx.packType.updateMany({
        where: {
          variantId: id,
          status: 'ARCHIVED',
        },
        data: {
          status: 'ACTIVE',
          deletedAt: null,
          deletedBy: null,
          updatedBy: userId,
        },
      });
    });

    const reactivatedVariantWithPacks = await this.prisma.variant.findUnique({
      where: { id },
      include: {
        brand: {
          select: { id: true, name: true },
        },
        packSizes: {
          where: { status: 'ACTIVE' },
          select: { id: true, name: true, status: true, createdAt: true },
        },
        packTypes: {
          where: { status: 'ACTIVE' },
          select: { id: true, name: true, status: true, createdAt: true },
        },
      },
    });

    await this.cacheInvalidationService.invalidateVariant(id);

    return {
      ...reactivatedVariantWithPacks!,
      description: reactivatedVariantWithPacks!.description || undefined,
      deletedBy: reactivatedVariantWithPacks!.deletedBy || undefined,
      deletedAt: reactivatedVariantWithPacks!.deletedAt || undefined,
    };
  }

  async getStats(): Promise<VariantStatsDto> {
    const [totalVariants, totalBrands, deletedVariants] = await Promise.all([
      // Get total variants count (excluding deleted)
      this.prisma.variant.count({
        where: { deletedAt: null },
      }),

      // Get total brands count (excluding deleted)
      this.prisma.brand.count({
        where: { deletedAt: null },
      }),

      // Get deleted variants count (soft deleted)
      this.prisma.variant.count({
        where: {
          deletedAt: { not: null },
        },
      }),
    ]);

    return {
      totalVariants,
      totalBrands,
      inactiveVariants: deletedVariants,
    };
  }

  @AuditLog({
    action: 'BULK_DELETE',
    resource: 'VARIANT',
  })
  async removeMany(
    variantIds: string[],
    userId: string,
  ): Promise<BulkDeleteResultDto> {
    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    // Process each variant deletion individually to handle errors gracefully
    for (const variantId of variantIds) {
      try {
        // Check if variant exists and is not already deleted
        const variant = await this.prisma.variant.findFirst({
          where: {
            id: variantId,
            deletedAt: null,
          },
        });

        if (!variant) {
          results.push({
            id: variantId,
            success: false,
            error: 'Variant not found or already deleted',
          });
          continue;
        }

        // Check if variant has associated products
        const associatedProducts = await this.prisma.product.count({
          where: {
            variantId: variantId,
            deletedAt: null,
          },
        });

        if (associatedProducts > 0) {
          results.push({
            id: variantId,
            success: false,
            error: `Cannot delete variant with ${associatedProducts} associated products`,
          });
          continue;
        }

        // Perform soft delete
        await this.prisma.variant.update({
          where: { id: variantId },
          data: {
            deletedAt: new Date(),
            deletedBy: userId,
          },
        });

        // Invalidate cache
        await this.cacheInvalidationService.invalidateVariant(variantId);

        results.push({ id: variantId, success: true });
      } catch (error) {
        results.push({
          id: variantId,
          success: false,
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    }

    return {
      results,
      totalRequested: variantIds.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };
  }
}
