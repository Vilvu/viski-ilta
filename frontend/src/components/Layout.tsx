import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import styles from './Layout.module.css';

export default function Layout() {
  const { user, isAuthenticated, isLoading } = useAuth();

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
                  <span className={styles.userName}>{user?.name}</span>
                  <a href="/.auth/logout">Sign out</a>
                </div>
              ) : (
                <a href="/.auth/login/google" className={styles.signInBtn}>
                  Sign in with Google
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
    </div>
  );
}
