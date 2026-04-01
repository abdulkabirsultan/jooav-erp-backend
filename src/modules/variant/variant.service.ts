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
import { APP_CONSTANTS } from '../../shared/constants/app.constants';

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

    const result = await this.prisma.$transaction(
      async (tx) => {
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
      },
      {
        maxWait: APP_CONSTANTS.ACCELERATE_ITX_MAX_WAIT_MS,
        timeout: APP_CONSTANTS.ACCELERATE_ITX_TIMEOUT_MS,
      },
    );

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
          { brand: { name: { contains: search, mode: 'insensitive' } } },
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

    const updateData: any = {
      updatedBy: userId,
    };

    if (name && name !== existingVariant.name) {
      const duplicateVariant = await this.prisma.variant.findFirst({
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

    if (brandId && brandId !== existingVariant.brandId) {
      const newBrand = await this.prisma.brand.findUnique({
        where: { id: brandId, deletedAt: null },
        select: { id: true, name: true },
      });

      if (!newBrand) {
        throw new BadRequestException('Brand not found');
      }
      updateData.brandId = brandId;
    }

    const operationsSummary = {
      packSizes: { created: 0, updated: 0, deleted: 0 },
      packTypes: { created: 0, updated: 0, deleted: 0 },
      productsAffected: 0,
      errors: [] as string[],
    };

    const writeOperations: Prisma.PrismaPromise<unknown>[] = [];

    if (deletePackSizeIds.length > 0) {
      for (const packSizeId of deletePackSizeIds) {
        const packSize = await this.prisma.packSize.findFirst({
          where: {
            id: packSizeId,
            variantId: id,
            status: 'ACTIVE',
            deletedAt: null, // Only consider non-deleted pack sizes
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
          writeOperations.push(
            this.prisma.product.updateMany({
              where: {
                packSizeId,
                deletedAt: null,
              },
              data: {
                deletedAt: new Date(),
                deletedBy: userId,
              },
            }),
          );
          operationsSummary.productsAffected += productCount;
        }

        // Soft delete pack size (like user deletion flow)
        writeOperations.push(
          this.prisma.packSize.update({
            where: { id: packSizeId },
            data: {
              status: 'ARCHIVED',
              deletedAt: new Date(),
              deletedBy: userId,
            },
          }),
        );

        operationsSummary.packSizes.deleted++;
      }
    }

    if (updatePackSizes.length > 0) {
      for (const updateOp of updatePackSizes) {
        const { id: packSizeId, name: newName } = updateOp;

        const existingPackSize = await this.prisma.packSize.findFirst({
          where: {
            id: packSizeId,
            variantId: id,
            status: 'ACTIVE',
            deletedAt: null, // Only consider non-deleted pack sizes
          },
        });

        if (!existingPackSize) {
          operationsSummary.errors.push(
            `Pack size ${packSizeId} not found or doesn't belong to this variant`,
          );
          continue;
        }

        if (newName !== existingPackSize.name) {
          const conflictPackSize = await this.prisma.packSize.findFirst({
            where: {
              variantId: id,
              name: { equals: newName, mode: 'insensitive' },
              status: 'ACTIVE',
              deletedAt: null, // Only check non-deleted pack sizes
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

        writeOperations.push(
          this.prisma.packSize.update({
            where: { id: packSizeId },
            data: {
              name: newName,
              updatedBy: userId,
            },
          }),
        );

        operationsSummary.packSizes.updated++;
      }
    }

    if (createPackSizes.length > 0) {
      const newPackSizeNames = createPackSizes.map((ps) =>
        ps.name.trim().toLowerCase(),
      );
      const duplicateNames = newPackSizeNames.filter(
        (packName, index) => newPackSizeNames.indexOf(packName) !== index,
      );

      if (duplicateNames.length > 0) {
        throw new BadRequestException(
          `Duplicate pack size names in request: ${duplicateNames.join(', ')}`,
        );
      }

      const existingPackSizes = await this.prisma.packSize.findMany({
        where: {
          variantId: id,
          name: {
            in: newPackSizeNames,
            mode: 'insensitive',
          },
          status: 'ACTIVE',
          deletedAt: null, // Only check non-deleted pack sizes
        },
        select: { name: true },
      });

      if (existingPackSizes.length > 0) {
        throw new ConflictException(
          `Pack size names already exist: ${existingPackSizes.map((ps) => ps.name).join(', ')}`,
        );
      }

      for (const packSize of createPackSizes) {
        writeOperations.push(
          this.prisma.packSize.create({
            data: {
              name: packSize.name.trim(),
              variantId: id,
              createdBy: userId,
              updatedBy: userId,
            },
          }),
        );
        operationsSummary.packSizes.created++;
      }
    }

    if (deletePackTypeIds.length > 0) {
      for (const packTypeId of deletePackTypeIds) {
        const packType = await this.prisma.packType.findFirst({
          where: {
            id: packTypeId,
            variantId: id,
            status: 'ACTIVE',
            deletedAt: null, // Only consider non-deleted pack types
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
          writeOperations.push(
            this.prisma.product.updateMany({
              where: {
                packTypeId,
                deletedAt: null,
              },
              data: {
                deletedAt: new Date(),
                deletedBy: userId,
              },
            }),
          );
          operationsSummary.productsAffected += productCount;
        }

        // Soft delete pack type (like user deletion flow)
        writeOperations.push(
          this.prisma.packType.update({
            where: { id: packTypeId },
            data: {
              status: 'ARCHIVED',
              deletedAt: new Date(),
              deletedBy: userId,
            },
          }),
        );

        operationsSummary.packTypes.deleted++;
      }
    }

    if (updatePackTypes.length > 0) {
      for (const updateOp of updatePackTypes) {
        const { id: packTypeId, name: newName } = updateOp;

        const existingPackType = await this.prisma.packType.findFirst({
          where: {
            id: packTypeId,
            variantId: id,
            status: 'ACTIVE',
            deletedAt: null, // Only consider non-deleted pack types
          },
        });

        if (!existingPackType) {
          operationsSummary.errors.push(
            `Pack type ${packTypeId} not found or doesn't belong to this variant`,
          );
          continue;
        }

        if (newName !== existingPackType.name) {
          const conflictPackType = await this.prisma.packType.findFirst({
            where: {
              variantId: id,
              name: { equals: newName, mode: 'insensitive' },
              status: 'ACTIVE',
              deletedAt: null, // Only check non-deleted pack types
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

        writeOperations.push(
          this.prisma.packType.update({
            where: { id: packTypeId },
            data: {
              name: newName,
              updatedBy: userId,
            },
          }),
        );

        operationsSummary.packTypes.updated++;
      }
    }

    if (createPackTypes.length > 0) {
      const newPackTypeNames = createPackTypes.map((pt) =>
        pt.name.trim().toLowerCase(),
      );
      const duplicateNames = newPackTypeNames.filter(
        (packName, index) => newPackTypeNames.indexOf(packName) !== index,
      );

      if (duplicateNames.length > 0) {
        throw new BadRequestException(
          `Duplicate pack type names in request: ${duplicateNames.join(', ')}`,
        );
      }

      const existingPackTypes = await this.prisma.packType.findMany({
        where: {
          variantId: id,
          name: {
            in: newPackTypeNames,
            mode: 'insensitive',
          },
          status: 'ACTIVE',
          deletedAt: null, // Only check non-deleted pack types
        },
        select: { name: true },
      });

      if (existingPackTypes.length > 0) {
        throw new ConflictException(
          `Pack type names already exist: ${existingPackTypes.map((pt) => pt.name).join(', ')}`,
        );
      }

      for (const packType of createPackTypes) {
        writeOperations.push(
          this.prisma.packType.create({
            data: {
              name: packType.name.trim(),
              variantId: id,
              createdBy: userId,
              updatedBy: userId,
            },
          }),
        );
        operationsSummary.packTypes.created++;
      }
    }

    if (operationsSummary.errors.length > 0) {
      throw new BadRequestException({
        message: 'Some pack configuration operations failed',
        errors: operationsSummary.errors,
        summary: operationsSummary,
      });
    }

    await this.prisma.$transaction([
      this.prisma.variant.update({
        where: { id },
        data: updateData,
      }),
      ...writeOperations,
    ]);

    return await this.findOne(id);
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

    const result = await this.prisma.$transaction(
      async (tx) => {
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
      },
      {
        maxWait: APP_CONSTANTS.ACCELERATE_ITX_MAX_WAIT_MS,
        timeout: APP_CONSTANTS.ACCELERATE_ITX_TIMEOUT_MS,
      },
    );

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
    const variant = await this.prisma.$transaction(
      async (tx) => {
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
      },
      {
        maxWait: APP_CONSTANTS.ACCELERATE_ITX_MAX_WAIT_MS,
        timeout: APP_CONSTANTS.ACCELERATE_ITX_TIMEOUT_MS,
      },
    );

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
