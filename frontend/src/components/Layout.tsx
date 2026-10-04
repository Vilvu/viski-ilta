import { useState, useEffect, useCallback } from 'react';
import { Outlet, Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import UsernameSetupModal from './UsernameSetupModal';
import EditDisplayNameModal from './EditDisplayNameModal';
import { LanguageSwitcher } from './LanguageSwitcher';
import { authApi } from '@/api/auth';
import styles from './Layout.module.css';

export default function Layout() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading, isAdmin, mustChangePassword } =
    useAuth();
  const location = useLocation();
  const {
    data: profile,
    isLoading: profileLoading,
    needsUsernameSetup,
  } = useUserProfile();
  const [showEditModal, setShowEditModal] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [menuOpen, closeMenu]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = () => {
      if (mq.matches) closeMenu();
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [closeMenu]);

  const displayName = profile?.displayName ?? user?.name ?? '';
  const isNativeAccount = user?.provider === 'local';

  // Entra ID sessions are owned by SWA (/.auth/logout); native sessions are
  // an app cookie that only the API can clear.
  const handleNativeSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    closeMenu();
    try {
      await authApi.logout();
    } finally {
      window.location.assign('/');
    }
  };

  // Signed in with a temporary password: nothing else works until it's changed.
  if (mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link to="/" className={styles.logo}>
            🥃<span className={styles.logoText}>{t('app.name')}</span>
          </Link>
          <nav className={styles.nav}>
            <Link to="/">{t('nav.events')}</Link>
            <Link to="/ranking">{t('nav.ranking')}</Link>
            {!isLoading && isAdmin && (
              <Link to="/admin/users">{t('nav.userManagement')}</Link>
            )}
            {!isLoading &&
              (isAuthenticated ? (
                <div className={styles.userMenu}>
                  {!isLoading && isAuthenticated && (
                    <span className={styles.userName}>{displayName}</span>
                  )}
                  <button
                    type="button"
                    className={styles.editBtn}
                    onClick={() => setShowEditModal(true)}
                    title={t('nav.editDisplayNameTitle')}
                  >
                    ✏️
                  </button>
                  {isNativeAccount && (
                    <Link
                      to="/change-password"
                      className={styles.editBtn}
                      title={t('nav.changePassword')}
                      aria-label={t('nav.changePassword')}
                    >
                      🔑
                    </Link>
                  )}
                  <a
                    href="/.auth/logout"
                    onClick={isNativeAccount ? handleNativeSignOut : undefined}
                  >
                    {t('nav.signOut')}
                  </a>
                </div>
              ) : mustChangePassword ? (
                // Half signed in with a temporary password: allow backing out.
                <a href="/" onClick={handleNativeSignOut}>
                  {t('nav.signOut')}
                </a>
              ) : (
                <>
                  {!isLoading && isAuthenticated && (
                    <span className={styles.userName}>{displayName}</span>
                  )}
                  <Link to="/login" className={styles.signInBtn}>
                    {t('nav.signIn')}
                  </Link>
                </>
              ))}
            <LanguageSwitcher />
          </nav>
          <div className={styles.mobileHeaderRight}>
            {isAuthenticated && !isLoading && (
              <span className={styles.mobileUsername}>{displayName}</span>
            )}
            <button
              className={styles.hamburger}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={t('nav.openMenu')}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              ☰
            </button>
          </div>
        </div>
        {menuOpen && (
          <>
            <div className={styles.backdrop} onClick={closeMenu} />
            <div className={styles.popout} role="menu">
              <a href="/" onClick={closeMenu} role="menuitem">
                {t('nav.events')}
              </a>
              <a href="/ranking" onClick={closeMenu} role="menuitem">
                {t('nav.ranking')}
              </a>
              {!isLoading && isAdmin && (
                <a href="/admin/users" onClick={closeMenu} role="menuitem">
                  {t('nav.userManagement')}
                </a>
              )}
              <LanguageSwitcher />
              {!isLoading &&
                (isAuthenticated ? (
                  <>
                    <hr className={styles.popoutDivider} />
                    <button
                      type="button"
                      className={styles.editBtn}
                      onClick={() => {
                        setShowEditModal(true);
                        closeMenu();
                      }}
                      title={t('nav.editDisplayNameTitle')}
                      role="menuitem"
                    >
                      {t('nav.editName')}
                    </button>
                    {isNativeAccount && (
                      <Link
                        to="/change-password"
                        onClick={closeMenu}
                        role="menuitem"
                      >
                        {t('nav.changePassword')}
                      </Link>
                    )}
                    <a
                      href="/.auth/logout"
                      onClick={
                        isNativeAccount ? handleNativeSignOut : closeMenu
                      }
                      role="menuitem"
                    >
                      {t('nav.signOut')}
                    </a>
                  </>
                ) : mustChangePassword ? (
                  <a href="/" onClick={handleNativeSignOut} role="menuitem">
                    {t('nav.signOut')}
                  </a>
                ) : (
                  <Link
                    to="/login"
                    className={styles.signInBtn}
                    onClick={closeMenu}
                    role="menuitem"
                  >
                    {t('nav.signIn')}
                  </Link>
                ))}
            </div>
          </>
        )}
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <p>© 2026 {t('app.name')}</p>
      </footer>
      {isAuthenticated &&
        !isLoading &&
        !profileLoading &&
        needsUsernameSetup &&
        !setupDismissed && (
          <UsernameSetupModal
            defaultName={user?.name ?? ''}
            onClose={() => setSetupDismissed(true)}
          />
        )}
      {showEditModal && (
        <EditDisplayNameModal
          currentName={displayName}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
}
