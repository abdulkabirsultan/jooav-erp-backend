import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CategoryStatus, SubcategoryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';
import { StringUtils } from '../../common/utils/helpers.utils';
import {
  CreateCategoryDto,
  CreateSubcategoryInput,
  UpdateCategoryDto,
  CategoryQueryDto,
  CategoryResponseDto,
  CategoryStatsDto,
} from './dto';
import {
  PaginatedResponse,
  PaginationMeta,
} from '../../common/dto/paginated-response.dto';
import { BulkDeleteResultDto } from '../../common/dto';

@Injectable()
export class CategoryService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private cacheInvalidationService: CacheInvalidationService,
  ) {}

  /**
   * Generates URL-friendly slug from category name
   */
  private generateSlug(name: string): string {
    return StringUtils.slugify(name.trim());
  }

  /**
   * Sanitizes category name for storage
   */
  private sanitizeCategoryName(name: string): string {
    return StringUtils.titleCase(name.trim());
  }

  /**
   * Generate unique category slug safely outside transaction
   */
  private async generateUniqueCategorySlugSafe(
    baseSlug: string,
    excludeId?: string,
  ): Promise<string> {
    const existingSlugs = await this.prisma.category.findMany({
      where: {
        slug: { startsWith: baseSlug },
        deletedAt: null,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { slug: true },
    });

    const existingSlugSet = new Set(existingSlugs.map((c) => c.slug));

    if (!existingSlugSet.has(baseSlug)) {
      return baseSlug;
    }

    let counter = 1;
    let uniqueSlug = `${baseSlug}-${counter}`;
    while (existingSlugSet.has(uniqueSlug)) {
      counter++;
      uniqueSlug = `${baseSlug}-${counter}`;

      if (counter > 999) {
        throw new BadRequestException(
          'Unable to generate unique slug. Please use a different name.',
        );
      }
    }

    return uniqueSlug;
  }

  /**
   * Pre-generate subcategory slugs outside transaction
   */
  private async preGenerateSubcategorySlugs(
    subcategories: CreateSubcategoryInput[],
  ): Promise<string[]> {
    if (subcategories.length === 0) {
      return [];
    }

    // Generate base slugs for all subcategories
    const baseSlugs = subcategories.map((subcat) => {
      const subcategoryName = StringUtils.titleCase(subcat.name.trim());
      return StringUtils.slugify(subcategoryName);
    });

    // Get all existing subcategory slugs that could conflict
    const allBaseSlugsPattern = baseSlugs.map((slug) => `${slug}%`).join(',');
    const existingSlugs = await this.prisma.subcategory.findMany({
      where: {
        OR: baseSlugs.map((baseSlug) => ({
          slug: { startsWith: baseSlug },
        })),
        deletedAt: null,
      },
      select: { slug: true },
    });

    const existingSlugSet = new Set(existingSlugs.map((s) => s.slug));
    const usedSlugs = new Set<string>();
    const resultSlugs: string[] = [];

    // Generate unique slug for each subcategory
    for (const baseSlug of baseSlugs) {
      let uniqueSlug = baseSlug;

      if (existingSlugSet.has(uniqueSlug) || usedSlugs.has(uniqueSlug)) {
        let counter = 1;
        uniqueSlug = `${baseSlug}-${counter}`;
        while (existingSlugSet.has(uniqueSlug) || usedSlugs.has(uniqueSlug)) {
          counter++;
          uniqueSlug = `${baseSlug}-${counter}`;

          if (counter > 999) {
            throw new BadRequestException(
              `Unable to generate unique slug for subcategory. Please use a different name.`,
            );
          }
        }
      }

      usedSlugs.add(uniqueSlug);
      resultSlugs.push(uniqueSlug);
    }

    return resultSlugs;
  }
  private async generateUniqueSubcategorySlug(
    baseSlug: string,
    tx: any,
    usedSlugs: Set<string> = new Set(),
  ): Promise<string> {
    const existingSlugs = await tx.subcategory.findMany({
      where: {
        slug: { startsWith: baseSlug },
        deletedAt: null,
      },
      select: { slug: true },
    });

    const allUsedSlugs = new Set([
      ...existingSlugs.map((s: any) => s.slug),
      ...usedSlugs,
    ]);

    if (!allUsedSlugs.has(baseSlug)) {
      usedSlugs.add(baseSlug);
      return baseSlug;
    }

    let counter = 1;
    let uniqueSlug = `${baseSlug}-${counter}`;
    while (allUsedSlugs.has(uniqueSlug)) {
      counter++;
      uniqueSlug = `${baseSlug}-${counter}`;

      if (counter > 999) {
        throw new BadRequestException(
          `Unable to generate unique slug for subcategory. Please use a different name.`,
        );
      }
    }

    usedSlugs.add(uniqueSlug);
    return uniqueSlug;
  }

  async create(
    createCategoryDto: CreateCategoryDto,
    userId: string,
  ): Promise<CategoryResponseDto> {
    const { name, description, subcategories = [] } = createCategoryDto;

    // Sanitize and validate input
    const sanitizedName = this.sanitizeCategoryName(name);
    const baseSlug = this.generateSlug(sanitizedName);

    // Validate subcategory names for duplicates within the input
    if (subcategories.length > 0) {
      const subcategoryNames = subcategories.map((sub) =>
        sub.name.trim().toLowerCase(),
      );
      const duplicateNames = subcategoryNames.filter(
        (name, index) => subcategoryNames.indexOf(name) !== index,
      );

      if (duplicateNames.length > 0) {
        throw new BadRequestException(
          `Duplicate subcategory names found: ${duplicateNames.join(', ')}`,
        );
      }
    }

    // Pre-validate existence outside of transaction
    const existingCategory = await this.prisma.category.findFirst({
      where: {
        name: { equals: sanitizedName, mode: 'insensitive' },
        deletedAt: null,
      },
    });

    if (existingCategory) {
      throw new ConflictException(
        `Category with name "${sanitizedName}" already exists`,
      );
    }

    // Pre-validate subcategories
    if (subcategories.length > 0) {
      const subcategoryNames = subcategories.map((sub) =>
        StringUtils.titleCase(sub.name.trim()),
      );
      const existingSubcategories = await this.prisma.subcategory.findMany({
        where: {
          name: {
            in: subcategoryNames,
            mode: 'insensitive',
          },
          deletedAt: null,
        },
        select: { name: true },
      });

      if (existingSubcategories.length > 0) {
        throw new ConflictException(
          `Subcategory names already exist: ${existingSubcategories.map((s) => s.name).join(', ')}`,
        );
      }
    }

    // Pre-generate unique slugs outside transaction
    const finalSlug = await this.generateUniqueCategorySlugSafe(baseSlug);
    const subcategorySlugs =
      await this.preGenerateSubcategorySlugs(subcategories);

    // Create category and subcategories in a single atomic transaction
    const result = await this.prisma.$transaction(
      async (tx) => {
        // Create the category
        const category = await tx.category.create({
          data: {
            name: sanitizedName,
            slug: finalSlug,
            description: description?.trim(),
            createdBy: userId,
            updatedBy: userId,
          },
        });

        // Create subcategories with pre-generated slugs
        const createdSubcategories: any[] = [];
        if (subcategories.length > 0) {
          for (let i = 0; i < subcategories.length; i++) {
            const subcat = subcategories[i];
            const subcategoryName = StringUtils.titleCase(subcat.name.trim());
            const uniqueSubSlug = subcategorySlugs[i];

            const createdSubcategory = await tx.subcategory.create({
              data: {
                name: subcategoryName,
                slug: uniqueSubSlug,
                description: subcat.description?.trim(),
                categoryId: category.id,
                createdBy: userId,
                updatedBy: userId,
              },
              include: {
                _count: {
                  select: { products: { where: { deletedAt: null } } },
                },
              },
            });
            createdSubcategories.push(createdSubcategory);
          }
        }

        return {
          ...category,
          subcategories: createdSubcategories,
          _count: { subcategories: createdSubcategories.length },
        };
      },
      {
        timeout: 10000, // 10 second timeout
      },
    );

    // Log audit trail for category creation
    await this.auditService.createAuditLog({
      action: 'CREATE',
      resource: 'Category',
      resourceId: result.id,
      userId,
      metadata: {
        categoryName: result.name,
        subcategoriesCreated: subcategories.length,
        subcategoryNames: subcategories.map((sub) => sub.name),
      },
    });

    // Invalidate category cache
    await this.cacheInvalidationService.invalidateCategory(result.id);

    return {
      id: result.id,
      name: result.name,
      description: result.description,
      slug: result.slug,
      status: result.status,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      createdBy: result.createdBy,
      updatedBy: result.updatedBy,
      subcategories: result.subcategories.map((sub) => ({
        id: sub.id,
        name: sub.name,
        slug: sub.slug,
        description: sub.description,
        productCount: sub._count.products,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      })),
      subcategoryCount: result._count.subcategories,
      totalProductCount: result.subcategories.reduce(
        (total, sub) => total + sub._count.products,
        0,
      ),
    };
  }

  async findAll(
    query: CategoryQueryDto,
  ): Promise<PaginatedResponse<CategoryResponseDto>> {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeSubcategories = true,
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(status && { status }),
    };

    const orderBy: Prisma.CategoryOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    // Build dynamic include object
    const include: Prisma.CategoryInclude = {
      _count: {
        select: { subcategories: { where: { deletedAt: null } } },
      },
    };

    if (includeSubcategories) {
      include.subcategories = {
        where: { deletedAt: null }, // Ensure we don't include deleted subcategories
        include: {
          _count: {
            select: { products: { where: { deletedAt: null } } },
          },
        },
      };
    }

    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        include,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.category.count({ where }),
    ]);

    const data = categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      slug: category.slug,
      status: category.status,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      createdBy: category.createdBy,
      updatedBy: category.updatedBy,
      ...(includeSubcategories && {
        subcategories: (category.subcategories || []).map((sub: any) => ({
          id: sub.id,
          name: sub.name,
          slug: sub.slug,
          description: sub.description,
          productCount: sub._count.products,
          createdAt: sub.createdAt,
          updatedAt: sub.updatedAt,
        })),
      }),
      subcategoryCount: category._count.subcategories,
      ...(includeSubcategories && {
        totalProductCount: (category.subcategories || []).reduce(
          (total, sub: any) => total + sub._count.products,
          0,
        ),
      }),
    }));

    return {
      data,
      meta: new PaginationMeta(page, limit, total),
    };
  }

  async findOne(id: string): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: {
        subcategories: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { products: { where: { deletedAt: null } } },
            },
          },
        },
        _count: {
          select: { subcategories: { where: { deletedAt: null } } },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return {
      id: category.id,
      name: category.name,
      description: category.description,
      slug: category.slug,
      status: category.status,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      createdBy: category.createdBy,
      updatedBy: category.updatedBy,
      subcategories: category.subcategories.map((sub) => ({
        id: sub.id,
        name: sub.name,
        slug: sub.slug,
        description: sub.description,
        productCount: sub._count.products,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      })),
      subcategoryCount: category._count.subcategories,
      totalProductCount: category.subcategories.reduce(
        (total, sub) => total + sub._count.products,
        0,
      ),
    };
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    userId: string,
  ): Promise<CategoryResponseDto> {
    const {
      name,
      description,
      status,
      createSubcategories = [],
      updateSubcategories = [],
      deleteSubcategoryIds = [],
      forceDeleteSubcategories = false,
    } = updateCategoryDto;

    // Check if category exists
    const existingCategory = await this.findOne(id);

    // Pre-validate subcategory creation outside transaction
    let subcategorySlugs: string[] = [];
    if (createSubcategories.length > 0) {
      // Validate new subcategory names for duplicates within request
      const newSubcategoryNames = createSubcategories.map((sub) =>
        sub.name.trim().toLowerCase(),
      );
      const duplicateNames = newSubcategoryNames.filter(
        (name, index) => newSubcategoryNames.indexOf(name) !== index,
      );

      if (duplicateNames.length > 0) {
        throw new BadRequestException(
          `Duplicate subcategory names in request: ${duplicateNames.join(', ')}`,
        );
      }

      // Check for conflicts with existing subcategories
      const sanitizedNames = createSubcategories.map((sub) =>
        StringUtils.titleCase(sub.name.trim()),
      );

      const existingSubcategories = await this.prisma.subcategory.findMany({
        where: {
          categoryId: id,
          name: {
            in: sanitizedNames,
            mode: 'insensitive',
          },
          deletedAt: null,
        },
        select: { name: true },
      });

      if (existingSubcategories.length > 0) {
        throw new ConflictException(
          `Subcategory names already exist: ${existingSubcategories.map((s) => s.name).join(', ')}`,
        );
      }

      // Pre-generate slugs outside transaction
      subcategorySlugs =
        await this.preGenerateSubcategorySlugs(createSubcategories);
    }

    return await this.prisma.$transaction(
      async (tx) => {
        // Prepare category update data
        const updateData: any = {
          updatedBy: userId,
        };

        // Handle name update
        if (name && name !== existingCategory.name) {
          const sanitizedName = this.sanitizeCategoryName(name);
          const slug = this.generateSlug(sanitizedName);

          // Check for conflicts
          const conflictCategory = await tx.category.findFirst({
            where: {
              OR: [
                { name: { equals: sanitizedName, mode: 'insensitive' } },
                { slug },
              ],
              deletedAt: null,
              NOT: { id },
            },
          });

          if (conflictCategory) {
            throw new ConflictException(
              `Category with name "${sanitizedName}" already exists`,
            );
          }

          updateData.name = sanitizedName;
          updateData.slug = slug;
        }

        if (description !== undefined) {
          updateData.description = description?.trim() || null;
        }

        if (status !== undefined) {
          updateData.status = status;
        }

        // Update the category first
        const updatedCategory = await tx.category.update({
          where: { id },
          data: updateData,
        });

        const operationsSummary = {
          created: 0,
          updated: 0,
          deleted: 0,
          productsReassigned: 0,
          errors: [] as string[],
        };

        // 1. Handle subcategory deletions first (to check for cascading effects)
        if (deleteSubcategoryIds.length > 0) {
          for (const subcategoryId of deleteSubcategoryIds) {
            // Verify subcategory belongs to this category
            const subcategory = await tx.subcategory.findFirst({
              where: {
                id: subcategoryId,
                categoryId: id,
                deletedAt: null,
              },
              include: {
                _count: {
                  select: { products: { where: { deletedAt: null } } },
                },
              },
            });

            if (!subcategory) {
              operationsSummary.errors.push(
                `Subcategory ${subcategoryId} not found or doesn't belong to this category`,
              );
              continue;
            }

            const productCount = subcategory._count.products;

            if (productCount > 0 && !forceDeleteSubcategories) {
              operationsSummary.errors.push(
                `Cannot delete subcategory "${subcategory.name}" - it has ${productCount} products. Use forceDeleteSubcategories=true to cascade delete.`,
              );
              continue;
            }

            if (productCount > 0 && forceDeleteSubcategories) {
              // Cascade delete: soft delete all products in this subcategory
              await tx.product.updateMany({
                where: {
                  subcategoryId: subcategoryId,
                  deletedAt: null,
                },
                data: {
                  deletedAt: new Date(),
                  deletedBy: userId,
                },
              });
              operationsSummary.productsReassigned += productCount;
            }

            // Soft delete the subcategory
            await tx.subcategory.update({
              where: { id: subcategoryId },
              data: {
                status: SubcategoryStatus.INACTIVE,
                deletedAt: new Date(),
                deletedBy: userId,
              },
            });

            operationsSummary.deleted++;
          }
        }

        // 2. Handle subcategory updates
        if (updateSubcategories.length > 0) {
          for (const updateOp of updateSubcategories) {
            const { id: subcategoryId, name: newName } = updateOp;

            // Verify subcategory belongs to this category
            const existingSubcategory = await tx.subcategory.findFirst({
              where: {
                id: subcategoryId,
                categoryId: id,
                deletedAt: null,
              },
            });

            if (!existingSubcategory) {
              operationsSummary.errors.push(
                `Subcategory ${subcategoryId} not found or doesn't belong to this category`,
              );
              continue;
            }

            const subcategoryUpdateData: any = {
              updatedBy: userId,
            };

            // Handle name update with uniqueness check
            if (newName && newName !== existingSubcategory.name) {
              const sanitizedName = StringUtils.titleCase(newName.trim());
              const slug = StringUtils.slugify(newName);

              // Check for name conflicts within the same category
              const conflictSubcategory = await tx.subcategory.findFirst({
                where: {
                  categoryId: id,
                  OR: [
                    { name: { equals: sanitizedName, mode: 'insensitive' } },
                    { slug },
                  ],
                  deletedAt: null,
                  NOT: { id: subcategoryId },
                },
              });

              if (conflictSubcategory) {
                operationsSummary.errors.push(
                  `Subcategory name "${sanitizedName}" already exists in this category`,
                );
                continue;
              }

              subcategoryUpdateData.name = sanitizedName;
              subcategoryUpdateData.slug = slug;
            }

            await tx.subcategory.update({
              where: { id: subcategoryId },
              data: subcategoryUpdateData,
            });

            operationsSummary.updated++;
          }
        }

        // 3. Handle subcategory creation with pre-generated slugs
        if (createSubcategories.length > 0) {
          // Create new subcategories with pre-generated unique slugs
          for (let i = 0; i < createSubcategories.length; i++) {
            const subcat = createSubcategories[i];
            const subcategoryName = StringUtils.titleCase(subcat.name.trim());
            const uniqueSlug = subcategorySlugs[i];

            await tx.subcategory.create({
              data: {
                name: subcategoryName,
                slug: uniqueSlug,
                description: subcat.description?.trim(),
                categoryId: id,
                createdBy: userId,
                updatedBy: userId,
              },
            });
            operationsSummary.created++;
          }
        }

        // Log comprehensive audit trail
        await this.auditService.createAuditLog({
          action: 'UPDATE',
          resource: 'Category',
          resourceId: id,
          userId,
          metadata: {
            categoryName: updatedCategory.name,
            categoryUpdates: Object.keys(updateData),
            subcategoryOperations: operationsSummary,
            errors: operationsSummary.errors,
          },
        });

        // Invalidate category cache
        await this.cacheInvalidationService.invalidateCategory(id);

        // If there were any errors, include them in the response or throw
        if (operationsSummary.errors.length > 0) {
          // For partial success scenarios, you might want to return warnings
          // For now, let's throw an error if any operation failed
          throw new BadRequestException({
            message: 'Some subcategory operations failed',
            errors: operationsSummary.errors,
            summary: operationsSummary,
          });
        }

        // Return updated category with subcategories
        return await this.findOne(id);
      },
      {
        timeout: 15000, // 15 second timeout for complex updates
      },
    );
  }

  async remove(id: string, userId: string): Promise<{ message: string }> {
    // Check if category exists (using findFirst to get basic validation)
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check for active subcategories (including both active and inactive, but not deleted)
    const activeSubcategoriesCount = await this.prisma.subcategory.count({
      where: {
        categoryId: id,
        deletedAt: null, // Only count non-deleted subcategories
      },
    });

    if (activeSubcategoriesCount > 0) {
      throw new BadRequestException(
        `Cannot delete category '${category.name}' because it has ${activeSubcategoriesCount} subcategory(ies). Please delete all subcategories first.`,
      );
    }

    // Check for products in subcategories of this category
    const subcategoryProductsCount = await this.prisma.product.count({
      where: {
        subcategoryId: {
          in: await this.prisma.subcategory
            .findMany({
              where: {
                categoryId: id,
                deletedAt: null,
              },
              select: { id: true },
            })
            .then((subs) => subs.map((sub) => sub.id)),
        },
        deletedAt: null,
      },
    });

    if (subcategoryProductsCount > 0) {
      throw new BadRequestException(
        `Cannot delete category '${category.name}' because it has ${subcategoryProductsCount} product(s) in its subcategories. Please move or delete all products first.`,
      );
    }

    // Soft delete the category with status update
    await this.prisma.category.update({
      where: { id },
      data: {
        status: CategoryStatus.INACTIVE,
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    // Log audit trail
    await this.auditService.createAuditLog({
      action: 'DELETE',
      resource: 'Category',
      resourceId: id,
      userId,
      metadata: {
        categoryName: category.name,
        subcategoryCount: activeSubcategoriesCount,
        subcategoryProductCount: subcategoryProductsCount,
      },
    });

    // Invalidate category cache
    await this.cacheInvalidationService.invalidateCategory(id);

    return { message: 'Category deleted successfully' };
  }

  /**
   * Bulk soft delete categories
   */
  async bulkDelete(
    categoryIds: string[],
    userId: string,
  ): Promise<{
    deletedCount: number;
    deletedIds: string[];
    failedIds: Array<{ id: string; error: string }>;
  }> {
    const deletedIds: string[] = [];
    const failedIds: Array<{ id: string; error: string }> = [];

    // Process each category deletion individually to handle errors gracefully
    for (const categoryId of categoryIds) {
      try {
        // Check if category exists and is not already deleted
        const category = await this.prisma.category.findFirst({
          where: {
            id: categoryId,
            deletedAt: null,
          },
        });

        if (!category) {
          failedIds.push({
            id: categoryId,
            error: 'Category not found or already deleted',
          });
          continue;
        }

        // Check for active subcategories
        const activeSubcategoriesCount = await this.prisma.subcategory.count({
          where: {
            categoryId: categoryId,
            deletedAt: null,
          },
        });

        if (activeSubcategoriesCount > 0) {
          failedIds.push({
            id: categoryId,
            error: `Cannot delete category with ${activeSubcategoriesCount} subcategories`,
          });
          continue;
        }

        // Check for products in subcategories
        const subcategoryProductsCount = await this.prisma.product.count({
          where: {
            subcategoryId: {
              in: await this.prisma.subcategory
                .findMany({
                  where: {
                    categoryId: categoryId,
                    deletedAt: null,
                  },
                  select: { id: true },
                })
                .then((subs) => subs.map((sub) => sub.id)),
            },
            deletedAt: null,
          },
        });

        if (subcategoryProductsCount > 0) {
          failedIds.push({
            id: categoryId,
            error: `Cannot delete category with ${subcategoryProductsCount} products in subcategories`,
          });
          continue;
        }

        // Perform soft delete
        await this.prisma.category.update({
          where: { id: categoryId },
          data: {
            status: CategoryStatus.INACTIVE,
            deletedAt: new Date(),
            deletedBy: userId,
          },
        });

        // Log audit for each category
        await this.auditService.createAuditLog({
          action: 'BULK_DELETE',
          resource: 'Category',
          resourceId: categoryId,
          userId,
          metadata: {
            categoryName: category.name,
            bulkOperation: true,
          },
        });

        // Invalidate cache
        await this.cacheInvalidationService.invalidateCategory(categoryId);

        deletedIds.push(categoryId);
      } catch (error) {
        failedIds.push({
          id: categoryId,
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    }

    return {
      deletedCount: deletedIds.length,
      deletedIds,
      failedIds,
    };
  }

  /**
   * Cascade delete category with all its subcategories (only if no products exist)
   */
  async removeCascade(
    id: string,
    userId: string,
  ): Promise<{ message: string; deletedSubcategories: number }> {
    // Check if category exists
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Get all subcategories
    const subcategories = await this.prisma.subcategory.findMany({
      where: {
        categoryId: id,
        deletedAt: null,
      },
      select: { id: true, name: true },
    });

    // Check for products in any subcategory
    const subcategoryProductsCount = await this.prisma.product.count({
      where: {
        subcategoryId: {
          in: subcategories.map((sub) => sub.id),
        },
        deletedAt: null,
      },
    });

    if (subcategoryProductsCount > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${subcategoryProductsCount} product(s) in subcategories. Please move or delete products first.`,
      );
    }

    // Use transaction to delete category and all subcategories
    await this.prisma.$transaction(async (tx) => {
      // Delete all subcategories first
      if (subcategories.length > 0) {
        await tx.subcategory.updateMany({
          where: {
            categoryId: id,
            deletedAt: null,
          },
          data: {
            status: SubcategoryStatus.INACTIVE,
            deletedAt: new Date(),
            deletedBy: userId,
          },
        });
      }

      // Delete the category
      await tx.category.update({
        where: { id },
        data: {
          status: CategoryStatus.INACTIVE,
          deletedAt: new Date(),
          deletedBy: userId,
        },
      });
    });

    // Log audit trail
    await this.auditService.createAuditLog({
      action: 'CASCADE_DELETE',
      resource: 'Category',
      resourceId: id,
      userId,
      metadata: {
        categoryName: category.name,
        deletedSubcategories: subcategories.length,
        subcategoryNames: subcategories.map((sub) => sub.name),
      },
    });

    // Invalidate category cache
    await this.cacheInvalidationService.invalidateCategory(id);

    return {
      message: 'Category and all subcategories deleted successfully',
      deletedSubcategories: subcategories.length,
    };
  }

  async activate(id: string, userId: string): Promise<CategoryResponseDto> {
    // Check if category exists in deleted state
    const deletedCategory = await this.prisma.category.findFirst({
      where: { id, deletedAt: { not: null } },
    });

    if (!deletedCategory) {
      throw new NotFoundException(
        'Category not found or is not in deleted state',
      );
    }

    // Check for name conflicts with active categories
    const conflictCategory = await this.prisma.category.findFirst({
      where: {
        OR: [
          { name: { equals: deletedCategory.name, mode: 'insensitive' } },
          { slug: deletedCategory.slug },
        ],
        deletedAt: null,
        NOT: { id },
      },
    });

    if (conflictCategory) {
      throw new ConflictException(
        `A category with name \"${deletedCategory.name}\" already exists`,
      );
    }

    // Reactivate the category
    const reactivatedCategory = await this.prisma.category.update({
      where: { id },
      data: {
        deletedAt: null,
        status: CategoryStatus.ACTIVE,
        updatedBy: userId,
      },
      include: {
        subcategories: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { products: { where: { deletedAt: null } } },
            },
          },
        },
        _count: {
          select: { subcategories: { where: { deletedAt: null } } },
        },
      },
    });

    // Invalidate category cache
    await this.cacheInvalidationService.invalidateCategory(id);

    // Log audit trail
    await this.auditService.createAuditLog({
      action: 'ACTIVATE',
      resource: 'Category',
      resourceId: id,
      userId,
      metadata: {
        categoryName: reactivatedCategory.name,
        subcategoryCount: reactivatedCategory._count.subcategories,
      },
    });

    return {
      id: reactivatedCategory.id,
      name: reactivatedCategory.name,
      description: reactivatedCategory.description,
      slug: reactivatedCategory.slug,
      status: reactivatedCategory.status,
      createdAt: reactivatedCategory.createdAt,
      updatedAt: reactivatedCategory.updatedAt,
      createdBy: reactivatedCategory.createdBy,
      updatedBy: reactivatedCategory.updatedBy,
      subcategories: reactivatedCategory.subcategories.map((sub) => ({
        id: sub.id,
        name: sub.name,
        slug: sub.slug,
        description: sub.description,
        productCount: sub._count.products,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      })),
      subcategoryCount: reactivatedCategory._count.subcategories,
      totalProductCount: reactivatedCategory.subcategories.reduce(
        (total, sub) => total + sub._count.products,
        0,
      ),
    };
  }

  async getStats(): Promise<CategoryStatsDto> {
    const [
      totalCategories,
      activeCategories,
      inactiveCategories,
      totalSubcategories,
      categoriesWithSubcategoryCounts,
      categoriesWithProductCounts,
    ] = await Promise.all([
      this.prisma.category.count({ where: { deletedAt: null } }),
      this.prisma.category.count({
        where: { deletedAt: null, status: CategoryStatus.ACTIVE },
      }),
      this.prisma.category.count({
        where: { deletedAt: null, status: CategoryStatus.INACTIVE },
      }),
      this.prisma.subcategory.count({ where: { deletedAt: null } }),
      this.prisma.category.findMany({
        where: { deletedAt: null },
        select: {
          name: true,
          _count: {
            select: { subcategories: { where: { deletedAt: null } } },
          },
        },
        orderBy: {
          subcategories: {
            _count: 'desc',
          },
        },
        take: 5,
      }),
      this.prisma.category.findMany({
        where: { deletedAt: null },
        select: {
          name: true,
          subcategories: {
            where: { deletedAt: null },
            select: {
              _count: {
                select: { products: { where: { deletedAt: null } } },
              },
            },
          },
        },
        take: 10,
      }),
    ]);

    // Calculate product counts per category
    const categoriesWithProducts = categoriesWithProductCounts
      .map((category) => ({
        name: category.name,
        productCount: category.subcategories.reduce(
          (total, sub) => total + sub._count.products,
          0,
        ),
      }))
      .sort((a, b) => b.productCount - a.productCount)
      .slice(0, 5);

    return {
      totalCategories,
      activeCategories,
      inactiveCategories,
      totalSubcategories,
      topCategoriesBySubcategories: categoriesWithSubcategoryCounts.map(
        (cat) => ({
          name: cat.name,
          subcategoryCount: cat._count.subcategories,
        }),
      ),
      topCategoriesByProducts: categoriesWithProducts,
    };
  }

  async removeMany(
    categoryIds: string[],
    userId: string,
  ): Promise<BulkDeleteResultDto> {
    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    // Process each category deletion individually to handle errors gracefully
    for (const categoryId of categoryIds) {
      try {
        // Check if category exists and is not already deleted
        const category = await this.prisma.category.findFirst({
          where: {
            id: categoryId,
            deletedAt: null,
          },
        });

        if (!category) {
          results.push({
            id: categoryId,
            success: false,
            error: 'Category not found or already deleted',
          });
          continue;
        }

        // Check if category has associated subcategories
        const associatedSubcategories = await this.prisma.subcategory.count({
          where: {
            categoryId: categoryId,
            deletedAt: null,
          },
        });

        if (associatedSubcategories > 0) {
          results.push({
            id: categoryId,
            success: false,
            error: `Cannot delete category with ${associatedSubcategories} associated subcategories`,
          });
          continue;
        }

        // Check if category has associated products (through subcategories)
        const associatedProducts = await this.prisma.product.count({
          where: {
            subcategory: {
              categoryId: categoryId,
            },
            deletedAt: null,
          },
        });

        if (associatedProducts > 0) {
          results.push({
            id: categoryId,
            success: false,
            error: `Cannot delete category with ${associatedProducts} associated products`,
          });
          continue;
        }

        // Perform soft delete
        await this.prisma.category.update({
          where: { id: categoryId },
          data: {
            deletedAt: new Date(),
            deletedBy: userId,
          },
        });

        // Invalidate cache
        await this.cacheInvalidationService.invalidateCategory(categoryId);

        results.push({ id: categoryId, success: true });
      } catch (error) {
        results.push({
          id: categoryId,
          success: false,
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    }

    return {
      results,
      totalRequested: categoryIds.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };
  }
}
