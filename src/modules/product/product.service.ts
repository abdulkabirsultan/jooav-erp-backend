import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';
import { CacheService } from '../cache/cache.service';
import { CloudinaryService } from '../storage/cloudinary.service';
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
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private auditLog: AuditService,
    private cacheInvalidationService: CacheInvalidationService,
    private cacheService: CacheService,
  ) {}

  /**
   * Generate product SKU and barcode only
   */
  private async generateProductIdentifiers(
    brandId: string,
    variantId: string,
    packSizeId: string,
    packTypeId: string,
  ): Promise<{ sku: string; barcode: string }> {
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

    return { sku, barcode };
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
      name,
      brandId,
      subcategoryId,
      variantId,
      packSizeId,
      packTypeId,
      barcode: providedBarcode,
      images,
      thumbnail,
      ...rest
    } = createProductDto;

    // Validate references and get manufacturerId from brand
    const validation = await this.validateReferences(brandId, subcategoryId);
    const manufacturerId = validation.manufacturerId;

    // Validate that variant exists and belongs to the specified brand
    await this.validateVariant(variantId, brandId);

    // Validate pack entities
    await this.validatePackEntities(packSizeId, packTypeId, variantId);

    // Generate SKU and barcode (name is provided by user)
    const { sku, barcode: generatedBarcode } =
      await this.generateProductIdentifiers(
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

    // Check if product name already exists
    const existingProductByName = await this.prisma.product.findFirst({
      where: {
        name,
        deletedAt: null,
      },
    });

    if (existingProductByName) {
      throw new ConflictException(`Product with name "${name}" already exists`);
    }

    // Check if SKU already exists
    const existingProduct = await this.prisma.product.findUnique({
      where: { sku },
    });

    if (existingProduct) {
      throw new ConflictException(`Product with SKU "${sku}" already exists`);
    }
    // Handle file uploads
    let uploadedImageUrls: string[] = [];
    let uploadedThumbnailUrl: string | undefined = undefined;

    try {
      // Upload images to Cloudinary
      if (images && Array.isArray(images) && images.length > 0) {
        const imageUploads = await this.cloudinaryService.uploadMultipleFiles(
          images,
          {
            folder: 'products/images',
            tags: ['product', 'image'],
          },
        );
        uploadedImageUrls = imageUploads.map((upload) => upload.secureUrl);
      }

      // Upload thumbnail to Cloudinary
      if (thumbnail) {
        const thumbnailUpload = await this.cloudinaryService.uploadFile(
          thumbnail.buffer,
          {
            folder: 'products/thumbnails',
            tags: ['product', 'thumbnail'],
            transformation: [
              { width: 300, height: 300, crop: 'fill', quality: 'auto' },
            ],
          },
        );
        uploadedThumbnailUrl = thumbnailUpload.secureUrl;
      }
    } catch (error) {
      throw new BadRequestException(`File upload failed: ${error.message}`);
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
          images: uploadedImageUrls,
          thumbnail: uploadedThumbnailUrl,
          createdBy: userId,
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
      await this.cacheService.invalidateByTag('products');

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
      name,
      brandId,
      subcategoryId,
      variantId,
      packSizeId,
      packTypeId,
      createImages,
      deleteImages,
      thumbnail,
      deleteThumbnail,
      ...rest
    } = updateProductDto;

    let sku: string | undefined;
    let manufacturerId: string | undefined;

    // Check if name is unique (if being updated)
    if (name && name !== existingProduct.name) {
      const existingProductByName = await this.prisma.product.findFirst({
        where: {
          name,
          id: { not: id }, // Exclude current product
          deletedAt: null,
        },
      });

      if (existingProductByName) {
        throw new ConflictException(
          `Product with name "${name}" already exists`,
        );
      }
    }

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

    // Handle image operations
    let updatedImages = [...existingProduct.images] as string[];
    let updatedThumbnail = existingProduct.thumbnail;

    try {
      // Delete specified images from Cloudinary and remove from array
      if (deleteImages && deleteImages.length > 0) {
        // Validate deleteImages array
        const validDeleteImages = deleteImages.filter((url) => {
          if (!url || typeof url !== 'string') {
            this.logger.warn('Invalid image URL provided for deletion', {
              invalidUrl: url,
              productId: id,
            });
            return false;
          }

          // Check if URL exists in current product images
          if (!existingProduct.images.includes(url)) {
            this.logger.warn('URL not found in product images', {
              url,
              productId: id,
            });
            return false;
          }

          return true;
        });

        if (validDeleteImages.length > 0) {
          const deleteResult =
            await this.cloudinaryService.deleteFilesByUrls(validDeleteImages);

          // Log any deletion errors but don't fail the whole operation
          if (
            deleteResult.errors &&
            Object.keys(deleteResult.errors).length > 0
          ) {
            this.logger.warn('Some images failed to delete from Cloudinary', {
              errors: deleteResult.errors,
              productId: id,
            });
          }

          // Remove successfully deleted images from the array
          const successfullyDeleted = Object.keys(deleteResult.deleted || {});
          if (successfullyDeleted.length > 0) {
            // Map public IDs back to URLs for filtering
            const deletedUrls = validDeleteImages.filter((url) => {
              const publicId =
                this.cloudinaryService.extractPublicIdFromUrl(url);
              return successfullyDeleted.includes(publicId);
            });

            updatedImages = updatedImages.filter(
              (url) => !deletedUrls.includes(url),
            );

            this.logger.log('Successfully deleted images from Cloudinary', {
              deletedCount: deletedUrls.length,
              deletedUrls,
              productId: id,
            });
          }
        } else {
          this.logger.warn('No valid images to delete', {
            providedUrls: deleteImages,
            productId: id,
          });
        }
      }

      // Upload new images and add to array
      if (createImages && createImages.length > 0) {
        const imageUploads = await this.cloudinaryService.uploadMultipleFiles(
          createImages,
          {
            folder: 'products/images',
            tags: ['product', 'image'],
          },
        );
        const newImageUrls = imageUploads.map((upload) => upload.secureUrl);
        updatedImages = [...updatedImages, ...newImageUrls];
      }

      // Handle thumbnail operations
      if (deleteThumbnail && existingProduct.thumbnail) {
        await this.cloudinaryService.deleteFilesByUrls([
          existingProduct.thumbnail,
        ]);
        updatedThumbnail = null;
      }

      if (thumbnail) {
        // If there's an existing thumbnail and we're uploading a new one, delete the old one
        if (existingProduct.thumbnail) {
          await this.cloudinaryService.deleteFilesByUrls([
            existingProduct.thumbnail,
          ]);
        }

        const thumbnailUpload = await this.cloudinaryService.uploadFile(
          thumbnail.buffer,
          {
            folder: 'products/thumbnails',
            tags: ['product', 'thumbnail'],
            transformation: [
              { width: 300, height: 300, crop: 'fill', quality: 'auto' },
            ],
          },
        );
        updatedThumbnail = thumbnailUpload.secureUrl;
      }
    } catch (error) {
      throw new BadRequestException(`File operation failed: ${error.message}`);
    }

    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(sku && { sku }),
          ...(manufacturerId && { manufacturerId }),
          ...rest,
          images: updatedImages,
          thumbnail: updatedThumbnail,
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
      await this.invalidateProductCaches(id, product);

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

    // Invalidate caches using smart tag-based invalidation
    await this.invalidateProductCaches(id, existingProduct);
  }

  async removeMany(
    productIds: string[],
    userId: string,
  ): Promise<{
    deletedCount: number;
    deletedIds: string[];
    failedIds: Array<{ id: string; error: string }>;
  }> {
    const deletedIds: string[] = [];
    const failedIds: Array<{ id: string; error: string }> = [];

    // Process each product ID
    for (const productId of productIds) {
      try {
        // Check if product exists
        const existingProduct = await this.prisma.product.findFirst({
          where: { id: productId, deletedAt: null },
        });

        if (!existingProduct) {
          failedIds.push({ id: productId, error: 'Product not found' });
          continue;
        }

        // Soft delete the product
        await this.prisma.product.update({
          where: { id: productId },
          data: {
            status: 'ARCHIVED',
            deletedAt: new Date(),
            deletedBy: userId,
          },
        });

        // Log audit for each product
        await this.auditLog.createAuditLog({
          action: 'BULK_DELETE',
          resource: 'product',
          resourceId: productId,
          userId,
          metadata: {
            productName: existingProduct.name,
            sku: existingProduct.sku,
            bulkOperation: true,
          },
        });

        // Invalidate caches using tags
        await this.invalidateProductCaches(productId, existingProduct);

        deletedIds.push(productId);
      } catch (error) {
        this.logger.error(`Failed to delete product ${productId}`, error);
        failedIds.push({
          id: productId,
          error: error.message || 'Unknown error occurred',
        });
      }
    }

    // Immediately invalidate ALL product-related caches for bulk operations
    await this.cacheService.invalidateByTag('products');

    return {
      deletedCount: deletedIds.length,
      deletedIds,
      failedIds,
    };
  }

  async updateManyStatus(
    productIds: string[],
    status: 'DRAFT' | 'QUEUE' | 'LIVE' | 'ARCHIVED',
    userId: string,
  ): Promise<{
    updatedCount: number;
    updatedIds: string[];
    failedIds: Array<{ id: string; error: string }>;
  }> {
    const updatedIds: string[] = [];
    const failedIds: Array<{ id: string; error: string }> = [];

    // Process each product ID
    for (const productId of productIds) {
      try {
        // Check if product exists
        const existingProduct = await this.prisma.product.findFirst({
          where: { id: productId, deletedAt: null },
        });

        if (!existingProduct) {
          failedIds.push({ id: productId, error: 'Product not found' });
          continue;
        }

        // Update the product status
        await this.prisma.product.update({
          where: { id: productId },
          data: {
            status,
            updatedBy: userId,
            updatedAt: new Date(),
          },
        });

        // Log audit for each product
        await this.auditLog.createAuditLog({
          action: 'BULK_UPDATE_STATUS',
          resource: 'product',
          resourceId: productId,
          userId,
          metadata: {
            productName: existingProduct.name,
            sku: existingProduct.sku,
            oldStatus: existingProduct.status,
            newStatus: status,
            bulkOperation: true,
          },
        });

        // Invalidate caches using tags
        await this.invalidateProductCaches(productId, {
          ...existingProduct,
          status,
        });

        updatedIds.push(productId);
      } catch (error) {
        this.logger.error(
          `Failed to update product status ${productId}`,
          error,
        );
        failedIds.push({
          id: productId,
          error: error.message || 'Unknown error occurred',
        });
      }
    }

    // Immediately invalidate ALL product-related caches for bulk operations
    await this.cacheService.invalidateByTag('products');

    return {
      updatedCount: updatedIds.length,
      updatedIds,
      failedIds,
    };
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

  /**
   * Get product statistics
   */
  async getProductStats(): Promise<{
    totalProducts: number;
    totalVariants: number;
    drafts: number;
    archived: number;
  }> {
    const [totalProducts, totalVariants, drafts, archived] = await Promise.all([
      this.prisma.product.count({
        where: { deletedAt: null },
      }),
      this.prisma.variant.count({
        where: { deletedAt: null },
      }),
      this.prisma.product.count({
        where: {
          deletedAt: null,
          status: 'DRAFT',
        },
      }),
      this.prisma.product.count({
        where: {
          deletedAt: null,
          status: 'ARCHIVED',
        },
      }),
    ]);

    return {
      totalProducts,
      totalVariants,
      drafts,
      archived,
    };
  }

  /**
   * Smart cache invalidation based on product properties
   */
  private async invalidateProductCaches(
    productId: string,
    product: any,
  ): Promise<void> {
    try {
      // Always invalidate the specific product cache
      await this.cacheService.invalidateByTag(`product:${productId}`);

      // Invalidate general product lists
      await this.cacheService.invalidateByTag('products');

      // Invalidate brand-specific caches if product has brand
      if (product.brandId) {
        await this.cacheService.invalidateByTag(`brand:${product.brandId}`);
      }

      // Invalidate category-specific caches
      if (product.subcategoryId) {
        await this.cacheService.invalidateByTag(
          `subcategory:${product.subcategoryId}`,
        );

        // Get category from subcategory to invalidate category caches too
        const subcategory = await this.prisma.subcategory.findUnique({
          where: { id: product.subcategoryId },
          select: { categoryId: true },
        });
        if (subcategory?.categoryId) {
          await this.cacheService.invalidateByTag(
            `category:${subcategory.categoryId}`,
          );
        }
      }

      // Invalidate status-specific caches
      if (product.status) {
        await this.cacheService.invalidateByTag(`status:${product.status}`);
      }

      // Invalidate variant-specific caches
      if (product.variantId) {
        await this.cacheService.invalidateByTag(`variant:${product.variantId}`);
      }

      this.logger.debug(
        `Invalidated smart cache tags for product ${productId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error invalidating caches for product ${productId}:`,
        error,
      );
    }
  }
}
