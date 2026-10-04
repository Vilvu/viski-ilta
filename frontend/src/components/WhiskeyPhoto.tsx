import { useTranslation } from 'react-i18next';
import { whiskeyImageUrl } from '@/api/whiskeys';
import styles from './WhiskeyPhoto.module.css';

interface WhiskeyPhotoProps {
  whiskey: { id: string; name: string; imageUpdatedAt?: string };
  size?: 'thumb' | 'large';
}

/** Bottle photo in a fixed-size box, with a placeholder when there is none. */
export default function WhiskeyPhoto({
  whiskey,
  size = 'thumb',
}: WhiskeyPhotoProps) {
  const { t } = useTranslation();
  const url = whiskeyImageUrl(whiskey);
  const className = `${styles.photo} ${size === 'large' ? styles.large : styles.thumb}`;

  if (!url) {
    return (
      <div
        className={`${className} ${styles.placeholder}`}
        role="img"
        aria-label={t('whiskeyForm.noPhoto')}
      >
        🥃
      </div>
    );
  }

  return (
    <img
      className={className}
      src={url}
      alt={t('whiskeyForm.photoAlt', { name: whiskey.name })}
      loading="lazy"
    />
  );
}
