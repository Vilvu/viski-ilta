import { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import UsernameSetupModal from './UsernameSetupModal';
import EditDisplayNameModal from './EditDisplayNameModal';
import styles from './Layout.module.css';

export default function Layout() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { data: profile, isLoading: profileLoading, hasProfile } = useUserProfile();
  const [showEditModal, setShowEditModal] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);

  const displayName = profile?.displayName ?? user?.name ?? '';

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link to="/" className={styles.logo}>
            🥃 Whisky Tasting
          </Link>
          <nav className={styles.nav}>
            <Link to="/">Events</Link>
            {!isLoading &&
              (isAuthenticated ? (
                <div className={styles.userMenu}>
                  <span className={styles.userName}>{displayName}</span>
                  <button
                    type="button"
                    className={styles.editBtn}
                    onClick={() => setShowEditModal(true)}
                    title="Edit display name"
                  >
                    ✏️
                  </button>
                  <a href="/.auth/logout">Sign out</a>
                </div>
              ) : (
                <a href="/.auth/login/aad" className={styles.signInBtn}>
                  Sign in with Microsoft
                </a>
              ))}
          </nav>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <p>© 2024 Whisky Tasting App</p>
      </footer>
      {isAuthenticated && !isLoading && !profileLoading && !hasProfile && !setupDismissed && (
        <UsernameSetupModal defaultName={user?.name ?? ''} onClose={() => setSetupDismissed(true)} />
      )}
      {showEditModal && (
        <EditDisplayNameModal currentName={displayName} onClose={() => setShowEditModal(false)} />
      )}
    </div>
  );
}
