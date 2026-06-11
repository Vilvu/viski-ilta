import { useState } from 'react';
import { useUpdateDisplayName } from '@/hooks/useUserProfile';
import styles from './EditDisplayNameModal.module.css';

interface EditDisplayNameModalProps {
  currentName: string;
  onClose: () => void;
}

export default function EditDisplayNameModal({ currentName, onClose }: EditDisplayNameModalProps) {
  const [displayName, setDisplayName] = useState(currentName);
  const [error, setError] = useState<string>('');
  const updateMutation = useUpdateDisplayName();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = displayName.trim();
    if (trimmed.length === 0) {
      setError('Display name cannot be empty');
      return;
    }
    if (trimmed.length > 50) {
      setError('Display name must be 50 characters or less');
      return;
    }

    try {
      await updateMutation.mutateAsync(trimmed);
      onClose();
    } catch (err) {
      if (err && typeof err === 'object' && 'response' in err) {
        const e = err as { response?: { data?: { message?: string } } };
        setError(e.response?.data?.message ?? 'Failed to update display name');
      } else {
        setError('Failed to update display name');
      }
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>Update Display Name</h2>
        <p>Change the name that other users see when you rate whiskeys or create events.</p>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="displayName">Display Name</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
              maxLength={50}
              autoFocus
            />
          </div>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.actions}>
            <button type="button" onClick={onClose} disabled={updateMutation.isPending}>
              Cancel
            </button>
            <button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
