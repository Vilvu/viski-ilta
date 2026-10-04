import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  generateTemporaryPassword,
  hashPassword,
  validatePassword,
} from '../../src/lib/passwords';

describe('generateTemporaryPassword', () => {
  it('produces 12 characters without look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(12);
      expect(password).not.toMatch(/[0O1lI]/);
      expect(validatePassword(password)).toBeNull();
    }
  });

  it('is not repetitive', () => {
    const seen = new Set(
      Array.from({ length: 200 }, () => generateTemporaryPassword()),
    );
    expect(seen.size).toBe(200);
  });
});

describe('hashPassword', () => {
  it('produces a salted bcrypt hash that verifies', async () => {
    const [a, b] = await Promise.all([
      hashPassword('correct-horse'),
      hashPassword('correct-horse'),
    ]);
    expect(a).not.toBe(b);
    expect(await bcrypt.compare('correct-horse', a)).toBe(true);
  });
});
