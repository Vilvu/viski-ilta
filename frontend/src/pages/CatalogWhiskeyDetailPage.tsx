import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useCatalogWhiskey,
  useUpdateWhiskey,
  useDeleteCatalogWhiskey,
} from '@/hooks/useWhiskeys';
import { useWhiskeyRatingsGlobally } from '@/hooks/useRatings';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import type { UpdateCatalogWhiskeyInput } from '@/api/whiskeys';
import styles from './CatalogWhiskeyDetailPage.module.css';

export default function CatalogWhiskeyDetailPage() {
  const { whiskeyId } = useParams<{
    whiskeyId: string;
  }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { data: whiskey, isLoading } = useCatalogWhiskey(whiskeyId!);
  const { data: ratings } = useWhiskeyRatingsGlobally(whiskeyId!);
  const { isTaster, user, isAdmin } = useAuth();

  const updateWhiskey = useUpdateWhiskey();
  const deleteWhiskey = useDeleteCatalogWhiskey();

  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState<UpdateCatalogWhiskeyInput>({
    name: '',
    distillery: '',
    region: '',
    age: undefined,
    abv: undefined,
    description: '',
  });

  const canEditWhiskey = (): boolean => {
    if (!whiskey) return false;
    if (isAdmin) return true;
    if (isTaster && user && whiskey.createdByUserId === user.id) return true;
    return false;
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
    if (!whiskeyId || !whiskey) return;
    if (confirm(t('whiskeyDetail.confirmDelete', { name: whiskey.name }))) {
      try {
        await deleteWhiskey.mutateAsync(whiskeyId);
        navigate(`/ranking`);
      } catch (error: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = error as any;
        if (err.response?.status === 409) {
          alert(t('whiskeyDetail.cannotDeleteLinked'));
        } else {
          console.error(err);
          alert(t('common.error'));
        }
      }
    }
  };

  if (isLoading)
    return <div className={styles.loading}>{t('common.loading')}</div>;
  if (!whiskey)
    return <div className={styles.error}>{t('whiskeyDetail.notFound')}</div>;

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to="/ranking">{t('ranking.title')}</Link> / {whiskey.name}
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
          {showEditForm && canEditWhiskey() && (
            <button
              className={styles.deleteWhiskeyBtn}
              onClick={handleDeleteWhiskey}
              disabled={deleteWhiskey.isPending}
            >
              {deleteWhiskey.isPending
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
            {whiskey.globalRatingCount > 0
              ? whiskey.globalAverageRating.toFixed(1)
              : '—'}
          </div>
          <div className={styles.ratingLabel}>
            {whiskey.globalRatingCount > 0
              ? t('whiskeyDetail.ratingCount', {
                  count: whiskey.globalRatingCount,
                })
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
