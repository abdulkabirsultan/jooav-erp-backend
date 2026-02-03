import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { SubcategoryStatus, CategoryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';
import { StringUtils } from '../../common/utils/helpers.utils';
import {
  CreateSubcategoryDto,
  UpdateSubcategoryDto,
  SubcategoryQueryDto,
  SubcategoryResponseDto,
  SubcategoryStatsDto,
} from './dto';
import {
  PaginatedResponse,
  PaginationMeta,
} from '../../common/dto/paginated-response.dto';

@Injectable()
export class SubcategoryService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private cacheInvalidationService: CacheInvalidationService,
  ) {}

  /**
   * Generates URL-friendly slug from subcategory name
   */
  private generateSlug(name: string): string {
    return StringUtils.slugify(name.trim());
  }

  /**
   * Sanitizes subcategory name for storage
   */
  private sanitizeSubcategoryName(name: string): string {
    return StringUtils.titleCase(name.trim());
  }

  async create(
    createSubcategoryDto: CreateSubcategoryDto,
    userId: string,
  ): Promise<SubcategoryResponseDto> {
    const { name, description, categoryId } = createSubcategoryDto;

    // Sanitize and validate
    const sanitizedName = this.sanitizeSubcategoryName(name);
    const slug = this.generateSlug(sanitizedName);

    // Check if category exists
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }

    // Check for existing subcategory with same name in the same category
    const existingSubcategory = await this.prisma.subcategory.findFirst({
      where: {
        OR: [
          { name: { equals: sanitizedName, mode: 'insensitive' } },
          { slug },
        ],
        categoryId,
        deletedAt: null,
      },
    });

    if (existingSubcategory) {
      throw new ConflictException(
        `Subcategory with name "${sanitizedName}" already exists in this category`,
      );
    }

    const subcategory = await this.prisma.subcategory.create({
      data: {
        name: sanitizedName,
        slug,
        description: description?.trim(),
        categoryId,
        createdBy: userId,
        updatedBy: userId,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
          },
        },
        _count: {
          select: { products: { where: { deletedAt: null } } },
        },
      },
    });

    // Fetch all subcategories in the same category (including the newly created one)
    const allSubcategoriesInCategory = await this.prisma.subcategory.findMany({
      where: {
        categoryId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        _count: {
          select: { products: { where: { deletedAt: null } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Invalidate subcategory cache
    await this.cacheInvalidationService.invalidateSubcategory(subcategory.id);

    return {
      id: subcategory.id,
      name: subcategory.name,
      description: subcategory.description,
      slug: subcategory.slug,
      status: subcategory.status,
      categoryId: subcategory.categoryId,
      category: {
        id: subcategory.category.id,
        name: subcategory.category.name,
        slug: subcategory.category.slug,
        description: subcategory.category.description,
        subcategories: allSubcategoriesInCategory.map((sub) => ({
          id: sub.id,
          name: sub.name,
          slug: sub.slug,
          description: sub.description,
          productCount: sub._count.products,
        })),
      },
      productCount: subcategory._count.products,
      createdAt: subcategory.createdAt,
      updatedAt: subcategory.updatedAt,
      createdBy: subcategory.createdBy,
      updatedBy: subcategory.updatedBy,
    };
  }

  async findAll(
    query: SubcategoryQueryDto,
  ): Promise<PaginatedResponse<SubcategoryResponseDto>> {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      categoryId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeCategory = true,
      includeProductCount = true,
      includeAuditInfo = false,
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.SubcategoryWhereInput = {
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(status && { status }),
      ...(categoryId && { categoryId }),
    };

    const orderBy: Prisma.SubcategoryOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    // Build dynamic include object
    const include: Prisma.SubcategoryInclude = {};

    if (includeCategory) {
      include.category = {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          deletedAt: true, // Include to check if parent is deleted
        },
      };
    }

    if (includeProductCount) {
      include._count = {
        select: { products: { where: { deletedAt: null } } },
      };
    }

    const [subcategories, total] = await Promise.all([
      this.prisma.subcategory.findMany({
        where,
        include,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.subcategory.count({ where }),
    ]);

    // Filter out subcategories with deleted parent categories
    const validSubcategories = subcategories.filter(
      (subcategory) =>
        !includeCategory ||
        !subcategory.category ||
        subcategory.category.deletedAt === null,
    );

    // Get unique category IDs from the results
    const categoryIds = [
      ...new Set(validSubcategories.map((sub) => sub.categoryId)),
    ];

    // Fetch all subcategories for these categories in one query
    const allSubcategoriesByCategory = includeCategory
      ? await this.prisma.subcategory.findMany({
          where: {
            categoryId: { in: categoryIds },
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            categoryId: true,
            _count: {
              select: { products: { where: { deletedAt: null } } },
            },
          },
          orderBy: { name: 'asc' },
        })
      : [];

    // Group subcategories by category ID
    const subcategoriesByCategory = allSubcategoriesByCategory.reduce(
      (acc, sub) => {
        if (!acc[sub.categoryId]) {
          acc[sub.categoryId] = [];
        }
        acc[sub.categoryId].push({
          id: sub.id,
          name: sub.name,
          slug: sub.slug,
          description: sub.description,
          productCount: sub._count.products,
        });
        return acc;
      },
      {} as Record<string, any[]>,
    );

    const data = validSubcategories.map(
      (subcategory): SubcategoryResponseDto => ({
        id: subcategory.id,
        name: subcategory.name,
        description: subcategory.description,
        slug: subcategory.slug,
        status: subcategory.status,
        categoryId: subcategory.categoryId,
        category:
          includeCategory && subcategory.category
            ? {
                id: subcategory.category.id,
                name: subcategory.category.name,
                slug: subcategory.category.slug,
                description: subcategory.category.description,
                subcategories:
                  subcategoriesByCategory[subcategory.categoryId] || [],
              }
            : {
                id: '',
                name: '',
                slug: '',
                description: null,
                subcategories: [],
              },
        productCount:
          includeProductCount && subcategory._count
            ? subcategory._count.products
            : 0,
        createdAt: subcategory.createdAt,
        updatedAt: subcategory.updatedAt,
        createdBy: subcategory.createdBy,
        updatedBy: subcategory.updatedBy,
      }),
    );

    return {
      data,
      meta: new PaginationMeta(page, limit, data.length), // Use actual filtered count for accurate pagination
    };
  }

  async findOne(id: string): Promise<SubcategoryResponseDto> {
    const subcategory = await this.prisma.subcategory.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            deletedAt: true, // Include deletedAt to check if parent is deleted
          },
        },
        _count: {
          select: { products: { where: { deletedAt: null } } },
        },
      },
    });

    if (!subcategory) {
      throw new NotFoundException(`Subcategory with ID ${id} not found`);
    }

    // Check if parent category is deleted
    if (subcategory.category.deletedAt !== null) {
      throw new NotFoundException(
        `Subcategory with ID ${id} not found (parent category is deleted)`,
      );
    }

    // Fetch all subcategories in the same category
    const allSubcategoriesInCategory = await this.prisma.subcategory.findMany({
      where: {
        categoryId: subcategory.categoryId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        _count: {
          select: { products: { where: { deletedAt: null } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      id: subcategory.id,
      name: subcategory.name,
      description: subcategory.description,
      slug: subcategory.slug,
      status: subcategory.status,
      categoryId: subcategory.categoryId,
      category: {
        id: subcategory.category.id,
        name: subcategory.category.name,
        slug: subcategory.category.slug,
        description: subcategory.category.description,
        subcategories: allSubcategoriesInCategory.map((sub) => ({
          id: sub.id,
          name: sub.name,
          slug: sub.slug,
          description: sub.description,
          productCount: sub._count.products,
        })),
      },
      productCount: subcategory._count.products,
      createdAt: subcategory.createdAt,
      updatedAt: subcategory.updatedAt,
      createdBy: subcategory.createdBy,
      updatedBy: subcategory.updatedBy,
    };
  }

  async findByCategory(categoryId: string): Promise<SubcategoryResponseDto[]> {
    // First validate that the category exists
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }

    const subcategories = await this.prisma.subcategory.findMany({
      where: {
        categoryId,
        deletedAt: null,
        // Include both ACTIVE and INACTIVE subcategories, exclude only deleted ones
        // status filter should be handled at application level, not database level for GET operations
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
          },
        },
        _count: {
          select: { products: { where: { deletedAt: null } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Create the subcategory list for the category field (all subcategories in this category)
    const allSubcategoriesInCategory = subcategories.map((sub) => ({
      id: sub.id,
      name: sub.name,
      slug: sub.slug,
      description: sub.description,
      productCount: sub._count.products,
    }));

    return subcategories.map((subcategory) => ({
      id: subcategory.id,
      name: subcategory.name,
      description: subcategory.description,
      slug: subcategory.slug,
      status: subcategory.status,
      categoryId: subcategory.categoryId,
      category: {
        id: subcategory.category.id,
        name: subcategory.category.name,
        slug: subcategory.category.slug,
        description: subcategory.category.description,
        subcategories: allSubcategoriesInCategory,
      },
      productCount: subcategory._count.products,
      createdAt: subcategory.createdAt,
      updatedAt: subcategory.updatedAt,
      createdBy: subcategory.createdBy,
      updatedBy: subcategory.updatedBy,
    }));
  }

  async update(
    id: string,
    updateSubcategoryDto: UpdateSubcategoryDto,
    userId: string,
  ): Promise<SubcategoryResponseDto> {
    const { name, description, status, categoryId } = updateSubcategoryDto;

    // Check if subcategory exists
    const existingSubcategory = await this.findOne(id);

    // Prepare update data
    const updateData: any = {
      updatedBy: userId,
    };

    // Handle name update
    if (name && name !== existingSubcategory.name) {
      const sanitizedName = this.sanitizeSubcategoryName(name);
      const slug = this.generateSlug(sanitizedName);

      // Check for conflicts in the same category
      const targetCategoryId = categoryId || existingSubcategory.categoryId;
      const conflictSubcategory = await this.prisma.subcategory.findFirst({
        where: {
          OR: [
            { name: { equals: sanitizedName, mode: 'insensitive' } },
            { slug },
          ],
          categoryId: targetCategoryId,
          deletedAt: null,
          NOT: { id },
        },
      });

      if (conflictSubcategory) {
        throw new ConflictException(
          `Subcategory with name "${sanitizedName}" already exists in this category`,
        );
      }

      updateData.name = sanitizedName;
      updateData.slug = slug;
    }

    // Handle category change
    if (categoryId && categoryId !== existingSubcategory.categoryId) {
      const newCategory = await this.prisma.category.findFirst({
        where: { id: categoryId, deletedAt: null },
      });

      if (!newCategory) {
        throw new NotFoundException(`Category with ID ${categoryId} not found`);
      }

      updateData.categoryId = categoryId;
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    const updatedSubcategory = await this.prisma.subcategory.update({
      where: { id },
      data: updateData,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
          },
        },
        _count: {
          select: { products: { where: { deletedAt: null } } },
        },
      },
    });

    // Fetch all subcategories in the same category
    const allSubcategoriesInCategory = await this.prisma.subcategory.findMany({
      where: {
        categoryId: updatedSubcategory.categoryId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        _count: {
          select: { products: { where: { deletedAt: null } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Invalidate subcategory cache
    await this.cacheInvalidationService.invalidateSubcategory(id);

    return {
      id: updatedSubcategory.id,
      name: updatedSubcategory.name,
      description: updatedSubcategory.description,
      slug: updatedSubcategory.slug,
      status: updatedSubcategory.status,
      categoryId: updatedSubcategory.categoryId,
      category: {
        id: updatedSubcategory.category.id,
        name: updatedSubcategory.category.name,
        slug: updatedSubcategory.category.slug,
        description: updatedSubcategory.category.description,
        subcategories: allSubcategoriesInCategory.map((sub) => ({
          id: sub.id,
          name: sub.name,
          slug: sub.slug,
          description: sub.description,
          productCount: sub._count.products,
        })),
      },
      productCount: updatedSubcategory._count.products,
      createdAt: updatedSubcategory.createdAt,
      updatedAt: updatedSubcategory.updatedAt,
      createdBy: updatedSubcategory.createdBy,
      updatedBy: updatedSubcategory.updatedBy,
    };
  }

  async remove(id: string, userId: string): Promise<{ message: string }> {
    // Check if subcategory exists
    const subcategory = await this.prisma.subcategory.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: {
          select: { name: true },
        },
      },
    });

    if (!subcategory) {
      throw new NotFoundException('Subcategory not found');
    }

    // Check for active products in this subcategory using direct database query
    const activeProductsCount = await this.prisma.product.count({
      where: {
        subcategoryId: id,
        deletedAt: null,
      },
    });

    if (activeProductsCount > 0) {
      throw new BadRequestException(
        `Cannot delete subcategory with ${activeProductsCount} product(s). Please move or delete products first.`,
      );
    }

    // Soft delete the subcategory with status update
    await this.prisma.subcategory.update({
      where: { id },
      data: {
        status: SubcategoryStatus.INACTIVE,
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    // Log audit trail
    await this.auditService.createAuditLog({
      action: 'DELETE',
      resource: 'Subcategory',
      resourceId: id,
      userId,
      metadata: {
        subcategoryName: subcategory.name,
        categoryName: subcategory.category.name,
        productCount: activeProductsCount,
      },
    });

    // Invalidate subcategory cache
    await this.cacheInvalidationService.invalidateSubcategory(id);

    return { message: 'Subcategory deleted successfully' };
  }

  async activate(id: string, userId: string): Promise<SubcategoryResponseDto> {
    // Check if subcategory exists in deleted state
    const deletedSubcategory = await this.prisma.subcategory.findFirst({
      where: { id, deletedAt: { not: null } },
    });

    if (!deletedSubcategory) {
      throw new NotFoundException(
        'Subcategory not found or is not in deleted state',
      );
    }

    // Check if parent category still exists
    const category = await this.prisma.category.findFirst({
      where: { id: deletedSubcategory.categoryId, deletedAt: null },
    });

    if (!category) {
      throw new BadRequestException(
        'Cannot reactivate subcategory: parent category no longer exists',
      );
    }

    // Check for name conflicts with active subcategories in the same category
    const conflictSubcategory = await this.prisma.subcategory.findFirst({
      where: {
        OR: [
          { name: { equals: deletedSubcategory.name, mode: 'insensitive' } },
          { slug: deletedSubcategory.slug },
        ],
        categoryId: deletedSubcategory.categoryId,
        deletedAt: null,
        NOT: { id },
      },
    });

    if (conflictSubcategory) {
      throw new ConflictException(
        `A subcategory with name \"${deletedSubcategory.name}\" already exists in this category`,
      );
    }

    // Reactivate the subcategory
    const reactivatedSubcategory = await this.prisma.subcategory.update({
      where: { id },
      data: {
        deletedAt: null,
        status: SubcategoryStatus.ACTIVE,
        updatedBy: userId,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
          },
        },
        _count: {
          select: { products: { where: { deletedAt: null } } },
        },
      },
    });

    // Invalidate subcategory cache
    await this.cacheInvalidationService.invalidateSubcategory(id);

    // Log audit trail
    await this.auditService.createAuditLog({
      action: 'ACTIVATE',
      resource: 'Subcategory',
      resourceId: id,
      userId,
      metadata: {
        subcategoryName: reactivatedSubcategory.name,
        categoryName: reactivatedSubcategory.category.name,
        productCount: reactivatedSubcategory._count.products,
      },
    });

    return {
      id: reactivatedSubcategory.id,
      name: reactivatedSubcategory.name,
      description: reactivatedSubcategory.description,
      slug: reactivatedSubcategory.slug,
      status: reactivatedSubcategory.status,
      categoryId: reactivatedSubcategory.categoryId,
      category: {
        id: reactivatedSubcategory.category.id,
        name: reactivatedSubcategory.category.name,
        slug: reactivatedSubcategory.category.slug,
        description: reactivatedSubcategory.category.description,
      },
      productCount: reactivatedSubcategory._count.products,
      createdAt: reactivatedSubcategory.createdAt,
      updatedAt: reactivatedSubcategory.updatedAt,
      createdBy: reactivatedSubcategory.createdBy,
      updatedBy: reactivatedSubcategory.updatedBy,
    };
  }

  async getStats(): Promise<SubcategoryStatsDto> {
    const [
      totalSubcategories,
      activeSubcategories,
      inactiveSubcategories,
      totalProducts,
      topSubcategoriesByProducts,
      subcategoryDistribution,
    ] = await Promise.all([
      this.prisma.subcategory.count({ where: { deletedAt: null } }),
      this.prisma.subcategory.count({
        where: { deletedAt: null, status: SubcategoryStatus.ACTIVE },
      }),
      this.prisma.subcategory.count({
        where: { deletedAt: null, status: SubcategoryStatus.INACTIVE },
      }),
      this.prisma.product.count({ where: { deletedAt: null } }),
      this.prisma.subcategory.findMany({
        where: { deletedAt: null },
        select: {
          name: true,
          _count: {
            select: { products: { where: { deletedAt: null } } },
          },
        },
        orderBy: {
          products: {
            _count: 'desc',
          },
        },
        take: 5,
      }),
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
        take: 10,
      }),
    ]);

    return {
      totalSubcategories,
      activeSubcategories,
      inactiveSubcategories,
      totalProducts,
      topSubcategoriesByProducts: topSubcategoriesByProducts.map((sub) => ({
        name: sub.name,
        productCount: sub._count.products,
      })),
      subcategoryDistribution: subcategoryDistribution.map((cat) => ({
        categoryName: cat.name,
        subcategoryCount: cat._count.subcategories,
      })),
    };
  }
}
