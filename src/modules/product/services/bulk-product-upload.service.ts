import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../storage/cloudinary.service';
import { CacheInvalidationService } from '../../cache/cache-invalidation.service';
import { AuditService } from '../../audit/audit.service';
import { StringUtils } from '../../../common/utils/helpers.utils';
import {
  ProductUploadRowDto,
  BulkUploadResultDto,
  RowResultDto,
  EntityActionDto,
} from '../dto';

interface ParsedRow {
  rowNumber: number;
  data: Record<string, string>;
}

interface EntityCache {
  manufacturers: Map<string, { id: string; name: string }>;
  brands: Map<string, { id: string; name: string; manufacturerId: string }>;
  categories: Map<string, { id: string; name: string }>;
  subcategories: Map<string, { id: string; name: string; categoryId: string }>;
  variants: Map<string, { id: string; name: string; brandId: string }>;
  packSizes: Map<string, { id: string; name: string; variantId: string }>;
  packTypes: Map<string, { id: string; name: string; variantId: string }>;
}

@Injectable()
export class BulkProductUploadService {
  private readonly logger = new Logger(BulkProductUploadService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private cacheInvalidationService: CacheInvalidationService,
    private auditService: AuditService,
  ) {}

  /**
   * Process CSV file upload for bulk product creation
   */
  async processUpload(
    file: Express.Multer.File,
    userId: string,
  ): Promise<BulkUploadResultDto> {
    const startTime = Date.now();

    this.logger.log(`Starting bulk upload process for user ${userId}`);

    try {
      // Parse CSV file
      const rows = await this.parseCSV(file.buffer);

      // Initialize result tracking
      const result: BulkUploadResultDto = {
        totalRows: rows.length,
        successfulRows: 0,
        failedRows: 0,
        processingTimeMs: 0,
        entitiesCreated: {
          manufacturers: 0,
          brands: 0,
          categories: 0,
          subcategories: 0,
          variants: 0,
          packSizes: 0,
          packTypes: 0,
          products: 0,
        },
        entitiesReferenced: {
          manufacturers: 0,
          brands: 0,
          categories: 0,
          subcategories: 0,
          variants: 0,
          packSizes: 0,
          packTypes: 0,
        },
        rowResults: [],
        summary: '',
      };

      // Initialize entity cache for performance
      const entityCache: EntityCache = {
        manufacturers: new Map(),
        brands: new Map(),
        categories: new Map(),
        subcategories: new Map(),
        variants: new Map(),
        packSizes: new Map(),
        packTypes: new Map(),
      };

      // Process each row
      for (const row of rows) {
        try {
          const rowResult = await this.processRow(
            row,
            userId,
            entityCache,
            result,
          );
          result.rowResults.push(rowResult);

          if (rowResult.success) {
            result.successfulRows++;
          } else {
            result.failedRows++;
          }
        } catch (error) {
          result.failedRows++;
          result.rowResults.push({
            rowNumber: row.rowNumber,
            success: false,
            error: error.message || 'Unknown error occurred',
            warnings: [],
            createdEntities: [],
            referencedEntities: [],
          });
        }
      }

      // Calculate processing time
      result.processingTimeMs = Date.now() - startTime;

      // Generate summary
      result.summary = this.generateSummary(result);

      // Invalidate caches if any products were created
      if (result.successfulRows > 0) {
        await this.cacheInvalidationService.invalidateProducts();
      }

      // Log audit
      await this.auditService.createAuditLog({
        action: 'BULK_UPLOAD',
        resource: 'product',
        resourceId: undefined,
        userId,
        metadata: {
          totalRows: result.totalRows,
          successfulRows: result.successfulRows,
          failedRows: result.failedRows,
          processingTimeMs: result.processingTimeMs,
        },
      });

      this.logger.log(
        `Bulk upload completed: ${result.successfulRows}/${result.totalRows} products created`,
      );

      return result;
    } catch (error) {
      this.logger.error('Bulk upload failed', error);
      throw new BadRequestException(`Bulk upload failed: ${error.message}`);
    }
  }

  /**
   * Parse CSV file buffer into structured rows
   */
  private async parseCSV(buffer: Buffer): Promise<ParsedRow[]> {
    return new Promise((resolve, reject) => {
      const results: ParsedRow[] = [];
      let rowNumber = 0;

      const stream = Readable.from(buffer.toString())
        .pipe(csvParser())
        .on('data', (data) => {
          rowNumber++;
          results.push({
            rowNumber,
            data: this.normalizeRowData(data),
          });
        })
        .on('end', () => {
          resolve(results);
        })
        .on('error', (error) => {
          reject(
            new BadRequestException(`CSV parsing failed: ${error.message}`),
          );
        });
    });
  }

  /**
   * Normalize row data - trim whitespace and handle empty strings
   */
  private normalizeRowData(
    data: Record<string, string>,
  ): Record<string, string> {
    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      const trimmedKey = key.trim().toLowerCase();
      const trimmedValue = typeof value === 'string' ? value.trim() : '';
      normalized[trimmedKey] = trimmedValue || '';
    }

    return normalized;
  }

  /**
   * Process a single row from the CSV
   */
  private async processRow(
    row: ParsedRow,
    userId: string,
    entityCache: EntityCache,
    stats: BulkUploadResultDto,
  ): Promise<RowResultDto> {
    const result: RowResultDto = {
      rowNumber: row.rowNumber,
      success: false,
      warnings: [],
      createdEntities: [],
      referencedEntities: [],
    };

    try {
      // Validate required fields
      const validationError = this.validateRowData(row.data);
      if (validationError) {
        result.error = validationError;
        return result;
      }

      // Convert to DTO for validation
      const productData = this.mapRowToProductData(row.data);

      // Process entity hierarchy
      const manufacturer = await this.findOrCreateManufacturer(
        productData.manufacturer,
        userId,
        entityCache,
        result,
        stats,
      );

      const brand = await this.findOrCreateBrand(
        productData.brand,
        productData.brand_logo,
        manufacturer!.id,
        userId,
        entityCache,
        result,
        stats,
      );

      const category = await this.findOrCreateCategory(
        productData.category,
        productData.category_description,
        userId,
        entityCache,
        result,
        stats,
      );

      let subcategory: any = null;
      if (productData.subcategory) {
        subcategory = await this.findOrCreateSubcategory(
          productData.subcategory,
          productData.subcategory_description,
          category!.id,
          userId,
          entityCache,
          result,
          stats,
        );
      }

      const variant = await this.findOrCreateVariant(
        productData.variant,
        brand!.id,
        userId,
        entityCache,
        result,
        stats,
      );

      const packSize = await this.findOrCreatePackSize(
        productData.pack_size,
        variant!.id,
        userId,
        entityCache,
        result,
        stats,
      );

      const packType = await this.findOrCreatePackType(
        productData.pack_type,
        variant!.id,
        userId,
        entityCache,
        result,
        stats,
      );

      // Generate SKU
      const sku = this.generateSKU(
        brand!.name,
        variant!.name,
        packSize!.name,
        packType!.name,
      );

      // Check for existing product with same name or SKU
      const existingProduct = await this.prisma.product.findFirst({
        where: {
          OR: [{ name: productData.product_name }, { sku: sku }],
          deletedAt: null,
        },
      });

      if (existingProduct) {
        result.error = `Product with name "${productData.product_name}" or SKU "${sku}" already exists`;
        return result;
      }

      // Prepare product images
      const images: string[] = (() => {
        if (Array.isArray(productData.product_images)) {
          return productData.product_images;
        }
        if (typeof productData.product_images === 'string') {
          return (productData.product_images as string)
            .split(',')
            .map((url) => url.trim())
            .filter((url) => url);
        }
        return [];
      })();

      // Create product
      const product = await this.prisma.product.create({
        data: {
          name: productData.product_name,
          description: productData.product_description,
          sku: sku,
          price: productData.price
            ? new Prisma.Decimal(productData.price)
            : null,
          discount: productData.discount
            ? new Prisma.Decimal(productData.discount)
            : null,
          status: 'QUEUE', // Default as specified
          images: images,
          thumbnail: productData.product_thumbnail,
          brandId: brand!.id,
          variantId: variant!.id,
          subcategoryId: subcategory?.id,
          manufacturerId: manufacturer!.id,
          packSizeId: packSize!.id,
          packTypeId: packType!.id,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      // Update stats
      stats.entitiesCreated.products++;

      // Set success result
      result.success = true;
      result.productId = product.id;
      result.productName = product.name;
      result.generatedSku = sku;

      // Add warnings if applicable
      if (!productData.price) {
        if (!result.warnings) result.warnings = [];
        result.warnings.push('Price not provided - can be set later');
      }
      if (!productData.product_description) {
        if (!result.warnings) result.warnings = [];
        result.warnings.push('Product description not provided');
      }

      return result;
    } catch (error) {
      result.error = error.message || 'Unknown error occurred';
      return result;
    }
  }

  /**
   * Validate required fields in row data
   */
  private validateRowData(data: Record<string, string>): string | null {
    const required = [
      'product_name',
      'manufacturer',
      'brand',
      'variant',
      'category',
      'pack_size',
      'pack_type',
    ];

    for (const field of required) {
      if (!data[field]) {
        return `Missing required field: ${field}`;
      }
    }

    // Validate price if provided
    if (data.price && (isNaN(Number(data.price)) || Number(data.price) < 0)) {
      return 'Invalid price value';
    }

    // Validate discount if provided
    if (
      data.discount &&
      (isNaN(Number(data.discount)) ||
        Number(data.discount) < 0 ||
        Number(data.discount) > 100)
    ) {
      return 'Invalid discount value (must be 0-100)';
    }

    return null;
  }

  /**
   * Map CSV row data to ProductUploadRowDto
   */
  private mapRowToProductData(
    data: Record<string, string>,
  ): ProductUploadRowDto {
    return {
      product_name: data.product_name,
      product_description: data.product_description,
      price: data.price ? Number(data.price) : undefined,
      discount: data.discount ? Number(data.discount) : undefined,
      manufacturer: data.manufacturer,
      brand: data.brand,
      brand_logo: data.brand_logo,
      variant: data.variant,
      category: data.category,
      category_description: data.category_description,
      subcategory: data.subcategory,
      subcategory_description: data.subcategory_description,
      pack_size: data.pack_size,
      pack_type: data.pack_type,
      product_images: data.product_images
        ? data.product_images
            .split(',')
            .map((url) => url.trim())
            .filter((url) => url)
        : undefined,
      product_thumbnail: data.product_thumbnail,
    };
  }

  // ... (Continue with entity creation methods in next part)

  /**
   * Find or create manufacturer
   */
  private async findOrCreateManufacturer(
    name: string,
    userId: string,
    cache: EntityCache,
    result: RowResultDto,
    stats: BulkUploadResultDto,
  ) {
    const normalizedName = StringUtils.normalizeName(name);
    const cacheKey = normalizedName;

    // Check cache first
    if (cache.manufacturers.has(cacheKey)) {
      const cached = cache.manufacturers.get(cacheKey);
      result.referencedEntities.push({
        type: 'manufacturer',
        id: cached!.id,
        name: cached!.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.manufacturers++;
      return cached;
    }

    // Check database
    let manufacturer = await this.prisma.manufacturer.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
    });

    if (!manufacturer) {
      // Create new manufacturer
      try {
        manufacturer = await this.prisma.manufacturer.create({
          data: {
            name: name,
            status: 'ACTIVE',
            createdBy: userId,
            updatedBy: userId,
          },
        });

        result.createdEntities.push({
          type: 'manufacturer',
          id: manufacturer.id,
          name: manufacturer.name,
          action: 'created',
        });
        stats.entitiesCreated.manufacturers++;
      } catch (error) {
        // Handle unique constraint violation (race condition)
        if (error.code === 'P2002') {
          manufacturer = await this.prisma.manufacturer.findFirst({
            where: {
              name: { equals: name, mode: 'insensitive' },
              deletedAt: null,
            },
          });
          if (!manufacturer) {
            throw error;
          }
          result.referencedEntities.push({
            type: 'manufacturer',
            id: manufacturer.id,
            name: manufacturer.name,
            action: 'referenced',
          });
          stats.entitiesReferenced.manufacturers++;
        } else {
          throw error;
        }
      }
    } else {
      result.referencedEntities.push({
        type: 'manufacturer',
        id: manufacturer.id,
        name: manufacturer.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.manufacturers++;
    }

    // Cache result
    cache.manufacturers.set(cacheKey, {
      id: manufacturer.id,
      name: manufacturer.name,
    });

    return manufacturer;
  }

  /**
   * Find or create brand
   */
  private async findOrCreateBrand(
    name: string,
    logo: string | undefined,
    manufacturerId: string,
    userId: string,
    cache: EntityCache,
    result: RowResultDto,
    stats: BulkUploadResultDto,
  ) {
    const normalizedName = StringUtils.normalizeName(name);
    const cacheKey = `${manufacturerId}:${normalizedName}`;

    // Check cache first
    if (cache.brands.has(cacheKey)) {
      const cached = cache.brands.get(cacheKey);
      result.referencedEntities.push({
        type: 'brand',
        id: cached!.id,
        name: cached!.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.brands++;
      return cached;
    }

    // Check database
    let brand = await this.prisma.brand.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        manufacturerId,
        deletedAt: null,
      },
    });

    if (!brand) {
      // Create new brand
      try {
        brand = await this.prisma.brand.create({
          data: {
            name: name,
            logo: logo,
            manufacturerId,
            status: 'ACTIVE',
            createdBy: userId,
            updatedBy: userId,
          },
        });
      } catch (error) {
        // Handle unique constraint violation (race condition)
        if (error.code === 'P2002') {
          brand = await this.prisma.brand.findFirst({
            where: {
              name: { equals: name, mode: 'insensitive' },
              manufacturerId,
              deletedAt: null,
            },
          });
          if (!brand) {
            throw error;
          }
        } else {
          throw error;
        }
      }

      result.createdEntities.push({
        type: 'brand',
        id: brand.id,
        name: brand.name,
        action: 'created',
      });
      stats.entitiesCreated.brands++;
    } else {
      // Update logo if provided and different
      if (logo && brand.logo !== logo) {
        await this.prisma.brand.update({
          where: { id: brand.id },
          data: { logo: logo, updatedBy: userId },
        });
      }

      result.referencedEntities.push({
        type: 'brand',
        id: brand.id,
        name: brand.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.brands++;
    }

    // Cache result
    cache.brands.set(cacheKey, {
      id: brand.id,
      name: brand.name,
      manufacturerId,
    });

    return brand;
  }

  /**
   * Find or create category
   */
  private async findOrCreateCategory(
    name: string,
    description: string | undefined,
    userId: string,
    cache: EntityCache,
    result: RowResultDto,
    stats: BulkUploadResultDto,
  ) {
    const normalizedName = StringUtils.normalizeName(name);
    const cacheKey = normalizedName;

    // Check cache first
    if (cache.categories.has(cacheKey)) {
      const cached = cache.categories.get(cacheKey);
      result.referencedEntities.push({
        type: 'category',
        id: cached!.id,
        name: cached!.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.categories++;
      return cached;
    }

    // Check database
    let category = await this.prisma.category.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
    });

    if (!category) {
      // Create new category
      try {
        category = await this.prisma.category.create({
          data: {
            name: name,
            description: description,
            slug: StringUtils.generateSlug(name),
            status: 'ACTIVE',
            createdBy: userId,
            updatedBy: userId,
          },
        });

        result.createdEntities.push({
          type: 'category',
          id: category.id,
          name: category.name,
          action: 'created',
        });
        stats.entitiesCreated.categories++;
      } catch (error) {
        // Handle unique constraint violation (race condition)
        if (error.code === 'P2002') {
          category = await this.prisma.category.findFirst({
            where: {
              name: { equals: name, mode: 'insensitive' },
              deletedAt: null,
            },
          });
          if (!category) {
            throw error;
          }
          result.referencedEntities.push({
            type: 'category',
            id: category.id,
            name: category.name,
            action: 'referenced',
          });
          stats.entitiesReferenced.categories++;
        } else {
          throw error;
        }
      }
    } else {
      result.referencedEntities.push({
        type: 'category',
        id: category.id,
        name: category.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.categories++;
    }

    // Cache result
    cache.categories.set(cacheKey, {
      id: category.id,
      name: category.name,
    });

    return category;
  }

  /**
   * Find or create subcategory
   */
  private async findOrCreateSubcategory(
    name: string,
    description: string | undefined,
    categoryId: string,
    userId: string,
    cache: EntityCache,
    result: RowResultDto,
    stats: BulkUploadResultDto,
  ) {
    const normalizedName = StringUtils.normalizeName(name);
    const cacheKey = `${categoryId}:${normalizedName}`;

    // Check cache first
    if (cache.subcategories.has(cacheKey)) {
      const cached = cache.subcategories.get(cacheKey);
      result.referencedEntities.push({
        type: 'subcategory',
        id: cached!.id,
        name: cached!.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.subcategories++;
      return cached;
    }

    // Check database
    let subcategory = await this.prisma.subcategory.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        categoryId,
        deletedAt: null,
      },
    });

    if (!subcategory) {
      // Create new subcategory
      try {
        subcategory = await this.prisma.subcategory.create({
          data: {
            name: name,
            description: description,
            slug: StringUtils.generateSlug(name),
            categoryId,
            status: 'ACTIVE',
            createdBy: userId,
            updatedBy: userId,
          },
        });
      } catch (error) {
        // Handle unique constraint violation (race condition)
        if (error.code === 'P2002') {
          // Try to find the subcategory that was created by another process
          subcategory = await this.prisma.subcategory.findFirst({
            where: {
              name: { equals: name, mode: 'insensitive' },
              categoryId,
              deletedAt: null,
            },
          });
          if (!subcategory) {
            throw error; // Re-throw if we still can't find it
          }
        } else {
          throw error;
        }
      }

      result.createdEntities.push({
        type: 'subcategory',
        id: subcategory.id,
        name: subcategory.name,
        action: 'created',
      });
      stats.entitiesCreated.subcategories++;
    } else {
      result.referencedEntities.push({
        type: 'subcategory',
        id: subcategory.id,
        name: subcategory.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.subcategories++;
    }

    // Cache result
    cache.subcategories.set(cacheKey, {
      id: subcategory.id,
      name: subcategory.name,
      categoryId,
    });

    return subcategory;
  }

  /**
   * Find or create variant
   */
  private async findOrCreateVariant(
    name: string,
    brandId: string,
    userId: string,
    cache: EntityCache,
    result: RowResultDto,
    stats: BulkUploadResultDto,
  ) {
    const normalizedName = StringUtils.normalizeName(name);
    const cacheKey = `${brandId}:${normalizedName}`;

    // Check cache first
    if (cache.variants.has(cacheKey)) {
      const cached = cache.variants.get(cacheKey);
      result.referencedEntities.push({
        type: 'variant',
        id: cached!.id,
        name: cached!.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.variants++;
      return cached;
    }

    // Check database
    let variant = await this.prisma.variant.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        brandId,
        deletedAt: null,
      },
    });

    if (!variant) {
      // Create new variant
      variant = await this.prisma.variant.create({
        data: {
          name: name,
          brandId,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      result.createdEntities.push({
        type: 'variant',
        id: variant.id,
        name: variant.name,
        action: 'created',
      });
      stats.entitiesCreated.variants++;
    } else {
      result.referencedEntities.push({
        type: 'variant',
        id: variant.id,
        name: variant.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.variants++;
    }

    // Cache result
    cache.variants.set(cacheKey, {
      id: variant.id,
      name: variant.name,
      brandId,
    });

    return variant;
  }

  /**
   * Find or create pack size
   */
  private async findOrCreatePackSize(
    name: string,
    variantId: string,
    userId: string,
    cache: EntityCache,
    result: RowResultDto,
    stats: BulkUploadResultDto,
  ) {
    const normalizedName = StringUtils.normalizeName(name);
    const cacheKey = `${variantId}:${normalizedName}`;

    // Check cache first
    if (cache.packSizes.has(cacheKey)) {
      const cached = cache.packSizes.get(cacheKey);
      result.referencedEntities.push({
        type: 'packSize',
        id: cached!.id,
        name: cached!.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.packSizes++;
      return cached;
    }

    // Check database
    let packSize = await this.prisma.packSize.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        variantId,
        deletedAt: null,
      },
    });

    if (!packSize) {
      // Create new pack size
      packSize = await this.prisma.packSize.create({
        data: {
          name: name,
          variantId,
          status: 'ACTIVE',
          createdBy: userId,
          updatedBy: userId,
        },
      });

      result.createdEntities.push({
        type: 'packSize',
        id: packSize.id,
        name: packSize.name,
        action: 'created',
      });
      stats.entitiesCreated.packSizes++;
    } else {
      result.referencedEntities.push({
        type: 'packSize',
        id: packSize.id,
        name: packSize.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.packSizes++;
    }

    // Cache result
    cache.packSizes.set(cacheKey, {
      id: packSize.id,
      name: packSize.name,
      variantId,
    });

    return packSize;
  }

  /**
   * Find or create pack type
   */
  private async findOrCreatePackType(
    name: string,
    variantId: string,
    userId: string,
    cache: EntityCache,
    result: RowResultDto,
    stats: BulkUploadResultDto,
  ) {
    const normalizedName = StringUtils.normalizeName(name);
    const cacheKey = `${variantId}:${normalizedName}`;

    // Check cache first
    if (cache.packTypes.has(cacheKey)) {
      const cached = cache.packTypes.get(cacheKey);
      result.referencedEntities.push({
        type: 'packType',
        id: cached!.id,
        name: cached!.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.packTypes++;
      return cached;
    }

    // Check database
    let packType = await this.prisma.packType.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        variantId,
        deletedAt: null,
      },
    });

    if (!packType) {
      // Create new pack type
      packType = await this.prisma.packType.create({
        data: {
          name: name,
          variantId,
          status: 'ACTIVE',
          createdBy: userId,
          updatedBy: userId,
        },
      });

      result.createdEntities.push({
        type: 'packType',
        id: packType.id,
        name: packType.name,
        action: 'created',
      });
      stats.entitiesCreated.packTypes++;
    } else {
      result.referencedEntities.push({
        type: 'packType',
        id: packType.id,
        name: packType.name,
        action: 'referenced',
      });
      stats.entitiesReferenced.packTypes++;
    }

    // Cache result
    cache.packTypes.set(cacheKey, {
      id: packType.id,
      name: packType.name,
      variantId,
    });

    return packType;
  }

  /**
   * Generate SKU from brand, variant, pack size, and pack type
   */
  private generateSKU(
    brandName: string,
    variantName: string,
    packSizeName: string,
    packTypeName: string,
  ): string {
    const normalizedBrand = StringUtils.normalizeForSKU(brandName);
    const normalizedVariant = StringUtils.normalizeForSKU(variantName);
    const normalizedPackSize = StringUtils.normalizeForSKU(packSizeName);
    const normalizedPackType = StringUtils.normalizeForSKU(packTypeName);

    return `${normalizedBrand}-${normalizedVariant}-${normalizedPackSize}-${normalizedPackType}`;
  }

  /**
   * Generate summary message
   */
  private generateSummary(result: BulkUploadResultDto): string {
    const { successfulRows, failedRows, totalRows } = result;

    let summary = `Bulk upload completed: ${successfulRows}/${totalRows} products created successfully`;

    if (failedRows > 0) {
      summary += `, ${failedRows} failed`;
    }

    const totalCreated = Object.values(result.entitiesCreated).reduce(
      (sum, count) => sum + count,
      0,
    );
    const totalReferenced = Object.values(result.entitiesReferenced).reduce(
      (sum, count) => sum + count,
      0,
    );

    if (totalCreated > 0) {
      summary += `. Created ${totalCreated} new entities`;
    }

    if (totalReferenced > 0) {
      summary += `, referenced ${totalReferenced} existing entities`;
    }

    return summary;
  }

  /**
   * Generate CSV template for download
   */
  generateTemplate(): string {
    const headers = [
      'product_name',
      'product_description',
      'price',
      'discount',
      'manufacturer',
      'brand',
      'brand_logo',
      'variant',
      'category',
      'category_description',
      'subcategory',
      'subcategory_description',
      'pack_size',
      'pack_type',
      'product_images',
      'product_thumbnail',
    ];

    const sampleRows = [
      [
        'Coca Cola Original',
        'Classic cola with original taste',
        '2.50',
        '10',
        'The Coca-Cola Company',
        'Coca Cola',
        'https://example.com/coca-cola-logo.png',
        'Original',
        'Beverages',
        'Non-alcoholic drinks',
        'Soft Drinks',
        'Carbonated beverages',
        '500ml',
        'Bottle',
        'https://example.com/product1.jpg,https://example.com/product2.jpg',
        'https://example.com/thumbnail.jpg',
      ],
      [
        'Pepsi Max',
        'Zero calorie cola drink',
        '2.30',
        '5',
        'PepsiCo',
        'Pepsi',
        '',
        'Max',
        'Beverages',
        'Non-alcoholic drinks',
        'Soft Drinks',
        'Zero calorie carbonated beverages',
        '330ml',
        'Can',
        '',
        '',
      ],
    ];

    let csv = headers.join(',') + '\n';

    sampleRows.forEach((row) => {
      csv += row.map((field) => `"${field}"`).join(',') + '\n';
    });

    return csv;
  }
}
