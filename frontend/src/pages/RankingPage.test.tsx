import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { renderWithProviders } from '../test/renderWithProviders';
import RankingPage from './RankingPage';

const base = {
  createdBy: 'Admin',
  createdAt: '',
  updatedAt: '',
};

function mockWhiskeys(whiskeys: object[]) {
  server.use(
    http.get('/api/whiskeys', () => HttpResponse.json({ data: whiskeys })),
  );
}

describe('RankingPage', () => {
  it('shows the rating count with the details, apart from the score', async () => {
    mockWhiskeys([
      {
        ...base,
        id: 'w1',
        name: 'Lagavulin 16y',
        distillery: 'Lagavulin',
        region: 'Scotland, Islay',
        age: 16,
        abv: 43,
        globalAverageRating: 8.5,
        globalRatingCount: 4,
      },
    ]);
    renderWithProviders(<RankingPage />, { language: 'en' });

    const count = await screen.findByText('4 ratings');
    expect(count.closest('div')).toHaveTextContent('Lagavulin 16y');
    expect(screen.getByText('8.5').closest('div')).not.toHaveTextContent(
      '4 ratings',
    );
    expect(
      screen.getByText('Lagavulin · Scotland, Islay · 16yr · 43%'),
    ).toBeInTheDocument();
  });

  it('leaves out missing details without stray separators', async () => {
    mockWhiskeys([
      {
        ...base,
        id: 'w1',
        name: 'Mystery Dram',
        region: 'Finland',
        globalAverageRating: 0,
        globalRatingCount: 0,
      },
    ]);
    renderWithProviders(<RankingPage />, { language: 'fi' });

    expect(await screen.findByText('Finland')).toBeInTheDocument();
    expect(screen.getByText('0 arvostelua')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
