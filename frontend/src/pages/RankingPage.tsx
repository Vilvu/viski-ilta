import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAllWhiskeys } from '@/hooks/useWhiskeys';
import { useAuth } from '@/hooks/useAuth';

import styles from './RankingPage.module.css';

const PAGE_SIZE = 50;

export default function RankingPage() {
  const { t } = useTranslation();
  const { isTaster } = useAuth();
  const [pageIndex, setPageIndex] = useState(0);
  const {
    data: whiskeys,
    isLoading,
    error,
  } = useAllWhiskeys({
    top: PAGE_SIZE,
    skip: pageIndex * PAGE_SIZE,
  });

  const handlePrevPage = () => {
    if (pageIndex > 0) {
      setPageIndex(pageIndex - 1);
    }
  };

  const handleNextPage = () => {
    setPageIndex(pageIndex + 1);
  };

  if (isLoading)
    return <div className={styles.loading}>{t('common.loading')}</div>;
  if (error)
    return <div className={styles.error}>{t('ranking.loadFailed')}</div>;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('ranking.title')}</h1>
      <p className={styles.subtitle}>{t('ranking.subtitle')}</p>

      {whiskeys?.length === 0 ? (
        <div className={styles.empty}>{t('ranking.emptyMessage')}</div>
      ) : (
        <>
          <div className={styles.list}>
            {whiskeys?.map((whiskey, index) => {
              const CardContent = (
                <>
                  <div className={styles.rankNumber}>
                    {pageIndex * PAGE_SIZE + index + 1}
                  </div>
                  <div className={styles.whiskeyInfo}>
                    <h3>{whiskey.name}</h3>
                    <p className={styles.whiskeyMeta}>
                      {whiskey.distillery} · {whiskey.region}
                      {whiskey.age ? ` · ${whiskey.age}yr` : ''}
                      {whiskey.abv ? ` · ${whiskey.abv}%` : ''}
                    </p>
                  </div>
                  <div className={styles.ratings}>
                    <div className={styles.ratingBadge}>
                      <span className={styles.ratingLabel}>
                        {t('ranking.avgBadge')}
                      </span>
                      <span className={styles.ratingValue}>
                        {whiskey.globalRatingCount > 0
                          ? whiskey.globalAverageRating.toFixed(1)
                          : '—'}
                      </span>
                    </div>
                    <div className={styles.ratingCount}>
                      (
                      {t('ranking.ratingCount', {
                        count: whiskey.globalRatingCount,
                        defaultValue:
                          whiskey.globalRatingCount === 1
                            ? `${whiskey.globalRatingCount} ${t('ranking.ratingCount_one')}`
                            : `${whiskey.globalRatingCount} ${t('ranking.ratingCount_other')}`,
                      })}
                      )
                    </div>
                  </div>
                </>
              );

              return isTaster ? (
                <Link
                  key={whiskey.id}
                  to={`/whiskeys/${whiskey.id}`}
                  className={`${styles.whiskeyCard} ${styles.whiskeyCardLink}`}
                >
                  {CardContent}
                </Link>
              ) : (
                <div key={whiskey.id} className={styles.whiskeyCard}>
                  {CardContent}
                </div>
              );
            })}
          </div>

          <div className={styles.pagination}>
            <button
              onClick={handlePrevPage}
              disabled={pageIndex === 0}
              className={styles.paginationBtn}
            >
              {t('common.previous')}
            </button>
            <span className={styles.pageInfo}>
              {t('ranking.pageInfo', { page: pageIndex + 1 })}
            </span>
            <button
              onClick={handleNextPage}
              disabled={!whiskeys || whiskeys.length < PAGE_SIZE}
              className={styles.paginationBtn}
            >
              {t('common.next')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
