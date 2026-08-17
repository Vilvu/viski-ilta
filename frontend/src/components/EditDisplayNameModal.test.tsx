import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { renderWithProviders } from '../test/renderWithProviders';
import EditDisplayNameModal from './EditDisplayNameModal';

describe('EditDisplayNameModal', () => {
  it('rejects an empty name', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EditDisplayNameModal currentName="X" onClose={vi.fn()} />,
    );
    const input = screen.getByLabelText(/display name/i);
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/empty/i)).toBeInTheDocument();
  });

  it('rejects a whitespace-only name', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EditDisplayNameModal currentName="X" onClose={vi.fn()} />,
    );
    const input = screen.getByLabelText(/display name/i);
    await user.clear(input);
    await user.type(input, '   ');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/empty/i)).toBeInTheDocument();
  });

  it('rejects a name over 50 characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EditDisplayNameModal currentName="X" onClose={vi.fn()} />,
    );
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: 'a'.repeat(51) } });
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/50/)).toBeInTheDocument();
  });

  it('accepts exactly 50 characters', async () => {
    let capturedBody: unknown;
    server.use(
      http.put('/api/users/me', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          data: {
            displayName: 'a'.repeat(50),
            email: '',
            role: 'taster',
            usernameConfirmed: true,
          },
        });
      }),
    );
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <EditDisplayNameModal currentName="X" onClose={onClose} />,
    );
    const input = screen.getByLabelText(/display name/i);
    await user.clear(input);
    await user.paste('a'.repeat(50));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(capturedBody).toEqual({ displayName: 'a'.repeat(50) });
  });

  it('calls useUpdateDisplayName with the trimmed value', async () => {
    let capturedBody: unknown;
    server.use(
      http.put('/api/users/me', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          data: {
            displayName: 'Ville',
            email: '',
            role: 'taster',
            usernameConfirmed: true,
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <EditDisplayNameModal currentName="Old" onClose={vi.fn()} />,
    );
    const input = screen.getByLabelText(/display name/i);
    await user.clear(input);
    await user.type(input, '  Ville  ');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(capturedBody).toEqual({ displayName: 'Ville' }));
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
      <EditDisplayNameModal currentName="Valid Name" onClose={onClose} />,
    );
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('Name already taken')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancel button calls onClose without submitting', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <EditDisplayNameModal currentName="X" onClose={onClose} />,
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
