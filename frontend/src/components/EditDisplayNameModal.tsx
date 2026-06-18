import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateDisplayName } from '@/hooks/useUserProfile';
import styles from './EditDisplayNameModal.module.css';

interface EditDisplayNameModalProps {
  currentName: string;
  onClose: () => void;
}

export default function EditDisplayNameModal({
  currentName,
  onClose,
}: EditDisplayNameModalProps) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(currentName);
  const [error, setError] = useState<string>('');
  const updateMutation = useUpdateDisplayName();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = displayName.trim();
    if (trimmed.length === 0) {
      setError(t('modals.validation.empty'));
      return;
    }
    if (trimmed.length > 50) {
      setError(t('modals.validation.tooLong'));
      return;
    }

    try {
      await updateMutation.mutateAsync(trimmed);
      onClose();
    } catch (err) {
      if (err && typeof err === 'object' && 'response' in err) {
        const e = err as { response?: { data?: { message?: string } } };
        setError(
          e.response?.data?.message ?? t('modals.validation.updateFailed'),
        );
      } else {
        setError(t('modals.validation.updateFailed'));
      }
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>{t('modals.updateDisplayName')}</h2>
        <p>{t('modals.descriptions.update')}</p>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="displayName">{t('modals.displayName')}</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('modals.displayNamePlaceholder')}
              maxLength={50}
              autoFocus
            />
          </div>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.actions}>
            <button
              type="button"
              onClick={onClose}
              disabled={updateMutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending
                ? t('common.saving')
                : t('common.saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
