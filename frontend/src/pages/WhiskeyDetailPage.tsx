import { useParams, Link } from 'react-router-dom';
import { useWhiskey } from '@/hooks/useWhiskeys';
import {
  useRatings,
  useUpsertRating,
  useDeleteRating,
} from '@/hooks/useRatings';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import styles from './WhiskeyDetailPage.module.css';

export default function WhiskeyDetailPage() {
  const { eventId, whiskeyId } = useParams<{
    eventId: string;
    whiskeyId: string;
  }>();
  const { data: whiskey, isLoading } = useWhiskey(eventId!, whiskeyId!);
  const { data: ratings } = useRatings(whiskeyId!);
  const { isAuthenticated, user } = useAuth();
  const upsertRating = useUpsertRating();
  const deleteRating = useDeleteRating();
  const [score, setScore] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [editMode, setEditMode] = useState(false);

  const myRating = ratings?.find((r) => r.userId === user?.id);

  const handleRate = async (e: React.FormEvent) => {
    e.preventDefault();
    await upsertRating.mutateAsync({
      whiskeyId: whiskeyId!,
      eventId: eventId!,
      score,
      notes,
    });
    setEditMode(false);
  };

  const handleDeleteRating = async () => {
    if (confirm('Remove your rating?')) {
      await deleteRating.mutateAsync({ whiskeyId: whiskeyId! });
    }
  };

  if (isLoading) return <div className={styles.loading}>Loading...</div>;
  if (!whiskey) return <div className={styles.error}>Whiskey not found.</div>;

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to="/">Events</Link> /{' '}
        <Link to={`/events/${eventId}`}>Event</Link> / {whiskey.name}
      </div>

      <div className={styles.whiskeyHeader}>
        <div>
          <h1>{whiskey.name}</h1>
          <p className={styles.meta}>
            {whiskey.distillery} · {whiskey.region}
            {whiskey.age ? ` · ${whiskey.age} years` : ''}
            {whiskey.abv ? ` · ${whiskey.abv}% ABV` : ''}
          </p>
          {whiskey.description && (
            <p className={styles.description}>{whiskey.description}</p>
          )}
        </div>
        <div className={styles.overallRating}>
          <div className={styles.ratingNumber}>
            {whiskey.ratingCount > 0 ? whiskey.averageRating.toFixed(1) : '—'}
          </div>
          <div className={styles.ratingLabel}>
            {whiskey.ratingCount > 0
              ? `${whiskey.ratingCount} rating${whiskey.ratingCount !== 1 ? 's' : ''}`
              : 'No ratings yet'}
          </div>
        </div>
      </div>

      {isAuthenticated && (
        <div className={styles.myRatingSection}>
          <h2>Your Rating</h2>
          {myRating && !editMode ? (
            <div className={styles.myRatingDisplay}>
              <div className={styles.myScore}>{myRating.score}/10</div>
              {myRating.notes && (
                <p className={styles.myNotes}>{myRating.notes}</p>
              )}
              <div className={styles.myRatingActions}>
                <button
                  className={styles.editBtn}
                  onClick={() => {
                    setScore(myRating.score);
                    setNotes(myRating.notes ?? '');
                    setEditMode(true);
                  }}
                >
                  Edit
                </button>
                <button
                  className={styles.deleteBtn}
                  onClick={handleDeleteRating}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <form className={styles.ratingForm} onSubmit={handleRate}>
              <div className={styles.scoreSelector}>
                <label>Score (1–10)</label>
                <div className={styles.scoreButtons}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`${styles.scoreBtn} ${score === n ? styles.selected : ''}`}
                      onClick={() => setScore(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.formGroup}>
                <label>Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Tasting notes, impressions..."
                  rows={3}
                />
              </div>
              <div className={styles.formActions}>
                {editMode && (
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setEditMode(false)}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={score === 0 || upsertRating.isPending}
                >
                  {upsertRating.isPending
                    ? 'Saving...'
                    : myRating
                      ? 'Update Rating'
                      : 'Submit Rating'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {!isAuthenticated && (
        <div className={styles.signInPrompt}>
          <a href="/.auth/login/google" className={styles.signInBtn}>
            Sign in with Google to rate this whiskey
          </a>
        </div>
      )}

      <div className={styles.allRatings}>
        <h2>All Ratings ({ratings?.length ?? 0})</h2>
        {ratings?.length === 0 ? (
          <p className={styles.empty}>No ratings yet. Be the first!</p>
        ) : (
          <div className={styles.ratingsList}>
            {ratings?.map((rating) => (
              <div key={rating.id} className={styles.ratingItem}>
                <div className={styles.ratingScore}>{rating.score}</div>
                <div className={styles.ratingContent}>
                  <div className={styles.ratingUser}>{rating.userName}</div>
                  {rating.notes && (
                    <p className={styles.ratingNotes}>{rating.notes}</p>
                  )}
                  <div className={styles.ratingDate}>
                    {new Date(rating.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
