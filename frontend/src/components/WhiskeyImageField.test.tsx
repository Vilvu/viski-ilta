import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { renderWithProviders } from '../test/renderWithProviders';
import WhiskeyImageField from './WhiskeyImageField';
import type { RecognizedWhiskey } from '@/types';

vi.mock('@/lib/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/image')>();
  return {
    ...actual,
    // jsdom cannot decode images; pass image files through unchanged.
    prepareImage: vi.fn(async (file: Blob) => {
      if (!file.type.startsWith('image/')) throw new actual.InvalidImageError();
      return new Blob(['prepared'], { type: 'image/jpeg' });
    }),
  };
});

const RESULT: RecognizedWhiskey = {
  name: 'Lagavulin 16',
  distillery: null,
  region: null,
  age: null,
  abv: null,
  description: null,
  sources: [],
};

const SAVED = { id: 'w1', name: 'Lagavulin 16', imageUpdatedAt: 't1' };

function setup(
  props: Partial<React.ComponentProps<typeof WhiskeyImageField>> = {},
) {
  const onPendingImageChange = vi.fn();
  const onRecognized = vi.fn(() => 1);
  const utils = renderWithProviders(
    <WhiskeyImageField
      pendingImage={null}
      onPendingImageChange={onPendingImageChange}
      onRecognized={onRecognized}
      {...props}
    />,
  );
  return { ...utils, onPendingImageChange, onRecognized };
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WhiskeyImageField', () => {
  it('offers only "Add photo" when there is no photo', () => {
    setup();
    expect(
      screen.getByRole('button', { name: 'Add photo' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Recognize with AI/ }),
    ).not.toBeInTheDocument();
  });

  it('prepares a picked file and hands it to the parent', async () => {
    const { onPendingImageChange } = setup();
    await userEvent.upload(
      screen.getByTestId('whiskey-photo-input'),
      new File(['x'], 'bottle.jpg', { type: 'image/jpeg' }),
    );
    await waitFor(() =>
      expect(onPendingImageChange).toHaveBeenCalledWith(expect.any(Blob)),
    );
  });

  it('shows an error for a file that is not an image', async () => {
    const { onPendingImageChange } = setup();
    await userEvent.upload(
      screen.getByTestId('whiskey-photo-input'),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
      { applyAccept: false },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file is not a supported image.',
    );
    expect(onPendingImageChange).not.toHaveBeenCalled();
  });

  it('previews a pending photo and lets the user discard it', async () => {
    const { onPendingImageChange } = setup({
      pendingImage: new Blob(['x'], { type: 'image/jpeg' }),
    });
    expect(
      screen.getByRole('img', { name: 'Selected bottle photo' }),
    ).toHaveAttribute('src', 'blob:preview');
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard new photo' }),
    );
    expect(onPendingImageChange).toHaveBeenCalledWith(null);
  });

  it('removes the saved photo after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deleted = false;
    server.use(
      http.delete('/api/whiskeys/w1/image', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    setup({ whiskey: SAVED });
    expect(
      screen.getByRole('img', { name: 'Bottle of Lagavulin 16' }),
    ).toHaveAttribute('src', '/api/whiskeys/w1/image?v=t1');
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it('does not remove the photo when the user cancels', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup({ whiskey: SAVED });
    // No DELETE handler is registered: an unexpected request would fail.
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(window.confirm).toHaveBeenCalled();
  });

  it('shows an error when removing the photo fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.delete(
        '/api/whiskeys/w1/image',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    setup({ whiskey: SAVED });
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Removing the photo failed.',
    );
  });

  it('recognizes a pending photo and reports how many fields were filled', async () => {
    let contentType: string | null = null;
    server.use(
      http.post('/api/whiskeys/recognize', ({ request }) => {
        contentType = request.headers.get('content-type');
        return HttpResponse.json({ data: RESULT });
      }),
    );
    const { onRecognized } = setup({
      pendingImage: new Blob(['x'], { type: 'image/jpeg' }),
    });
    await userEvent.click(
      screen.getByRole('button', { name: /Recognize with AI/ }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Filled 1 field.',
    );
    expect(onRecognized).toHaveBeenCalledWith(RESULT);
    expect(contentType).toBe('image/jpeg');
  });

  it('recognizes the saved photo by fetching it first', async () => {
    server.use(
      http.get(
        '/api/whiskeys/w1/image',
        () =>
          new HttpResponse(new Uint8Array([1, 2]), {
            headers: { 'Content-Type': 'image/jpeg' },
          }),
      ),
      http.post('/api/whiskeys/recognize', () =>
        HttpResponse.json({ data: RESULT }),
      ),
    );
    const onRecognized = vi.fn(() => 0);
    setup({ whiskey: SAVED, onRecognized });
    await userEvent.click(
      screen.getByRole('button', { name: /Recognize with AI/ }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'No new information found for the empty fields.',
    );
  });

  it.each([
    [503, 'AI recognition is not configured on this server.'],
    [429, 'AI recognition is busy. Try again in a moment.'],
    [500, 'AI recognition failed. Try again or fill the fields manually.'],
  ])('shows the right message for a %s response', async (status, text) => {
    server.use(
      http.post(
        '/api/whiskeys/recognize',
        () => new HttpResponse(null, { status }),
      ),
    );
    const { onRecognized } = setup({
      pendingImage: new Blob(['x'], { type: 'image/jpeg' }),
    });
    await userEvent.click(
      screen.getByRole('button', { name: /Recognize with AI/ }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(onRecognized).not.toHaveBeenCalled();
  });
});
