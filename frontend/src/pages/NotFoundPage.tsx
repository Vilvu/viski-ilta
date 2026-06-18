import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './NotFoundPage.module.css';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.emoji}>🥃</div>
        <h1>{t('notFound.heading')}</h1>
        <p>{t('notFound.evaporated')}</p>
        <Link to="/" className={styles.homeLink}>
          {t('notFound.backToEvents')}
        </Link>
      </div>
    </div>
  );
}
