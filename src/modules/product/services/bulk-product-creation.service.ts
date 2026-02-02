import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CSVProductRowDto,
  BulkCreationSummary,
  ProductCreationResult,
  EntityCreationResult,
} from '../dto/bulk-product-creation.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class BulkProductCreationService {
  private readonly logger = new Logger(BulkProductCreationService.name);

  constructor(private prisma: PrismaService) {}

  async createBulkProducts(
    csvData: CSVProductRowDto[],
    userId: string,
  ): Promise<BulkCreationSummary> {
    const summary: BulkCreationSummary = {
      totalRows: csvData.length,
      successfulProducts: 0,
      skippedRows: 0,
      errors: [],
      manufacturersCreated: 0,
      brandsCreated: 0,
      variantsCreated: 0,
      categoriesCreated: 0,
      products: [],
    };

    // Group data to optimize database calls
    const uniqueManufacturers = new Set(
      csvData.map((row) => row.manufacturer.trim()),
    );
    const uniqueBrands = new Set(
      csvData.map((row) => `${row.manufacturer}|${row.brand}`.trim()),
    );
    const uniqueVariants = new Set(
      csvData.map((row) =>
        `${row.manufacturer}|${row.brand}|${row.variant}`.trim(),
      ),
    );
    const uniqueCategories = new Set();

    // Collect categories (major and sub)
    csvData.forEach((row) => {
      uniqueCategories.add(row.major_category.trim());
      if (row.sub_category?.trim()) {
        uniqueCategories.add(
          `${row.major_category}|${row.sub_category}`.trim(),
        );
      }
    });

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          this.logger.log('Starting bulk product creation transaction');

          // Step 1: Create/Get Manufacturers
          const manufacturerMap = new Map<string, string>(); // name -> id
          for (const manufacturerName of uniqueManufacturers) {
            const result = await this.createOrGetManufacturer(
              tx,
              manufacturerName,
              userId,
              csvData,
            );
            manufacturerMap.set(manufacturerName, result.id);
            if (result.isNew) summary.manufacturersCreated++;
          }

          // Step 2: Create/Get Categories (hierarchical)
          const categoryMap = new Map<string, string>(); // name -> id
          const majorCategories = new Set(
            csvData.map((row) => row.major_category.trim()),
          );

          // First create major categories
          for (const categoryName of majorCategories) {
            const result = await this.createOrGetCategory(
              tx,
              categoryName,
              null,
              userId,
              csvData,
            );
            categoryMap.set(categoryName, result.id);
            if (result.isNew) summary.categoriesCreated++;
          }

          // Then create subcategories
          for (const row of csvData) {
            if (row.sub_category?.trim()) {
              const parentId = categoryMap.get(row.major_category.trim());
              const subCategoryKey =
                `${row.major_category}|${row.sub_category}`.trim();

              if (!categoryMap.has(subCategoryKey) && parentId) {
                const result = await this.createOrGetCategory(
                  tx,
                  row.sub_category.trim(),
                  parentId,
                  userId,
                  csvData,
                );
                categoryMap.set(subCategoryKey, result.id);
                if (result.isNew) summary.categoriesCreated++;
              }
            }
          }

          // Step 3: Create/Get Brands
          const brandMap = new Map<string, string>(); // manufacturer|brand -> id
          for (const brandKey of uniqueBrands) {
            const [manufacturerName, brandName] = brandKey.split('|');
            const manufacturerId = manufacturerMap.get(manufacturerName);

            if (manufacturerId) {
              const result = await this.createOrGetBrand(
                tx,
                brandName,
                manufacturerId,
                userId,
                csvData,
              );
              brandMap.set(brandKey, result.id);
              if (result.isNew) summary.brandsCreated++;
            }
          }

          // Step 4: Create/Get Variants
          const variantMap = new Map<string, string>(); // manufacturer|brand|variant -> id
          for (const variantKey of uniqueVariants) {
            const [manufacturerName, brandName, variantName] =
              variantKey.split('|');
            const brandKey = `${manufacturerName}|${brandName}`;
            const brandId = brandMap.get(brandKey);

            if (brandId) {
              const result = await this.createOrGetVariant(
                tx,
                variantName,
                brandId,
                userId,
                csvData,
              );
              variantMap.set(variantKey, result.id);
              if (result.isNew) summary.variantsCreated++;
            }
          }

          // Step 5: Create Products
          for (const [index, row] of csvData.entries()) {
            try {
              const manufacturerId = manufacturerMap.get(
                row.manufacturer.trim(),
              );
              const brandKey = `${row.manufacturer}|${row.brand}`.trim();
              const brandId = brandMap.get(brandKey);
              const variantKey =
                `${row.manufacturer}|${row.brand}|${row.variant}`.trim();
              const variantId = variantMap.get(variantKey);

              // Determine category ID (use subcategory if exists, otherwise major category)
              let categoryId: string | undefined;
              if (row.sub_category?.trim()) {
                const subCategoryKey =
                  `${row.major_category}|${row.sub_category}`.trim();
                categoryId = categoryMap.get(subCategoryKey);
              } else {
                categoryId = categoryMap.get(row.major_category.trim());
              }

              // Validate all required IDs are present
              if (!manufacturerId || !brandId || !variantId || !categoryId) {
                throw new Error('Missing required entity dependencies');
              }

              const productResult = await this.createProduct(
                tx,
                {
                  brandId,
                  variantId,
                  categoryId,
                  manufacturerId,
                  packSize: row.pack_size.trim(),
                  packagingType: row.pack_type.trim(),
                  price: row.price,
                  discount: row.discount,
                  description: row.product_description?.trim(),
                  thumbnail: row.product_thumbnail?.trim(),
                  images:
                    row.product_images
                      ?.trim()
                      ?.split(',')
                      .map((url) => url.trim())
                      .filter(Boolean) || [],
                },
                userId,
              );

              summary.products.push(productResult);
              summary.successfulProducts++;
            } catch (error) {
              const errorMessage = `Row ${index + 1}: ${error.message}`;
              summary.errors.push(errorMessage);
              summary.skippedRows++;
              this.logger.error(errorMessage);
            }
          }

          this.logger.log(
            `Bulk creation completed: ${summary.successfulProducts} products created`,
          );
          return summary;
        },
        {
          timeout: 120000, // 2 minutes timeout for large bulk operations
        },
      );
    } catch (error) {
      this.logger.error('Bulk product creation failed', error);
      throw new BadRequestException(`Bulk creation failed: ${error.message}`);
    }
  }

  private async createOrGetManufacturer(
    tx: Prisma.TransactionClient,
    name: string,
    userId: string,
    csvData: CSVProductRowDto[],
  ): Promise<EntityCreationResult> {
    // Check if manufacturer already exists
    const existing = await tx.manufacturer.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
      },
    });

    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        isNew: false,
      };
    }

    // Create new manufacturer
    const manufacturer = await tx.manufacturer.create({
      data: {
        name,
        status: 'ACTIVE',
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return {
      id: manufacturer.id,
      name: manufacturer.name,
      isNew: true,
    };
  }

  private async createOrGetCategory(
    tx: Prisma.TransactionClient,
    name: string,
    parentId: string | null,
    userId: string,
    csvData: CSVProductRowDto[],
  ): Promise<EntityCreationResult> {
    // Check if category already exists
    const existing = await tx.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        parentId,
        deletedAt: null,
      },
    });

    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        isNew: false,
      };
    }

    // Get appropriate description based on category type
    let description: string | undefined;
    if (parentId) {
      // This is a sub-category, look for sub_category_description
      const csvRow = csvData.find(
        (row) => row.sub_category?.trim().toLowerCase() === name.toLowerCase(),
      );
      description = csvRow?.sub_category_description?.trim();
    } else {
      // This is a major category, look for major_category_description
      const csvRow = csvData.find(
        (row) => row.major_category.trim().toLowerCase() === name.toLowerCase(),
      );
      description = csvRow?.major_category_description?.trim();
    }

    // Create slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();

    // Ensure slug uniqueness
    let finalSlug = slug;
    let counter = 1;
    while (await tx.category.findFirst({ where: { slug: finalSlug } })) {
      finalSlug = `${slug}-${counter}`;
      counter++;
    }

    // Create new category
    const category = await tx.category.create({
      data: {
        name,
        slug: finalSlug,
        description,
        parentId,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return {
      id: category.id,
      name: category.name,
      isNew: true,
    };
  }

  private async createOrGetBrand(
    tx: Prisma.TransactionClient,
    name: string,
    manufacturerId: string,
    userId: string,
    csvData: CSVProductRowDto[],
  ): Promise<EntityCreationResult> {
    // Check if brand already exists
    const existing = await tx.brand.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        manufacturerId,
        deletedAt: null,
      },
    });

    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        isNew: false,
      };
    }

    // Create new brand
    const brand = await tx.brand.create({
      data: {
        name,
        manufacturerId,
        status: 'ACTIVE',
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return {
      id: brand.id,
      name: brand.name,
      isNew: true,
    };
  }

  private async createOrGetVariant(
    tx: Prisma.TransactionClient,
    name: string,
    brandId: string,
    userId: string,
    csvData: CSVProductRowDto[],
  ): Promise<EntityCreationResult> {
    // Check if variant already exists
    const existing = await tx.variant.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        brandId,
        deletedAt: null,
      },
    });

    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        isNew: false,
      };
    }

    // Create new variant
    const variant = await tx.variant.create({
      data: {
        name,
        brandId,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return {
      id: variant.id,
      name: variant.name,
      isNew: true,
    };
  }

  private async createProduct(
    tx: Prisma.TransactionClient,
    data: {
      brandId: string;
      variantId: string;
      categoryId: string;
      manufacturerId: string;
      packSize: string;
      packagingType: string;
      price?: number;
      discount?: number;
      description?: string;
      thumbnail?: string;
      images?: string[];
    },
    userId: string,
  ): Promise<ProductCreationResult> {
    // Get related entities for name generation
    const [brand, variant] = await Promise.all([
      tx.brand.findUnique({ where: { id: data.brandId } }),
      tx.variant.findUnique({ where: { id: data.variantId } }),
    ]);

    if (!brand || !variant) {
      throw new Error('Brand or Variant not found');
    }

    // Generate product name and SKU
    const productName = `${brand.name} ${variant.name} ${data.packSize} (${data.packagingType})`;
    const sku = `${brand.name.replace(/\s+/g, '').toUpperCase()}-${variant.name.replace(/\s+/g, '').toUpperCase()}-${data.packSize.replace(/\s+/g, '').toUpperCase()}-${data.packagingType.replace(/\s+/g, '').toUpperCase()}`;

    // Check if product with same SKU already exists
    const existingProduct = await tx.product.findFirst({
      where: { sku: { equals: sku, mode: 'insensitive' }, deletedAt: null },
    });

    if (existingProduct) {
      throw new Error(`Product with SKU ${sku} already exists`);
    }

    // Create product
    const product = await tx.product.create({
      data: {
        name: productName,
        sku,
        description: data.description,
        brandId: data.brandId,
        variantId: data.variantId,
        categoryId: data.categoryId,
        manufacturerId: data.manufacturerId,
        packSize: data.packSize,
        packagingType: data.packagingType,
        price: data.price || null,
        discount: data.discount || null,
        thumbnail: data.thumbnail,
        images: data.images || [],
        status: 'QUEUE',
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      price: product.price ? Number(product.price) : undefined,
      discount: product.discount ? Number(product.discount) : undefined,
      isNew: true,
    };
  }
}
