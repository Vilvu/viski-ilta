import { useState, useEffect, useCallback } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import UsernameSetupModal from './UsernameSetupModal';
import EditDisplayNameModal from './EditDisplayNameModal';
import { LanguageSwitcher } from './LanguageSwitcher';
import styles from './Layout.module.css';

export default function Layout() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const {
    data: profile,
    isLoading: profileLoading,
    hasProfile,
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
                   <a href="/.auth/logout">{t('nav.signOut')}</a>
                 </div>
               ) : (
                 <>
                   {!isLoading && isAuthenticated && (
                     <span className={styles.userName}>{displayName}</span>
                   )}
                   <a href="/.auth/login/aad" className={styles.signInBtn}>
                     {t('nav.signIn')}
                   </a>
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
                     <a href="/.auth/logout" onClick={closeMenu} role="menuitem">
                       {t('nav.signOut')}
                     </a>
                   </>
                 ) : (
                   <a
                     href="/.auth/login/aad"
                     className={styles.signInBtn}
                     onClick={closeMenu}
                     role="menuitem"
                   >
                     {t('nav.signIn')}
                   </a>
                 ))}
             </div>
          </>
        )}
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
         <p>© 2024 {t('app.name')}</p>
       </footer>
      {isAuthenticated &&
        !isLoading &&
        !profileLoading &&
        !hasProfile &&
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
