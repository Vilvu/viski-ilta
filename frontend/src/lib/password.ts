// Mirrors the server-side rules in api/src/lib/passwords.ts.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

/**
 * Validates a new password and its confirmation. Returns an i18n key for
 * the first problem found, or null when the password is acceptable.
 */
export function validateNewPassword(
  password: string,
  confirmPassword: string,
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return 'auth.errors.passwordTooShort';
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return 'auth.errors.passwordTooLong';
  }
  if (password !== confirmPassword) return 'auth.errors.passwordMismatch';
  return null;
}
