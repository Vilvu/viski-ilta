import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  prepareImage,
  scaledSize,
  InvalidImageError,
  MAX_IMAGE_DIMENSION,
  JPEG_QUALITY,
} from './image';

describe('scaledSize', () => {
  it('keeps small images unchanged', () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('scales the longest edge down to the maximum, keeping aspect', () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(scaledSize(3000, 4000)).toEqual({ width: 960, height: 1280 });
  });

  it('never returns a zero dimension', () => {
    expect(scaledSize(10000, 1, 100)).toEqual({ width: 100, height: 1 });
  });
});

describe('prepareImage', () => {
  const drawImage = vi.fn();
  const close = vi.fn();
  let toBlobResult: Blob | null;
  let lastCanvas: { width: number; height: number } | null;

  beforeEach(() => {
    toBlobResult = new Blob(['jpeg'], { type: 'image/jpeg' });
    lastCanvas = null;
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4032, height: 3024, close })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function (this: HTMLCanvasElement) {
        lastCanvas = { width: this.width, height: this.height };
        return { drawImage } as unknown as CanvasRenderingContext2D;
      } as unknown as HTMLCanvasElement['getContext'],
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      function (callback: BlobCallback, type?: string, quality?: unknown) {
        expect(type).toBe('image/jpeg');
        expect(quality).toBe(JPEG_QUALITY);
        callback(toBlobResult);
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    drawImage.mockReset();
    close.mockReset();
  });

  it('downscales to a JPEG and releases the bitmap', async () => {
    const result = await prepareImage(
      new File(['x'], 'bottle.heic', { type: 'image/heic' }),
    );
    expect(result.type).toBe('image/jpeg');
    expect(lastCanvas?.width).toBe(MAX_IMAGE_DIMENSION);
    expect(lastCanvas?.height).toBe(960);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 960);
    expect(close).toHaveBeenCalled();
  });

  it('rejects non-image files without decoding', async () => {
    await expect(
      prepareImage(new File(['x'], 'notes.txt', { type: 'text/plain' })),
    ).rejects.toBeInstanceOf(InvalidImageError);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('rejects images the browser cannot decode', async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('bad'));
    await expect(
      prepareImage(new File(['x'], 'a.jpg', { type: 'image/jpeg' })),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });

  it('rejects when encoding fails', async () => {
    toBlobResult = null;
    await expect(
      prepareImage(new File(['x'], 'a.jpg', { type: 'image/jpeg' })),
    ).rejects.toBeInstanceOf(InvalidImageError);
    expect(close).toHaveBeenCalled();
  });
});
