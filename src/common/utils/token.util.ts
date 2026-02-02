import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a secure random token for password resets and other authentication purposes
 * Uses UUID v4 for consistency with existing auth implementation
 * @returns A UUID v4 string token
 */
export function generateSecureToken(): string {
  return uuidv4();
}

/**
 * Generate a password reset token with expiry date
 * @param hoursValid - Number of hours the token should be valid for (default: 24)
 * @returns Object with token and expiry date
 */
export function generatePasswordResetToken(hoursValid: number = 24): {
  token: string;
  expiresAt: Date;
} {
  const token = generateSecureToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hoursValid);

  return {
    token,
    expiresAt,
  };
}
