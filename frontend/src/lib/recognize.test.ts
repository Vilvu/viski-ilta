import { describe, it, expect } from 'vitest';
import { mergeRecognized } from './recognize';
import type { RecognizedWhiskey } from '@/types';

const RESULT: RecognizedWhiskey = {
  name: 'Lagavulin 16',
  distillery: 'Lagavulin',
  region: 'Islay',
  age: 16,
  abv: 43,
  description: 'Rich and smoky.',
  sources: [],
};

describe('mergeRecognized', () => {
  it('fills every empty field ("" and undefined both count as empty)', () => {
    const { form, filled } = mergeRecognized(
      {
        name: '',
        distillery: '  ',
        region: undefined,
        age: undefined,
        abv: undefined,
        description: '',
      },
      RESULT,
    );
    expect(filled).toBe(6);
    expect(form).toEqual({
      name: 'Lagavulin 16',
      distillery: 'Lagavulin',
      region: 'Islay',
      age: 16,
      abv: 43,
      description: 'Rich and smoky.',
    });
  });

  it('never overwrites values the user already entered', () => {
    const { form, filled } = mergeRecognized(
      { name: 'My name', distillery: '', age: 12, abv: undefined },
      RESULT,
    );
    expect(form.name).toBe('My name');
    expect(form.age).toBe(12);
    expect(form.distillery).toBe('Lagavulin');
    expect(form.abv).toBe(43);
    expect(filled).toBe(4); // distillery, region, abv, description
  });

  it('ignores null results and does not mutate the input', () => {
    const input = { name: '', age: undefined };
    const { form, filled } = mergeRecognized(input, {
      ...RESULT,
      name: null,
      distillery: null,
      region: null,
      age: null,
      abv: null,
      description: null,
    });
    expect(filled).toBe(0);
    expect(form).toEqual(input);
    expect(form).not.toBe(input);
  });
});
