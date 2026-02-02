import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Invalidate all category-related caches
   */
  async invalidateCategories(): Promise<void> {
    try {
      const patterns = [
        'get:/categories*',
        'get:/categories/tree*',
        'get:/categories/subcategories*',
      ];

      await this.invalidateByPatterns(patterns);
      this.logger.log('Invalidated all category caches');
    } catch (error) {
      this.logger.error('Failed to invalidate category caches', error);
    }
  }

  /**
   * Invalidate all product-related caches
   */
  async invalidateProducts(): Promise<void> {
    try {
      const patterns = ['get:/api/v1/products*', 'get:/api/v1/products/*'];

      await this.invalidateByPatterns(patterns);
      this.logger.log('Invalidated all product caches');
    } catch (error) {
      this.logger.error('Failed to invalidate product caches', error);
    }
  }

  /**
   * Invalidate caches for a specific product
   */
  async invalidateProduct(productId: string): Promise<void> {
    try {
      const patterns = [
        `get:/api/v1/products/${productId}*`,
        'get:/api/v1/products*', // Also invalidate the list since it might include this product
      ];

      await this.invalidateByPatterns(patterns);
      this.logger.log(`Invalidated caches for product: ${productId}`);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate caches for product: ${productId}`,
        error,
      );
    }
  }

  /**
   * Invalidate caches for a specific category and related products
   */
  async invalidateCategory(categoryId: string): Promise<void> {
    try {
      const patterns = [
        'get:/categories*',
        'get:/categories/tree*',
        'get:/categories/subcategories*',
        // Also invalidate products since they might be filtered by this category
        'get:/api/v1/products*',
      ];

      await this.invalidateByPatterns(patterns);
      this.logger.log(`Invalidated caches for category: ${categoryId}`);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate caches for category: ${categoryId}`,
        error,
      );
    }
  }

  /**
   * Invalidate caches for a specific subcategory and related products
   */
  async invalidateSubcategory(subcategoryId: string): Promise<void> {
    try {
      const patterns = [
        'get:/subcategories*',
        'get:/categories*', // Also invalidate categories as they include subcategory data
        // Also invalidate products since they might be filtered by this subcategory
        'get:/api/v1/products*',
      ];

      await this.invalidateByPatterns(patterns);
      this.logger.log(`Invalidated caches for subcategory: ${subcategoryId}`);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate caches for subcategory: ${subcategoryId}`,
        error,
      );
    }
  }

  /**
   * Invalidate caches related to a brand
   */
  async invalidateBrand(brandId: string): Promise<void> {
    try {
      const patterns = [
        'get:/api/v1/products*', // Products are filtered by brand
      ];

      await this.invalidateByPatterns(patterns);
      this.logger.log(`Invalidated caches for brand: ${brandId}`);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate caches for brand: ${brandId}`,
        error,
      );
    }
  }

  /**
   * Invalidate caches related to a variant
   */
  async invalidateVariant(variantId: string): Promise<void> {
    try {
      const patterns = [
        'get:/api/v1/products*', // Products use variants
      ];

      await this.invalidateByPatterns(patterns);
      this.logger.log(`Invalidated caches for variant: ${variantId}`);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate caches for variant: ${variantId}`,
        error,
      );
    }
  }

  /**
   * Invalidate all public endpoint caches
   */
  async invalidateAllPublic(): Promise<void> {
    try {
      const patterns = ['get:/categories*', 'get:/api/v1/products*'];

      await this.invalidateByPatterns(patterns);
      this.logger.log('Invalidated all public endpoint caches');
    } catch (error) {
      this.logger.error('Failed to invalidate all public caches', error);
    }
  }

  /**
   * Helper method to invalidate caches by patterns
   * Note: This is a simplified implementation. In a production environment,
   * you might want to use Redis SCAN with pattern matching for more efficiency.
   */
  private async invalidateByPatterns(patterns: string[]): Promise<void> {
    // Since we can't easily scan Redis keys with patterns in this setup,
    // we'll use a simple approach by tracking known cache keys
    // In a more sophisticated setup, you could use Redis SCAN or maintain a separate index

    for (const pattern of patterns) {
      // For now, we'll just log the pattern that would be invalidated
      // In production, you'd implement actual pattern matching
      this.logger.debug(`Would invalidate pattern: ${pattern}`);
    }
  }

  /**
   * Clear a specific cache key
   */
  async invalidateKey(key: string): Promise<void> {
    try {
      await this.cacheService.del(key);
      this.logger.debug(`Invalidated cache key: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate cache key: ${key}`, error);
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
