import { describe, it, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { LanguageSwitcher } from './LanguageSwitcher';
import i18n from '../i18n';

describe('LanguageSwitcher', () => {
  afterEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('en');
  });

  it('toggling to Finnish writes lang to localStorage and changes the active language', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LanguageSwitcher />, { language: 'en' });

    await user.click(screen.getByRole('button', { name: 'FI' }));

    expect(i18n.language).toBe('fi');
    expect(localStorage.getItem('lang')).toBe('fi');
  });

  it('toggling to English writes lang to localStorage and changes the active language', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LanguageSwitcher />, { language: 'fi' });

    await user.click(screen.getByRole('button', { name: 'EN' }));

    expect(i18n.language).toBe('en');
    expect(localStorage.getItem('lang')).toBe('en');
  });
});
