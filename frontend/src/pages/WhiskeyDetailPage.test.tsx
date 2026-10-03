import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { renderWithProviders } from '../test/renderWithProviders';
import WhiskeyDetailPage from './WhiskeyDetailPage';

const EVENT_WHISKEY = {
  id: 'w1',
  eventId: 'e1',
  name: 'Lagavulin 16',
  distillery: 'Lagavulin',
  createdBy: 'Admin',
  createdAt: '',
  updatedAt: '',
  averageRating: 8,
  ratingCount: 1,
};

const EVENT = {
  id: 'e1',
  name: 'Event 1',
  description: '',
  date: '2026-01-01',
  createdBy: 'Admin',
  createdAt: '',
  updatedAt: '',
  whiskeyCount: 1,
};

function mockTaster(existingRating?: { score: number; notes?: string }) {
  server.use(
    http.get('/.auth/me', () =>
      HttpResponse.json({
        clientPrincipal: {
          userId: 'u1',
          userRoles: ['authenticated'],
          claims: [{ typ: 'name', val: 'Alice' }],
          identityProvider: 'aad',
          userDetails: 'alice@example.com',
        },
      }),
    ),
    http.get('/api/users/me', () =>
      HttpResponse.json({
        data: {
          displayName: 'Alice',
          email: 'alice@example.com',
          role: 'taster',
          usernameConfirmed: true,
        },
      }),
    ),
    http.get('/api/events/e1', () => HttpResponse.json({ data: EVENT })),
    http.get('/api/events/e1/whiskeys/w1', () =>
      HttpResponse.json({ data: EVENT_WHISKEY }),
    ),
    http.get('/api/events/e1/whiskeys/w1/ratings', () =>
      HttpResponse.json({
        data: existingRating
          ? [
              {
                id: 'r1',
                eventId: 'e1',
                whiskeyId: 'w1',
                userId: 'u1',
                userName: 'Alice',
                score: existingRating.score,
                notes: existingRating.notes,
                createdAt: '',
                updatedAt: '',
              },
            ]
          : [],
      }),
    ),
  );
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/events/:eventId/whiskeys/:whiskeyId"
        element={<WhiskeyDetailPage />}
      />
    </Routes>,
    { route: '/events/e1/whiskeys/w1' },
  );
}

describe('WhiskeyDetailPage score selector', () => {
  it('renders exactly 11 score buttons for 0-10', async () => {
    mockTaster();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/your rating/i)).toBeInTheDocument(),
    );

    const buttons = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
      screen.getByRole('button', { name: String(n) }),
    );
    expect(buttons).toHaveLength(11);
  });

  it('starts with nothing selected (null sentinel) and submit disabled', async () => {
    mockTaster();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/your rating/i)).toBeInTheDocument(),
    );

    const zeroButton = screen.getByRole('button', { name: '0' });
    const tenButton = screen.getByRole('button', { name: '10' });
    expect(zeroButton.className).not.toMatch(/selected/);
    expect(tenButton.className).not.toMatch(/selected/);

    const submitButton = screen.getByRole('button', { name: /submit rating/i });
    expect(submitButton).toBeDisabled();
  });

  it('selecting 0 enables submit and posts score: 0 (not dropped as falsy)', async () => {
    mockTaster();
    let capturedBody: unknown;
    server.use(
      http.put('/api/events/e1/whiskeys/w1/ratings/me', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          data: {
            id: 'r1',
            eventId: 'e1',
            whiskeyId: 'w1',
            userId: 'u1',
            userName: 'Alice',
            score: 0,
            createdAt: '',
            updatedAt: '',
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/your rating/i)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: '0' }));
    const submitButton = screen.getByRole('button', { name: /submit rating/i });
    expect(submitButton).not.toBeDisabled();

    await user.click(submitButton);
    await waitFor(() => expect(capturedBody).toMatchObject({ score: 0 }));
  });

  it('selecting 10 submits score: 10', async () => {
    mockTaster();
    let capturedBody: unknown;
    server.use(
      http.put('/api/events/e1/whiskeys/w1/ratings/me', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          data: {
            id: 'r1',
            eventId: 'e1',
            whiskeyId: 'w1',
            userId: 'u1',
            userName: 'Alice',
            score: 10,
            createdAt: '',
            updatedAt: '',
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/your rating/i)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: '10' }));
    await user.click(screen.getByRole('button', { name: /submit rating/i }));
    await waitFor(() => expect(capturedBody).toMatchObject({ score: 10 }));
  });

  it('pre-selects the right button when an existing rating is present', async () => {
    mockTaster({ score: 7, notes: 'Good' });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/your rating/i)).toBeInTheDocument(),
    );

    // With an existing rating, the display view shows the score, not the
    // selector, until Edit is clicked.
    expect(screen.getByText('7/10')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^edit$/i }));

    const sevenButton = screen.getByRole('button', { name: '7' });
    expect(sevenButton.className).toMatch(/selected/);
  });
});
