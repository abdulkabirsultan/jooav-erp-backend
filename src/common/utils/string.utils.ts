export class StringUtils {
  /**
   * Convert string to title case
   * @param str Input string
   * @returns String in title case
   */
  static toTitleCase(str: string): string {
    if (!str) return str;

    return str
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Generate URL-friendly slug from string
   * @param str Input string
   * @returns URL-friendly slug
   */
  static generateSlug(str: string): string {
    if (!str) return '';

    return (
      str
        .toLowerCase()
        .trim()
        // Remove special characters except hyphens and spaces
        .replace(/[^a-z0-9\s-]/g, '')
        // Replace spaces and multiple hyphens with single hyphen
        .replace(/[\s-]+/g, '-')
        // Remove leading and trailing hyphens
        .replace(/^-+|-+$/g, '')
    );
  }

  /**
   * Normalize string for case-insensitive comparison
   * @param str Input string
   * @returns Normalized string
   */
  static normalize(str: string): string {
    if (!str) return str;

    return str.toLowerCase().trim().replace(/\s+/g, ' '); // Replace multiple spaces with single space
  }

  /**
   * Generate random string with given length
   * @param length Length of random string
   * @returns Random string
   */
  static generateRandomString(length: number = 8): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }

  /**
   * Truncate string with ellipsis
   * @param str Input string
   * @param maxLength Maximum length
   * @returns Truncated string
   */
  static truncate(str: string, maxLength: number): string {
    if (!str) return str;

    if (str.length <= maxLength) {
      return str;
    }

    return str.substring(0, maxLength - 3) + '...';
  }

  /**
   * Remove HTML tags from string
   * @param str Input string with HTML
   * @returns Clean string without HTML
   */
  static stripHtml(str: string): string {
    if (!str) return str;

    return str.replace(/<[^>]*>/g, '');
  }

  /**
   * Escape special regex characters
   * @param str Input string
   * @returns Escaped string safe for regex
   */
  static escapeRegex(str: string): string {
    if (!str) return str;

    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
