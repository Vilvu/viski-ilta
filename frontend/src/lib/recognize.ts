import type { RecognizedWhiskey } from '@/types';

/** Shape shared by the add-whiskey and edit-whiskey forms. */
export interface WhiskeyFormFields {
  name?: string;
  distillery?: string;
  region?: string;
  age?: number;
  abv?: number;
  description?: string;
}

const TEXT_FIELDS = ['name', 'distillery', 'region', 'description'] as const;
const NUMBER_FIELDS = ['age', 'abv'] as const;

/**
 * Fills only the form fields that are currently empty with AI-recognized
 * values. Anything the user already typed is kept. Returns the merged form
 * and how many fields were filled.
 */
export function mergeRecognized<T extends WhiskeyFormFields>(
  form: T,
  recognized: RecognizedWhiskey,
): { form: T; filled: number } {
  const next: T = { ...form };
  let filled = 0;

  for (const field of TEXT_FIELDS) {
    const value = recognized[field];
    const current = form[field];
    if (value && (current === undefined || current.trim() === '')) {
      next[field] = value as T[typeof field];
      filled++;
    }
  }

  for (const field of NUMBER_FIELDS) {
    const value = recognized[field];
    if (value !== null && value !== undefined && form[field] === undefined) {
      next[field] = value as T[typeof field];
      filled++;
    }
  }

  return { form: next, filled };
}
