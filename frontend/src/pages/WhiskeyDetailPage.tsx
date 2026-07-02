import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useWhiskey,
  useUpdateWhiskey,
  useRemoveWhiskeyFromEvent,
} from '@/hooks/useWhiskeys';
import { useEvent } from '@/hooks/useEvents';
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
  const { t, i18n } = useTranslation();
  const { data: whiskey, isLoading } = useWhiskey(eventId!, whiskeyId!);
  const { data: event } = useEvent(eventId!);
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
    if (confirm(t('whiskeyDetail.confirmRemoveRating'))) {
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
      distillery: whiskey.distillery || '',
      region: whiskey.region || '',
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
        distillery: editForm.distillery || undefined,
        region: editForm.region || undefined,
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
    if (confirm(t('whiskeyDetail.confirmDelete', { name: whiskey.name }))) {
      await removeWhiskey.mutateAsync({
        eventId,
        whiskeyId,
      });
      navigate(`/events/${eventId}`);
    }
  };

  if (isLoading)
    return <div className={styles.loading}>{t('common.loading')}</div>;
  if (!whiskey)
    return <div className={styles.error}>{t('whiskeyDetail.notFound')}</div>;

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to="/">{t('whiskeyDetail.breadcrumb')}</Link> /{' '}
        <Link to={`/events/${eventId}`}>{event?.name ?? eventId}</Link> /{' '}
        {whiskey.name}
      </div>

      <div className={styles.whiskeyHeader}>
        <div>
          <h1>{whiskey.name}</h1>
          <p className={styles.meta}>
            {[
              whiskey.distillery,
              whiskey.region,
              whiskey.age ? `${whiskey.age} ${t('whiskeyDetail.years')}` : null,
              whiskey.abv ? `${whiskey.abv}${t('whiskeyDetail.abv')}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
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
              {removeWhiskey.isPending
                ? t('common.deleting')
                : t('whiskeyDetail.deleteWhiskey')}
            </button>
          )}
          {!showEditForm && canEditWhiskey() && (
            <button className={styles.editBtn} onClick={startEditWhiskey}>
              {t('whiskeyDetail.editWhiskey')}
            </button>
          )}
        </div>
        <div className={styles.overallRating}>
          <div className={styles.ratingNumber}>
            {whiskey.ratingCount > 0 ? whiskey.averageRating.toFixed(1) : '—'}
          </div>
          <div className={styles.ratingLabel}>
            {whiskey.ratingCount > 0
              ? t('whiskeyDetail.ratingCount', { count: whiskey.ratingCount })
              : t('whiskeyDetail.noRatings')}
          </div>
        </div>
      </div>

      {showEditForm && (
        <form className={styles.form} onSubmit={handleWhiskeyEditSubmit}>
          <h2>{t('whiskeyDetail.editWhiskey')}</h2>
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
              <label>Distillery</label>
              <input
                type="text"
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
              <label>Region</label>
              <input
                type="text"
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
                placeholder={t('eventDetail.placeholders.tastingNotes')}
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
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={updateWhiskey.isPending}
            >
              {updateWhiskey.isPending
                ? t('common.saving')
                : t('common.saveChanges')}
            </button>
          </div>
        </form>
      )}

      {isAuthenticated && isTaster && (
        <div className={styles.myRatingSection}>
          <h2>{t('whiskeyDetail.yourRating')}</h2>
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
                  {t('common.edit')}
                </button>
                <button
                  className={styles.deleteBtn}
                  onClick={handleDeleteRating}
                >
                  {t('common.remove')}
                </button>
              </div>
            </div>
          ) : (
            <form className={styles.ratingForm} onSubmit={handleRate}>
              <div className={styles.scoreSelector}>
                <label>{t('whiskeyDetail.scoreLabel')}</label>
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
                <label>{t('whiskeyDetail.notesLabel')}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('whiskeyDetail.tastingNotesPlaceholder')}
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
                    {t('common.cancel')}
                  </button>
                )}
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={score === 0 || upsertRating.isPending}
                >
                  {upsertRating.isPending
                    ? t('common.saving')
                    : myRating
                      ? t('whiskeyDetail.updateRating')
                      : t('whiskeyDetail.submitRating')}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {isAuthenticated && !isTaster && (
        <div className={styles.signInPrompt}>
          <p>{t('whiskeyDetail.tasterRequired')}</p>
        </div>
      )}

      {!isAuthenticated && (
        <div className={styles.signInPrompt}>
          <a href="/.auth/login/google" className={styles.signInBtn}>
            {t('whiskeyDetail.signInPrompt')}
          </a>
        </div>
      )}

      <div className={styles.allRatings}>
        <h2>
          {t('whiskeyDetail.allRatings')} ({ratings?.length ?? 0})
        </h2>
        {ratings?.length === 0 ? (
          <p className={styles.empty}>{t('whiskeyDetail.noRatingsYet')}</p>
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
                    {new Date(rating.createdAt).toLocaleDateString(
                      i18n.language === 'fi' ? 'fi-FI' : 'en-GB',
                    )}
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
