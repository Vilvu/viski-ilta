import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllWhiskeys } from '@/hooks/useWhiskeys';
import { useAuth } from '@/hooks/useAuth';
import type { Whiskey } from '@/types';
import styles from './RankingPage.module.css';

const PAGE_SIZE = 50;

export default function RankingPage() {
  const [pageIndex, setPageIndex] = useState(0);
  const { data: whiskeys, isLoading, error } = useAllWhiskeys({
    top: PAGE_SIZE,
    skip: pageIndex * PAGE_SIZE
  });
  const { isTaster } = useAuth();

  const handlePrevPage = () => {
    if (pageIndex > 0) {
      setPageIndex(pageIndex - 1);
    }
  };

  const handleNextPage = () => {
    setPageIndex(pageIndex + 1);
  };

  if (isLoading) return <div className={styles.loading}>Loading rankings...</div>;
  if (error) return <div className={styles.error}>Error loading rankings.</div>;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Whiskey Rankings</h1>
      <p className={styles.subtitle}>
        All whiskeys ranked by average rating across all events.
      </p>

      {whiskeys?.length === 0 ? (
        <div className={styles.empty}>No whiskeys rated yet.</div>
      ) : (
        <>
          <div className={styles.list}>
            {whiskeys?.map((whiskey, index) => (
              <div key={whiskey.id} className={styles.whiskeyCard}>
                <div className={styles.rankNumber}>{pageIndex * PAGE_SIZE + index + 1}</div>
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
                    <span className={styles.ratingLabel}>Avg</span>
                    <span className={styles.ratingValue}>
                      {whiskey.ratingCount > 0
                        ? whiskey.averageRating.toFixed(1)
                        : '—'}
                    </span>
                  </div>
                  <div className={styles.ratingCount}>
                    ({whiskey.ratingCount} {whiskey.ratingCount === 1 ? 'rating' : 'ratings'})
                  </div>
                </div>
                {isTaster ? (
                  <Link
                    to={`/events/${whiskey.eventId}/whiskeys/${whiskey.id}`}
                    className={styles.detailLink}
                  >
                    View Details
                  </Link>
                ) : (
                  <Link
                    to={`/events/${whiskey.eventId}`}
                    className={styles.detailLink}
                  >
                    View Event
                  </Link>
                )}
              </div>
            ))}
          </div>
          
          <div className={styles.pagination}>
            <button 
              onClick={handlePrevPage} 
              disabled={pageIndex === 0}
              className={styles.paginationBtn}
            >
              Previous
            </button>
            <span className={styles.pageInfo}>
              Page {pageIndex + 1}
            </span>
            <button 
              onClick={handleNextPage}
              disabled={!whiskeys || whiskeys.length < PAGE_SIZE}
              className={styles.paginationBtn}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}