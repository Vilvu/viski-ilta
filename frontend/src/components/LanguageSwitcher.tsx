import { useTranslation } from 'react-i18next';
import styles from './LanguageSwitcher.module.css';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className={styles.languageSwitcher}>
      <button
        className={`${styles.button} ${i18n.language === 'fi' ? styles.active : ''}`}
        onClick={() => handleLanguageChange('fi')}
        title={t('nav.language')}
      >
        FI
      </button>
      <button
        className={`${styles.button} ${i18n.language === 'en' ? styles.active : ''}`}
        onClick={() => handleLanguageChange('en')}
        title={t('nav.language')}
      >
        EN
      </button>
    </div>
  );
}
