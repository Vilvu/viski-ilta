import { Link } from 'react-router-dom';
import styles from './NotFoundPage.module.css';

export default function NotFoundPage() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.emoji}>🥃</div>
        <h1>404 — Page Not Found</h1>
        <p>This dram seems to have evaporated.</p>
        <Link to="/" className={styles.homeLink}>
          Back to Events
        </Link>
      </div>
    </div>
  );
}
