import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/api/auth';
import styles from './LoginPage.module.css';

type Mode = 'signIn' | 'register';

// Mirrors the server-side rules in api/src/functions/auth.ts.
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;

function errorKeyForStatus(status: number | undefined, mode: Mode): string {
  if (status === 401) return 'auth.errors.invalidCredentials';
  if (status === 409) return 'auth.errors.usernameTaken';
  if (status === 429) return 'auth.errors.locked';
  if (status === 400 && mode === 'register') {
    return 'auth.errors.usernameInvalid';
  }
  return 'auth.errors.generic';
}

export default function LoginPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('signIn');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === 'register';

  const switchMode = () => {
    setMode(isRegister ? 'signIn' : 'register');
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const validate = (): string | null => {
    if (!isRegister) {
      return username && password ? null : 'auth.errors.invalidCredentials';
    }
    if (!USERNAME_PATTERN.test(username)) return 'auth.errors.usernameInvalid';
    if (password.length < MIN_PASSWORD_LENGTH) {
      return 'auth.errors.passwordTooShort';
    }
    if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
      return 'auth.errors.passwordTooLong';
    }
    if (password !== confirmPassword) return 'auth.errors.passwordMismatch';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(t(validationError));
      return;
    }

    setSubmitting(true);
    try {
      const credentials = { username: username.trim(), password };
      if (isRegister) {
        await authApi.register(credentials);
      } else {
        await authApi.login(credentials);
      }
      // Full reload so identity and all cached queries pick up the session.
      window.location.assign('/');
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      setError(t(errorKeyForStatus(status, mode)));
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>{t(isRegister ? 'auth.registerTitle' : 'auth.signInTitle')}</h1>
        <p className={styles.description}>
          {t(
            isRegister ? 'auth.registerDescription' : 'auth.signInDescription',
          )}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.formGroup}>
            <label htmlFor="username">{t('auth.username')}</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={32}
              autoFocus
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="password">{t('auth.password')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </div>
          {isRegister && (
            <div className={styles.formGroup}>
              <label htmlFor="confirmPassword">
                {t('auth.confirmPassword')}
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting
              ? t('auth.submitting')
              : t(isRegister ? 'auth.registerSubmit' : 'auth.signInSubmit')}
          </button>
        </form>

        <button
          type="button"
          className={styles.switchMode}
          onClick={switchMode}
        >
          {t(isRegister ? 'auth.switchToSignIn' : 'auth.switchToRegister')}
        </button>

        <div className={styles.divider}>
          <span>{t('auth.or')}</span>
        </div>

        <a href="/.auth/login/aad" className={styles.microsoft}>
          {t('auth.microsoft')}
        </a>
      </div>
    </div>
  );
}
