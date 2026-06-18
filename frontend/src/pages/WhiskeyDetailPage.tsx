import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  useWhiskey,
  useUpdateWhiskey,
  useRemoveWhiskeyFromEvent,
} from '@/hooks/useWhiskeys';
import {
  useRatings,
  useUpsertRating,
  useDeleteRating,
} from '@/hooks/useRatings';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import type { UpdateCatalogWhiskeyInput } from '@/api/whiskeys';
import styles from './WhiskeyDetailPage.module.css';

export default function WhiskeyDetailPage() {
  const { eventId, whiskeyId } = useParams<{
    eventId: string;
    whiskeyId: string;
  }>();
  const navigate = useNavigate();
  const { data: whiskey, isLoading } = useWhiskey(eventId!, whiskeyId!);
  const { data: ratings } = useRatings(eventId!, whiskeyId!);
  const { isAuthenticated, isTaster, user, isAdmin } = useAuth();
  const upsertRating = useUpsertRating();
  const deleteRating = useDeleteRating();
  const updateWhiskey = useUpdateWhiskey();
  const removeWhiskey = useRemoveWhiskeyFromEvent();
  const [score, setScore] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState<UpdateCatalogWhiskeyInput>({
    name: '',
    distillery: '',
    region: '',
    age: undefined,
    abv: undefined,
    description: '',
  });

  const myRating = ratings?.find((r) => r.userId === user?.id);

  const canEditWhiskey = (): boolean => {
    if (!whiskey) return false;
    if (isAdmin) return true;
    if (isTaster && user && whiskey.createdByUserId === user.id) return true;
    return false;
  };

  const canDeleteWhiskey = (): boolean => canEditWhiskey();

  const handleRate = async (e: React.FormEvent) => {
    e.preventDefault();
    await upsertRating.mutateAsync({
      eventId: eventId!,
      whiskeyId: whiskeyId!,
      input: {
        score,
        notes,
      },
    });
    setEditMode(false);
  };

  const handleDeleteRating = async () => {
    if (confirm('Remove your rating?')) {
      await deleteRating.mutateAsync({
        eventId: eventId!,
        whiskeyId: whiskeyId!,
      });
    }
  };

  const startEditWhiskey = () => {
    if (!whiskey) return;
    setEditForm({
      name: whiskey.name,
      distillery: whiskey.distillery,
      region: whiskey.region,
      age: whiskey.age,
      abv: whiskey.abv,
      description: whiskey.description,
    });
    setShowEditForm(true);
  };

  const handleWhiskeyEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whiskeyId) return;
    await updateWhiskey.mutateAsync({
      whiskeyId,
      input: {
        name: editForm.name,
        distillery: editForm.distillery,
        region: editForm.region,
        age: editForm.age,
        abv: editForm.abv,
        description: editForm.description,
      },
    });
    setShowEditForm(false);
    setEditForm({
      name: '',
      distillery: '',
      region: '',
      age: undefined,
      abv: undefined,
      description: '',
    });
  };

  const handleDeleteWhiskey = async () => {
    if (!eventId || !whiskeyId || !whiskey) return;
    if (confirm(`Delete "${whiskey.name}"? This action cannot be undone.`)) {
      await removeWhiskey.mutateAsync({
        eventId,
        whiskeyId,
      });
      navigate(`/events/${eventId}`);
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
         <div className={styles.headerActions}>
           {showEditForm && canDeleteWhiskey() && (
             <button
               className={styles.deleteWhiskeyBtn}
               onClick={handleDeleteWhiskey}
               disabled={removeWhiskey.isPending}
             >
               {removeWhiskey.isPending ? 'Deleting...' : 'Delete Whiskey'}
             </button>
           )}
           {!showEditForm && canEditWhiskey() && (
             <button className={styles.editBtn} onClick={startEditWhiskey}>
               Edit Whiskey
             </button>
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

       {showEditForm && (
         <form className={styles.form} onSubmit={handleWhiskeyEditSubmit}>
           <h2>Edit Whiskey</h2>
           <div className={styles.formRow}>
             <div className={styles.formGroup}>
               <label>Name *</label>
               <input
                 type="text"
                 required
                 value={editForm.name}
                 onChange={(e) =>
                   setEditForm((f) => ({ ...f, name: e.target.value }))
                 }
                 placeholder="e.g. Glenfiddich 12"
               />
             </div>
             <div className={styles.formGroup}>
               <label>Distillery *</label>
               <input
                 type="text"
                 required
                 value={editForm.distillery}
                 onChange={(e) =>
                   setEditForm((f) => ({
                     ...f,
                     distillery: e.target.value,
                   }))
                 }
                 placeholder="e.g. Glenfiddich"
               />
             </div>
           </div>
           <div className={styles.formRow}>
             <div className={styles.formGroup}>
               <label>Region *</label>
               <input
                 type="text"
                 required
                 value={editForm.region}
                 onChange={(e) =>
                   setEditForm((f) => ({ ...f, region: e.target.value }))
                 }
                 placeholder="e.g. Speyside"
               />
             </div>
             <div className={styles.formGroup}>
               <label>Age (years)</label>
               <input
                 type="number"
                 min="1"
                 max="100"
                 value={editForm.age ?? ''}
                 onChange={(e) =>
                   setEditForm((f) => ({
                     ...f,
                     age: e.target.value ? Number(e.target.value) : undefined,
                   }))
                 }
               />
             </div>
             <div className={styles.formGroup}>
               <label>ABV (%)</label>
               <input
                 type="number"
                 min="1"
                 max="100"
                 step="0.1"
                 value={editForm.abv ?? ''}
                 onChange={(e) =>
                   setEditForm((f) => ({
                     ...f,
                     abv: e.target.value ? Number(e.target.value) : undefined,
                   }))
                 }
               />
             </div>
           </div>
           <div className={styles.formGroup}>
             <label>Description</label>
             <textarea
               value={editForm.description}
               onChange={(e) =>
                 setEditForm((f) => ({
                   ...f,
                   description: e.target.value,
                 }))
               }
               rows={2}
               placeholder="Tasting notes, style..."
             />
           </div>
           <div className={styles.formActions}>
             <button
               type="button"
               className={styles.cancelBtn}
               onClick={() => {
                 setShowEditForm(false);
                 setEditForm({
                   name: '',
                   distillery: '',
                   region: '',
                   age: undefined,
                   abv: undefined,
                   description: '',
                 });
               }}
             >
               Cancel
             </button>
             <button
               type="submit"
               className={styles.submitBtn}
               disabled={updateWhiskey.isPending}
             >
               {updateWhiskey.isPending ? 'Saving...' : 'Save Changes'}
             </button>
           </div>
         </form>
       )}

       {isAuthenticated && isTaster && (
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

      {isAuthenticated && !isTaster && (
        <div className={styles.signInPrompt}>
          <p>Taster role required to submit ratings.</p>
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
