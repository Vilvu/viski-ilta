import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

/** Password rules and hashing shared by native sign-in and admin resets. */

export const BCRYPT_ROUNDS = 10;
export const MIN_PASSWORD_LENGTH = 8;
// bcrypt silently ignores input past 72 bytes.
export const MAX_PASSWORD_BYTES = 72;

// How long an admin-issued temporary password can be used to sign in.
export const TEMP_PASSWORD_TTL_HOURS = 24;
const TEMP_PASSWORD_LENGTH = 12;
// No look-alikes (0/O, 1/l/I) so it can be read out or copied by hand.
const TEMP_PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (Buffer.byteLength(password, 'utf-8') > MAX_PASSWORD_BYTES) {
    return `Password must be at most ${MAX_PASSWORD_BYTES} bytes`;
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** ~69 bits of entropy from the OS CSPRNG. */
export function generateTemporaryPassword(): string {
  let password = '';
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    password +=
      TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return password;
}
