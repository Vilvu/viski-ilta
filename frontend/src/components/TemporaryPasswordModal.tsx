import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './EditDisplayNameModal.module.css';
import own from './TemporaryPasswordModal.module.css';

interface TemporaryPasswordModalProps {
  userName: string;
  temporaryPassword: string;
  expiresAt: string;
  onClose: () => void;
}

/**
 * Shows an admin-issued temporary password once. It isn't stored anywhere
 * the admin can see again, so the modal makes copying it easy.
 */
export default function TemporaryPasswordModal({
  userName,
  temporaryPassword,
  expiresAt,
  onClose,
}: TemporaryPasswordModalProps) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard unavailable (e.g. insecure context): the password is
      // still selectable on screen.
    }
  };

  const expires = new Date(expiresAt).toLocaleString(i18n.language);

  return (
    <div className={styles.overlay}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="temp-password-title"
      >
        <h2 id="temp-password-title">
          {t('userManagement.tempPassword.title')}
        </h2>
        <p>
          {t('userManagement.tempPassword.description', { name: userName })}
        </p>
        <div className={own.passwordRow}>
          <code className={own.password} data-testid="temporary-password">
            {temporaryPassword}
          </code>
          <button type="button" className={own.copyBtn} onClick={handleCopy}>
            {copied
              ? t('userManagement.tempPassword.copied')
              : t('userManagement.tempPassword.copy')}
          </button>
        </div>
        <p className={own.note}>
          {t('userManagement.tempPassword.expires', { expires })}
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={onClose} autoFocus>
            {t('userManagement.tempPassword.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
