import { describe, it, expect } from 'vitest';
import en from './locales/en.json';
import fi from './locales/fi.json';

type Tree = { [key: string]: string | Tree };

/** Flattens a nested translation object into dotted key paths. */
function flatten(obj: Tree, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[path] = value;
    } else {
      Object.assign(result, flatten(value, path));
    }
  }
  return result;
}

describe('i18n locale parity (en <-> fi)', () => {
  const enFlat = flatten(en as Tree);
  const fiFlat = flatten(fi as Tree);

  it('every en key exists in fi', () => {
    const missing = Object.keys(enFlat).filter((key) => !(key in fiFlat));
    expect(missing).toEqual([]);
  });

  it('every fi key exists in en', () => {
    const missing = Object.keys(fiFlat).filter((key) => !(key in enFlat));
    expect(missing).toEqual([]);
  });

  it('no en value is an empty string', () => {
    const empty = Object.entries(enFlat)
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('no fi value is an empty string', () => {
    const empty = Object.entries(fiFlat)
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });
});
