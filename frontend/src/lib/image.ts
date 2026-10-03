/**
 * Client-side photo preparation: decode the picked file, downscale it so the
 * longest edge is at most MAX_IMAGE_DIMENSION, and re-encode it as JPEG.
 * Phone photos are often 5–15 MB; this keeps uploads to a few hundred KB.
 */
export const MAX_IMAGE_DIMENSION = 1280;
export const JPEG_QUALITY = 0.85;

export class InvalidImageError extends Error {
  constructor(message = 'File is not a supported image') {
    super(message);
    this.name = 'InvalidImageError';
  }
}

/** Scales (width, height) down to fit within maxDimension, keeping aspect. */
export function scaledSize(
  width: number,
  height: number,
  maxDimension = MAX_IMAGE_DIMENSION,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function prepareImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new InvalidImageError();
  }

  let bitmap: ImageBitmap;
  try {
    // createImageBitmap applies EXIF orientation by default.
    bitmap = await createImageBitmap(file);
  } catch {
    throw new InvalidImageError('Image could not be decoded');
  }

  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new InvalidImageError('Canvas is not available');
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new InvalidImageError('Image could not be encoded');
    return blob;
  } finally {
    bitmap.close?.();
  }
}
