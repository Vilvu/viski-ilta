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
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = profile?.displayName ?? user?.name ?? '';

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link to="/" className={styles.logo}>
            🥃<span className={styles.logoText}>Whisky Tasting</span>
          </Link>
          <nav className={styles.nav}>
  <Link to="/">Events</Link>
  <Link to="/ranking">Ranking</Link>
  {!isLoading &&
    (isAuthenticated ? (
      <div className={styles.userMenu}>
        {!isLoading && isAuthenticated && <span className={styles.userName}>{displayName}</span>}
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
      <>
        {!isLoading && isAuthenticated && <span className={styles.userName}>{displayName}</span>}
        <a href="/.auth/login/aad" className={styles.signInBtn}>
          Sign in
        </a>
      </>
    ))}
</nav>
          <button
            className={styles.hamburger}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            ☰
          </button>
        </div>
        <div className={`${styles.mobileMenu} ${menuOpen ? styles.open : ''}`}>
          <a href="/" onClick={() => setMenuOpen(false)}>Events</a>
          <a href="/ranking" onClick={() => setMenuOpen(false)}>Ranking</a>
          {!isLoading &&
            (isAuthenticated ? (
              <>
                <hr className={styles.mobileMenuDivider} />
                {!isLoading && isAuthenticated && <span className={styles.userName}>{displayName}</span>}
                <button
                  type="button"
                  className={styles.editBtn}
                  onClick={() => {
                    setShowEditModal(true);
                    setMenuOpen(false);
                  }}
                  title="Edit display name"
                >
                  ✏️ Edit name
                </button>
                <a href="/.auth/logout" onClick={() => setMenuOpen(false)}>Sign out</a>
              </>
            ) : (
              <a href="/.auth/login/aad" className={styles.signInBtn} onClick={() => setMenuOpen(false)}>
                Sign in
              </a>
            ))}
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
