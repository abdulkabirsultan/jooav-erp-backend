export class StringUtils {
  /**
   * Generates a random string of specified length
   */
  static randomString(length: number): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Converts string to slug format
   */
  static slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Capitalizes first letter of each word
   */
  static titleCase(text: string): string {
    return text.replace(
      /\w\S*/g,
      (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(),
    );
  }

  /**
   * Truncates text to specified length with ellipsis
   */
  static truncate(text: string, length: number, suffix = '...'): string {
    if (text.length <= length) return text;
    return text.substring(0, length).trim() + suffix;
  }

  /**
   * Normalizes name for consistent comparison
   */
  static normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Generates a URL-friendly slug
   */
  static generateSlug(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Normalizes text for SKU generation (removes special chars, spaces)
   */
  static normalizeForSKU(text: string): string {
    return text
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '')
      .toUpperCase();
  }
}

export class DateUtils {
  /**
   * Formats date to ISO string
   */
  static toISOString(date: Date): string {
    return date.toISOString();
  }

  /**
   * Gets start of day
   */
  static startOfDay(date: Date): Date {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    return newDate;
  }

  /**
   * Gets end of day
   */
  static endOfDay(date: Date): Date {
    const newDate = new Date(date);
    newDate.setHours(23, 59, 59, 999);
    return newDate;
  }

  /**
   * Adds days to date
   */
  static addDays(date: Date, days: number): Date {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + days);
    return newDate;
  }

  /**
   * Checks if date is within range
   */
  static isWithinRange(date: Date, start: Date, end: Date): boolean {
    return date >= start && date <= end;
  }
}

export class ValidationUtils {
  /**
   * Validates email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validates phone number format
   */
  static isValidPhone(phone: string): boolean {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s-()]/g, ''));
  }

  /**
   * Validates strong password
   */
  static isStrongPassword(password: string): boolean {
    const strongPasswordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return strongPasswordRegex.test(password);
  }

  /**
   * Validates URL format
   */
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Normalize name for case-insensitive comparison
   */
  static normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Generate slug from text
   */
  static generateSlug(text: string): string {
    return StringUtils.slugify(text);
  }

  /**
   * Normalize text for SKU generation
   */
  static normalizeForSKU(text: string): string {
    return text
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
