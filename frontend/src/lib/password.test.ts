import { describe, it, expect } from 'vitest';
import { validateNewPassword } from './password';

describe('validateNewPassword', () => {
  it('accepts a valid matching password', () => {
    expect(validateNewPassword('correct-horse', 'correct-horse')).toBeNull();
  });

  it.each([
    ['short', 'short', 'auth.errors.passwordTooShort'],
    ['ä'.repeat(37), 'ä'.repeat(37), 'auth.errors.passwordTooLong'],
    ['correct-horse', 'other-horse', 'auth.errors.passwordMismatch'],
  ])('rejects %s', (password, confirm, key) => {
    expect(validateNewPassword(password, confirm)).toBe(key);
  });
});
