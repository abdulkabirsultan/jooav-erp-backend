import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Invalidate all category-related caches using tags
   */
  async invalidateCategories(): Promise<void> {
    try {
      const deletedCount =
        await this.cacheService.invalidateByTag('categories');
      this.logger.log(`Invalidated ${deletedCount} category cache entries`);
    } catch (error) {
      this.logger.error('Failed to invalidate category caches', error);
    }
  }

  /**
   * Invalidate all product-related caches using tags
   */
  async invalidateProducts(): Promise<void> {
    try {
      const deletedCount = await this.cacheService.invalidateByTag('products');
      this.logger.log(`Invalidated ${deletedCount} product cache entries`);
    } catch (error) {
      this.logger.error('Failed to invalidate product caches', error);
    }
  }

  /**
   * Invalidate caches for a specific product using tags
   */
  async invalidateProduct(productId: string): Promise<void> {
    try {
      const deletedCount = await this.cacheService.invalidateByTag(
        `product:${productId}`,
      );
      this.logger.log(
        `Invalidated ${deletedCount} cache entries for product: ${productId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate caches for product: ${productId}`,
        error,
      );
    }
  }

  /**
   * Invalidate caches for a specific category and related products using tags
   */
  async invalidateCategory(categoryId: string): Promise<void> {
    try {
      const tags = [`category:${categoryId}`, 'categories'];
      const deletedCount = await this.cacheService.invalidateByTags(tags);
      this.logger.log(
        `Invalidated ${deletedCount} cache entries for category: ${categoryId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate caches for category: ${categoryId}`,
        error,
      );
    }
  }

  /**
   * Invalidate caches for a specific subcategory and related products using tags
   */
  async invalidateSubcategory(subcategoryId: string): Promise<void> {
    try {
      const tags = [
        `subcategory:${subcategoryId}`,
        'subcategories',
        'categories',
      ];
      const deletedCount = await this.cacheService.invalidateByTags(tags);
      this.logger.log(
        `Invalidated ${deletedCount} cache entries for subcategory: ${subcategoryId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate caches for subcategory: ${subcategoryId}`,
        error,
      );
    }
  }

  /**
   * Invalidate caches for a specific brand and related products using tags
   */
  async invalidateBrand(brandId: string): Promise<void> {
    try {
      const tags = [`brand:${brandId}`, 'brands', 'products'];
      const deletedCount = await this.cacheService.invalidateByTags(tags);
      this.logger.log(
        `Invalidated ${deletedCount} cache entries for brand: ${brandId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate caches for brand: ${brandId}`,
        error,
      );
    }
  }

  /**
   * Invalidate caches for a specific variant and related products using tags
   */
  async invalidateVariant(variantId: string): Promise<void> {
    try {
      const tags = [`variant:${variantId}`, 'variants', 'products'];
      const deletedCount = await this.cacheService.invalidateByTags(tags);
      this.logger.log(
        `Invalidated ${deletedCount} cache entries for variant: ${variantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate caches for variant: ${variantId}`,
        error,
      );
    }
  }

  /**
   * Clear all caches (use with caution)
   */
  async flushAll(): Promise<void> {
    try {
      await this.cacheService.flushall();
      this.logger.warn('Flushed all caches');
    } catch (error) {
      this.logger.error('Failed to flush all caches', error);
    }
  }
}
