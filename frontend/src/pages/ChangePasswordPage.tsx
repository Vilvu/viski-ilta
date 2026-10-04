import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/api/auth';
import { useAuth } from '@/hooks/useAuth';
import { validateNewPassword } from '@/lib/password';
import styles from './LoginPage.module.css';

/**
 * Change password for native (username/password) accounts. Users who signed
 * in with an admin-issued temporary password are sent here and can't use
 * the rest of the app until they've chosen a new password.
 */
export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const { user, isLoading, isAuthenticated, mustChangePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <div>{t('common.loading')}</div>;

  const isNativeAccount = user?.provider === 'local';
  if (!mustChangePassword && !(isAuthenticated && isNativeAccount)) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError =
      newPassword === currentPassword
        ? 'auth.errors.passwordUnchanged'
        : validateNewPassword(newPassword, confirmPassword);
    if (validationError) {
      setError(t(validationError));
      return;
    }

    setSubmitting(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      // Full reload so identity picks up the new, unrestricted session.
      window.location.assign('/');
    } catch (err) {
      const response = (
        err as { response?: { status?: number; data?: { message?: string } } }
      )?.response;
      const status = response?.status;
      const expired = /expired/i.test(response?.data?.message ?? '');
      if (status === 401 && !expired) {
        window.location.assign('/login');
        return;
      }
      setError(
        t(
          expired
            ? 'auth.errors.tempPasswordExpired'
            : status === 429
              ? 'auth.errors.locked'
              : status === 400
                ? 'auth.errors.currentPasswordIncorrect'
                : 'auth.errors.generic',
        ),
      );
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>{t('auth.changePasswordTitle')}</h1>
        <p className={styles.description}>
          {t(
            mustChangePassword
              ? 'auth.changePasswordRequired'
              : 'auth.changePasswordDescription',
          )}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {/* Lets password managers associate the new password with the account. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={user?.name ?? ''}
            readOnly
            hidden
          />
          <div className={styles.formGroup}>
            <label htmlFor="currentPassword">
              {t(
                mustChangePassword
                  ? 'auth.temporaryPassword'
                  : 'auth.currentPassword',
              )}
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="newPassword">{t('auth.newPassword')}</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="confirmPassword">
              {t('auth.confirmNewPassword')}
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? t('auth.submitting') : t('auth.changePasswordSubmit')}
          </button>
        </form>
      </div>
    </div>
  );
}
