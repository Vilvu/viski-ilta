import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { renderWithProviders } from '../test/renderWithProviders';
import UsernameSetupModal from './UsernameSetupModal';

describe('UsernameSetupModal', () => {
  it('rejects an empty name', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <UsernameSetupModal defaultName="X" onClose={vi.fn()} />,
    );
    const input = screen.getByLabelText(/display name/i);
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/empty/i)).toBeInTheDocument();
  });

  it('rejects a whitespace-only name', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <UsernameSetupModal defaultName="X" onClose={vi.fn()} />,
    );
    const input = screen.getByLabelText(/display name/i);
    await user.clear(input);
    await user.type(input, '    ');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/empty/i)).toBeInTheDocument();
  });

  it('rejects a name over 50 characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <UsernameSetupModal defaultName="" onClose={vi.fn()} />,
    );
    const input = screen.getByLabelText(/display name/i);
    // The input has maxLength=50, which only constrains real typing/paste
    // events; fireEvent.change bypasses that (like a maxLength-less client
    // could) so the length>50 branch in the submit handler is still covered.
    fireEvent.change(input, { target: { value: 'a'.repeat(51) } });
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/50/)).toBeInTheDocument();
  });

  it('surfaces the server-side control-character rejection (the API validates this; the modal only checks empty/length client-side)', async () => {
    server.use(
      http.put('/api/users/me', () =>
        HttpResponse.json(
          { message: 'Display name contains invalid characters' },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <UsernameSetupModal defaultName="bad\x00name" onClose={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(
      await screen.findByText('Display name contains invalid characters'),
    ).toBeInTheDocument();
  });

  it('trims surrounding whitespace before submitting', async () => {
    let capturedBody: unknown;
    server.use(
      http.put('/api/users/me', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          data: {
            displayName: 'Ville',
            email: '',
            role: 'anonymous',
            usernameConfirmed: true,
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <UsernameSetupModal defaultName="" onClose={vi.fn()} />,
    );
    const input = screen.getByLabelText(/display name/i);
    await user.type(input, '  Ville  ');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(capturedBody).toEqual({ displayName: 'Ville' }));
  });

  it('accepts exactly 50 characters and submits the trimmed value', async () => {
    let capturedBody: unknown;
    server.use(
      http.put('/api/users/me', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          data: {
            displayName: 'a'.repeat(50),
            email: '',
            role: 'anonymous',
            usernameConfirmed: true,
          },
        });
      }),
    );
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <UsernameSetupModal defaultName="" onClose={onClose} />,
    );
    const input = screen.getByLabelText(/display name/i);
    await user.click(input);
    await user.paste('a'.repeat(50));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(capturedBody).toEqual({ displayName: 'a'.repeat(50) });
  });

  it('surfaces a server error and keeps the modal open', async () => {
    server.use(
      http.put('/api/users/me', () =>
        HttpResponse.json({ message: 'Name already taken' }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <UsernameSetupModal defaultName="Valid Name" onClose={onClose} />,
    );
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('Name already taken')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
