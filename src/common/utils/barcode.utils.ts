/**
 * Barcode generation utilities for FMCG ERP system
 * Supports EAN-13 and UPC-A barcode generation
 */

/**
 * Generate a valid EAN-13 barcode
 * EAN-13 consists of:
 * - 3 digits: Country code (e.g., 890 for India, 615 for Nigeria)
 * - 4-6 digits: Manufacturer code
 * - 2-4 digits: Product code
 * - 1 digit: Check digit (calculated)
 */
export class BarcodeGenerator {
  // Nigeria country code for EAN-13
  private static readonly NIGERIA_COUNTRY_CODE = '615';

  // Default manufacturer codes for demo (in real system, these would be registered)
  private static readonly MANUFACTURER_CODES = {
    nestle: '1234',
    'coca-cola': '5678',
    peak: '9012',
    indomie: '3456',
    default: '0000',
  };

  /**
   * Calculate EAN-13 check digit using the standard algorithm
   */
  private static calculateEAN13CheckDigit(code: string): string {
    if (code.length !== 12) {
      throw new Error('Code must be exactly 12 digits for EAN-13');
    }

    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(code[i]);
      if (i % 2 === 0) {
        sum += digit; // Odd positions (1st, 3rd, 5th, etc.) - multiply by 1
      } else {
        sum += digit * 3; // Even positions (2nd, 4th, 6th, etc.) - multiply by 3
      }
    }

    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit.toString();
  }

  /**
   * Generate a manufacturer code based on brand name
   */
  private static getManufacturerCode(brandName: string): string {
    const normalizedName = brandName.toLowerCase().replace(/\s+/g, '-');

    // Check if we have a predefined code
    for (const [key, code] of Object.entries(this.MANUFACTURER_CODES)) {
      if (normalizedName.includes(key)) {
        return code;
      }
    }

    // Generate a code based on brand name hash for consistency
    let hash = 0;
    for (let i = 0; i < brandName.length; i++) {
      const char = brandName.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Convert to 4-digit positive number
    const code = Math.abs(hash % 10000)
      .toString()
      .padStart(4, '0');
    return code;
  }

  /**
   * Generate a product code based on variant, pack size, etc.
   */
  private static generateProductCode(
    variant: string,
    packSize: string,
    packagingType: string,
  ): string {
    // Create a unique string from product attributes
    const productString =
      `${variant}-${packSize}-${packagingType}`.toLowerCase();

    // Generate hash
    let hash = 0;
    for (let i = 0; i < productString.length; i++) {
      const char = productString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    // Convert to 5-digit positive number for product code
    const code = Math.abs(hash % 100000)
      .toString()
      .padStart(5, '0');
    return code;
  }

  /**
   * Generate a complete EAN-13 barcode
   */
  static generateEAN13(
    brandName: string,
    variant: string,
    packSize: string,
    packagingType: string,
  ): string {
    const countryCode = this.NIGERIA_COUNTRY_CODE;
    const manufacturerCode = this.getManufacturerCode(brandName);
    const productCode = this.generateProductCode(
      variant,
      packSize,
      packagingType,
    );

    // Build the 12-digit code (without check digit)
    const code12 = countryCode + manufacturerCode + productCode;

    // Calculate and append check digit
    const checkDigit = this.calculateEAN13CheckDigit(code12);

    return code12 + checkDigit;
  }

  /**
   * Validate an existing EAN-13 barcode
   */
  static validateEAN13(barcode: string): boolean {
    if (!/^\d{13}$/.test(barcode)) {
      return false;
    }

    const code12 = barcode.substring(0, 12);
    const checkDigit = barcode.substring(12);
    const calculatedCheckDigit = this.calculateEAN13CheckDigit(code12);

    return checkDigit === calculatedCheckDigit;
  }

  /**
   * Format barcode for display (with spaces for readability)
   */
  static formatBarcode(barcode: string): string {
    if (barcode.length !== 13) {
      return barcode;
    }

    // Format as: XXX XXXX XXXXX X
    return `${barcode.substring(0, 3)} ${barcode.substring(3, 7)} ${barcode.substring(7, 12)} ${barcode.substring(12)}`;
  }

  /**
   * Generate UPC-A barcode (12 digits) - used mainly in North America
   */
  static generateUPCA(
    brandName: string,
    variant: string,
    packSize: string,
    packagingType: string,
  ): string {
    const manufacturerCode = this.getManufacturerCode(brandName);
    const productCode = this.generateProductCode(
      variant,
      packSize,
      packagingType,
    );

    // UPC-A is 12 digits total
    const code11 = manufacturerCode + productCode.substring(0, 7); // 4 + 7 = 11 digits

    // Calculate UPC-A check digit (same algorithm as EAN-13 but for 11 digits)
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      const digit = parseInt(code11[i]);
      if (i % 2 === 0) {
        sum += digit * 3; // Odd positions in UPC-A use multiplier 3
      } else {
        sum += digit; // Even positions use multiplier 1
      }
    }

    const checkDigit = (10 - (sum % 10)) % 10;
    return code11 + checkDigit.toString();
  }
}
