import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import WhiskeyPhoto from './WhiskeyPhoto';

describe('WhiskeyPhoto', () => {
  it('shows a placeholder when the whiskey has no photo', () => {
    renderWithProviders(<WhiskeyPhoto whiskey={{ id: 'w1', name: 'Oban' }} />);
    expect(screen.getByRole('img', { name: 'No photo' })).toBeInTheDocument();
  });

  it('renders the cache-busted image URL', () => {
    renderWithProviders(
      <WhiskeyPhoto
        whiskey={{ id: 'w1', name: 'Oban', imageUpdatedAt: 't1' }}
        size="large"
      />,
    );
    const img = screen.getByRole('img', { name: 'Bottle of Oban' });
    expect(img).toHaveAttribute('src', '/api/whiskeys/w1/image?v=t1');
  });
});
