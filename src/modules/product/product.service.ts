import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductResponseDto,
} from './dto';
import { PaginatedResponse } from '../../common/dto/paginated-response.dto';
import { StringUtils } from '../../common/utils/string.utils';
import { BarcodeGenerator } from '../../common/utils/barcode.utils';

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditService,
    private readonly cacheInvalidationService: CacheInvalidationService,
  ) {}

  /**
   * Generate product name, SKU, and barcode
   */
  private async generateProductIdentifiers(
    brandId: string,
    variantId: string,
    packSizeId: string,
    packTypeId: string,
  ): Promise<{ name: string; sku: string; barcode: string }> {
    // Get brand, variant, pack size, and pack type names
    const [brand, variant, packSize, packType] = await Promise.all([
      this.prisma.brand.findUnique({
        where: { id: brandId },
        select: { name: true },
      }),
      this.prisma.variant.findUnique({
        where: { id: variantId },
        select: { name: true },
      }),
      this.prisma.packSize.findUnique({
        where: { id: packSizeId },
        select: { name: true },
      }),
      this.prisma.packType.findUnique({
        where: { id: packTypeId },
        select: { name: true },
      }),
    ]);

    if (!brand) {
      throw new BadRequestException('Brand not found');
    }

    if (!variant) {
      throw new BadRequestException('Variant not found');
    }

    if (!packSize) {
      throw new BadRequestException('Pack size not found');
    }

    if (!packType) {
      throw new BadRequestException('Pack type not found');
    }

    // Generate name: "Brand Variant PackSize (PackType)"
    const name = `${brand.name} ${variant.name} ${packSize.name} (${packType.name})`;

    // Generate SKU: "BRAND-VARIANT-PACKSIZE-PACKTYPE"
    const sku = StringUtils.generateSlug(
      `${brand.name}-${variant.name}-${packSize.name}-${packType.name}`,
    ).toUpperCase();

    // Generate EAN-13 barcode
    const barcode = BarcodeGenerator.generateEAN13(
      brand.name,
      variant.name,
      packSize.name,
      packType.name,
    );

    return { name, sku, barcode };
  }

  /**
   * Validate foreign key references and get manufacturerId from brand
   */
  private async validateReferences(
    brandId: string,
    subcategoryId: string,
  ): Promise<{ manufacturerId: string }> {
    const [brand, subcategory] = await Promise.all([
      this.prisma.brand.findUnique({
        where: { id: brandId },
        select: { id: true, manufacturerId: true },
      }),
      this.prisma.subcategory.findUnique({ where: { id: subcategoryId } }),
    ]);

    if (!brand) {
      throw new BadRequestException('Brand not found');
    }
    if (!subcategory) {
      throw new BadRequestException('Subcategory not found');
    }

    return { manufacturerId: brand.manufacturerId };
  }

  /**
   * Validate that variant exists and belongs to the specified brand
   */
  private async validateVariant(
    variantId: string,
    brandId: string,
  ): Promise<void> {
    const variant = await this.prisma.variant.findUnique({
      where: { id: variantId },
      select: { id: true, brandId: true },
    });

    if (!variant) {
      throw new BadRequestException('Variant not found');
    }

    if (variant.brandId !== brandId) {
      throw new BadRequestException(
        'Variant does not belong to the specified brand',
      );
    }
  }

  /**
   * Validate that pack size and pack type exist, are active, and belong to the specified variant
   */
  private async validatePackEntities(
    packSizeId: string,
    packTypeId: string,
    variantId: string,
  ): Promise<void> {
    // Validate pack size
    const packSize = await this.prisma.packSize.findFirst({
      where: {
        id: packSizeId,
        variantId: variantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });

    if (!packSize) {
      throw new BadRequestException(
        'Pack size not found, is not active, or does not belong to the specified variant',
      );
    }

    // Validate pack type
    const packType = await this.prisma.packType.findFirst({
      where: {
        id: packTypeId,
        variantId: variantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });

    if (!packType) {
      throw new BadRequestException(
        'Pack type not found, is not active, or does not belong to the specified variant',
      );
    }
  }

  async create(
    createProductDto: CreateProductDto,
    userId: string,
  ): Promise<ProductResponseDto> {
    const {
      brandId,
      subcategoryId,
      variantId,
      packSizeId,
      packTypeId,
      barcode: providedBarcode,
      ...rest
    } = createProductDto;

    // Validate references and get manufacturerId from brand
    const validation = await this.validateReferences(brandId, subcategoryId);
    const manufacturerId = validation.manufacturerId;

    // Validate that variant exists and belongs to the specified brand
    await this.validateVariant(variantId, brandId);

    // Validate pack entities
    await this.validatePackEntities(packSizeId, packTypeId, variantId);

    // Generate name, SKU, and barcode (if not provided)
    const {
      name,
      sku,
      barcode: generatedBarcode,
    } = await this.generateProductIdentifiers(
      brandId,
      variantId,
      packSizeId,
      packTypeId,
    );

    // Use provided barcode or generated one (but barcode is currently not used in schema)
    const finalBarcode = providedBarcode || generatedBarcode;

    // Validate barcode if provided manually (for future use)
    if (providedBarcode && !BarcodeGenerator.validateEAN13(providedBarcode)) {
      // If it's not a valid EAN-13, check if it might be UPC-A or other format
      if (!/^\d{12,13}$/.test(providedBarcode)) {
        throw new BadRequestException(
          'Invalid barcode format. Must be 12-13 digits.',
        );
      }
    }

    // Check if SKU already exists
    const existingProduct = await this.prisma.product.findUnique({
      where: { sku },
    });

    if (existingProduct) {
      throw new ConflictException(`Product with SKU "${sku}" already exists`);
    }

    try {
      const product = await this.prisma.product.create({
        data: {
          name,
          sku,
          // barcode field removed from schema but generation kept for future
          brandId,
          subcategoryId,
          manufacturerId,
          variantId,
          packSizeId,
          packTypeId,
          ...rest,
          createdBy: userId,
          updatedBy: userId,
          images: rest.images || [],
        },
        include: {
          brand: {
            select: {
              id: true,
              name: true,
              manufacturer: { select: { name: true, id: true } },
            },
          },
          variant: {
            select: { id: true, name: true, description: true },
          },
          subcategory: {
            select: {
              id: true,
              name: true,
              slug: true,
              category: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
          manufacturer: {
            select: { id: true, name: true },
          },
          packSize: {
            select: { id: true, name: true },
          },
          packType: {
            select: { id: true, name: true },
          },
        },
      });

      // Log audit
      await this.auditLog.createAuditLog({
        action: 'CREATE',
        resource: 'product',
        resourceId: product.id,
        userId,
        metadata: {
          productName: name,
          sku,
          brand: product.brand.name,
          subcategory: product.subcategory?.name,
          category: product.subcategory?.category.name,
        },
      });

      // Invalidate product caches
      await this.cacheInvalidationService.invalidateProducts();

      return {
        ...product,
        subcategoryId: product.subcategoryId || undefined,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const field = error.meta?.target as string[];
          throw new ConflictException(
            `Product with ${field?.join(', ')} already exists`,
          );
        }
      }
      throw error;
    }
  }

  async findAll(
    query: ProductQueryDto,
  ): Promise<PaginatedResponse<ProductResponseDto>> {
    const {
      page = 1,
      limit = 10,
      search,
      brandId,
      categoryId,
      variant,
      status,
      includeRelations = true,
    } = query;

    const skip = (page - 1) * limit;

    // Build where conditions
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(status && { status }),
      ...(brandId && { brandId }),
      ...(categoryId && { categoryId }),
      ...(variant && {
        variant: {
          name: { contains: variant, mode: 'insensitive' as const },
        },
      }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { variant: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const include = includeRelations
      ? {
          brand: {
            select: {
              id: true,
              name: true,
              manufacturer: { select: { name: true, id: true } },
            },
          },
          variant: {
            select: { id: true, name: true, description: true },
          },
          subcategory: {
            select: {
              id: true,
              name: true,
              slug: true,
              category: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
          manufacturer: {
            select: { id: true, name: true },
          },
          packSize: {
            select: { id: true, name: true },
          },
          packType: {
            select: { id: true, name: true },
          },
        }
      : undefined;

    const [rawProducts, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include,
        orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    // Transform products to handle null to undefined conversion for optional fields
    const products = rawProducts.map((product) => ({
      ...product,
      subcategoryId: product.subcategoryId || undefined,
    }));

    return new PaginatedResponse(products, page, limit, total);
  }

  async findOne(id: string): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        brand: {
          select: {
            id: true,
            name: true,
            manufacturer: { select: { name: true, id: true } },
          },
        },
        variant: {
          select: { id: true, name: true, description: true },
        },
        subcategory: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        manufacturer: {
          select: { id: true, name: true },
        },
        packSize: {
          select: { id: true, name: true },
        },
        packType: {
          select: { id: true, name: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return {
      ...product,
      subcategoryId: product.subcategoryId || undefined,
    };
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    userId: string,
  ): Promise<ProductResponseDto> {
    // Check if product exists
    const existingProduct = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existingProduct) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const {
      brandId,
      subcategoryId,
      variantId,
      packSizeId,
      packTypeId,
      ...rest
    } = updateProductDto;

    let name: string | undefined;
    let sku: string | undefined;
    let manufacturerId: string | undefined;

    // If any identifier fields are being updated, regenerate name, SKU
    if (brandId || variantId || packSizeId || packTypeId) {
      const finalBrandId = brandId || existingProduct.brandId;
      const finalVariantId = variantId || existingProduct.variantId;
      const finalPackSizeId = packSizeId || existingProduct.packSizeId;
      const finalPackTypeId = packTypeId || existingProduct.packTypeId;

      // Validate references if changed and get manufacturerId from brand if brandId is provided
      if (brandId || subcategoryId) {
        const finalSubcategoryId =
          subcategoryId || existingProduct.subcategoryId;
        if (finalSubcategoryId) {
          const validation = await this.validateReferences(
            finalBrandId,
            finalSubcategoryId,
          );
          if (brandId) {
            manufacturerId = validation.manufacturerId;
          }
        }
      }

      // Validate variant if changed
      if (variantId) {
        await this.validateVariant(variantId, finalBrandId);
      }

      // Validate pack entities if changed
      if (packSizeId || packTypeId) {
        await this.validatePackEntities(
          finalPackSizeId,
          finalPackTypeId,
          finalVariantId,
        );
      }

      const identifiers = await this.generateProductIdentifiers(
        finalBrandId,
        finalVariantId,
        finalPackSizeId,
        finalPackTypeId,
      );

      name = identifiers.name;
      sku = identifiers.sku;

      // Check if new SKU conflicts with existing products (excluding current)
      if (sku !== existingProduct.sku) {
        const existingSkuProduct = await this.prisma.product.findUnique({
          where: { sku },
        });

        if (existingSkuProduct && existingSkuProduct.id !== id) {
          throw new ConflictException(
            `Product with SKU "${sku}" already exists`,
          );
        }
      }
    }

    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(sku && { sku }),
          ...(manufacturerId && { manufacturerId }),
          ...rest,
          updatedBy: userId,
        },
        include: {
          brand: {
            select: {
              id: true,
              name: true,
              manufacturer: { select: { name: true, id: true } },
            },
          },
          variant: {
            select: { id: true, name: true, description: true },
          },
          subcategory: {
            select: {
              id: true,
              name: true,
              slug: true,
              category: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
          manufacturer: {
            select: { id: true, name: true },
          },
          packSize: {
            select: { id: true, name: true },
          },
          packType: {
            select: { id: true, name: true },
          },
        },
      });

      // Log audit
      await this.auditLog.createAuditLog({
        action: 'UPDATE',
        resource: 'product',
        resourceId: product.id,
        userId,
        metadata: {
          productName: product.name,
          sku: product.sku,
          changes: Object.keys(updateProductDto),
        },
      });

      // Invalidate product caches
      await this.cacheInvalidationService.invalidateProduct(id);

      return {
        ...product,
        subcategoryId: product.subcategoryId || undefined,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const field = error.meta?.target as string[];
          throw new ConflictException(
            `Product with ${field?.join(', ')} already exists`,
          );
        }
      }
      throw error;
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    // Check if product exists
    const existingProduct = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existingProduct) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    // Soft delete
    await this.prisma.product.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    // Log audit
    await this.auditLog.createAuditLog({
      action: 'DELETE',
      resource: 'product',
      resourceId: id,
      userId,
      metadata: {
        productName: existingProduct.name,
        sku: existingProduct.sku,
      },
    });

    // Invalidate product caches
    await this.cacheInvalidationService.invalidateProduct(id);
  }

  async activate(id: string, userId: string): Promise<ProductResponseDto> {
    // Check if product exists (including soft deleted ones)
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        brand: { select: { id: true, name: true, deletedAt: true } },
        variant: { select: { id: true, name: true, deletedAt: true } },
        subcategory: { select: { id: true, name: true, deletedAt: true } },
        manufacturer: { select: { id: true, name: true, deletedAt: true } },
        packSize: { select: { id: true, name: true, status: true } },
        packType: { select: { id: true, name: true, status: true } },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    // Check if this is a reactivation from soft delete or status change
    const isDeleted = product.deletedAt !== null;
    const isInactive =
      product.status === 'ARCHIVED' || product.status === 'DRAFT';

    if (!isDeleted && !isInactive) {
      throw new BadRequestException('Product is already active');
    }

    // If reactivating from soft delete, validate relationships
    if (isDeleted) {
      // Check if related entities are active
      if (product.brand.deletedAt) {
        throw new BadRequestException(
          'Cannot reactivate product because its brand is deleted. Reactivate the brand first.',
        );
      }

      if (product.variant.deletedAt) {
        throw new BadRequestException(
          'Cannot reactivate product because its variant is deleted. Reactivate the variant first.',
        );
      }

      if (product.subcategory && product.subcategory.deletedAt) {
        throw new BadRequestException(
          'Cannot reactivate product because its subcategory is deleted. Reactivate the subcategory first.',
        );
      }

      if (product.manufacturer && product.manufacturer.deletedAt) {
        throw new BadRequestException(
          'Cannot reactivate product because its manufacturer is deleted. Reactivate the manufacturer first.',
        );
      }

      if (product.packSize && product.packSize.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Cannot reactivate product because its pack size is not active. Reactivate the pack size first.',
        );
      }

      if (product.packType && product.packType.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Cannot reactivate product because its pack type is not active. Reactivate the pack type first.',
        );
      }

      // Check for SKU conflicts if reactivating from deleted state
      const conflictProduct = await this.prisma.product.findFirst({
        where: {
          sku: { equals: product.sku, mode: 'insensitive' },
          deletedAt: null,
          NOT: { id },
        },
      });

      if (conflictProduct) {
        throw new ConflictException(
          `A product with SKU "${product.sku}" already exists`,
        );
      }
    }

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: {
        status: 'LIVE',
        deletedAt: null,
        deletedBy: null,
        updatedBy: userId,
      },
      include: {
        brand: {
          select: {
            id: true,
            name: true,
            manufacturer: { select: { name: true, id: true } },
          },
        },
        variant: {
          select: { id: true, name: true, description: true },
        },
        subcategory: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        manufacturer: {
          select: { id: true, name: true },
        },
        packSize: {
          select: { id: true, name: true },
        },
        packType: {
          select: { id: true, name: true },
        },
      },
    });

    // Log audit
    await this.auditLog.createAuditLog({
      action: 'ACTIVATE',
      resource: 'product',
      resourceId: id,
      userId,
      metadata: {
        productName: product.name,
        sku: product.sku,
        wasDeleted: isDeleted,
      },
    });

    // Invalidate product caches
    await this.cacheInvalidationService.invalidateProduct(id);

    return {
      ...updatedProduct,
      subcategoryId: updatedProduct.subcategoryId || undefined,
    };
  }

  async deactivate(id: string, userId: string): Promise<ProductResponseDto> {
    const product = await this.findOne(id);

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        updatedBy: userId,
      },
      include: {
        brand: {
          select: {
            id: true,
            name: true,
            manufacturer: { select: { name: true, id: true } },
          },
        },
        variant: {
          select: { id: true, name: true, description: true },
        },
        subcategory: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        manufacturer: {
          select: { id: true, name: true },
        },
        packSize: {
          select: { id: true, name: true },
        },
        packType: {
          select: { id: true, name: true },
        },
      },
    });

    // Log audit
    await this.auditLog.createAuditLog({
      action: 'DEACTIVATE',
      resource: 'product',
      resourceId: id,
      userId,
      metadata: {
        productName: product.name,
        sku: product.sku,
      },
    });

    // Invalidate product caches
    await this.cacheInvalidationService.invalidateProduct(id);

    return {
      ...updatedProduct,
      subcategoryId: updatedProduct.subcategoryId || undefined,
    };
  }
}
