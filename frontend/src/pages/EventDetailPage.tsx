import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useEvent } from '@/hooks/useEvents';
import {
  useWhiskeys,
  useCreateWhiskey,
  useDeleteWhiskey,
} from '@/hooks/useWhiskeys';
import { useAuth } from '@/hooks/useAuth';
import type { CreateWhiskeyInput } from '@/api/whiskeys';
import styles from './EventDetailPage.module.css';

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { data: event, isLoading: eventLoading } = useEvent(eventId!);
  const { data: whiskeys, isLoading: whiskeysLoading } = useWhiskeys(eventId!);
  const { isAdmin } = useAuth();
  const createWhiskey = useCreateWhiskey();
  const deleteWhiskey = useDeleteWhiskey();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<CreateWhiskeyInput, 'eventId'>>({
    name: '',
    distillery: '',
    region: '',
    age: undefined,
    abv: undefined,
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createWhiskey.mutateAsync({ ...form, eventId: eventId! });
    setForm({
      name: '',
      distillery: '',
      region: '',
      age: undefined,
      abv: undefined,
      description: '',
    });
    setShowForm(false);
  };

  if (eventLoading)
    return <div className={styles.loading}>Loading event...</div>;
  if (!event) return <div className={styles.error}>Event not found.</div>;

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to="/">Events</Link> / {event.name}
      </div>

      <div className={styles.eventHeader}>
        <div>
          <h1>{event.name}</h1>
          <p className={styles.meta}>
            📅{' '}
            {new Date(event.date).toLocaleDateString('en-FI', {
              dateStyle: 'long',
            })}{' '}
            · 📍 {event.location}
          </p>
          {event.description && (
            <p className={styles.description}>{event.description}</p>
          )}
        </div>
        {isAdmin && (
          <button
            className={styles.addBtn}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : '+ Add Whiskey'}
          </button>
        )}
      </div>

      {showForm && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <h2>Add Whiskey</h2>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Glenfiddich 12"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Distillery *</label>
              <input
                type="text"
                required
                value={form.distillery}
                onChange={(e) =>
                  setForm((f) => ({ ...f, distillery: e.target.value }))
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
                value={form.region}
                onChange={(e) =>
                  setForm((f) => ({ ...f, region: e.target.value }))
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
                value={form.age ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
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
                value={form.abv ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
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
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={2}
              placeholder="Tasting notes, style..."
            />
          </div>
          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={createWhiskey.isPending}
            >
              {createWhiskey.isPending ? 'Adding...' : 'Add Whiskey'}
            </button>
          </div>
        </form>
      )}

      <h2 className={styles.sectionTitle}>
        Whiskeys ({whiskeys?.length ?? 0})
      </h2>

      {whiskeysLoading ? (
        <div className={styles.loading}>Loading whiskeys...</div>
      ) : whiskeys?.length === 0 ? (
        <div className={styles.empty}>
          No whiskeys added yet. {isAdmin ? 'Add the first one!' : ''}
        </div>
      ) : (
        <div className={styles.list}>
          {whiskeys?.map((whiskey) => (
            <div key={whiskey.id} className={styles.whiskeyCard}>
              <Link
                to={`/events/${eventId}/whiskeys/${whiskey.id}`}
                className={styles.whiskeyLink}
              >
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
                  {whiskey.userRating !== undefined && (
                    <div
                      className={styles.ratingBadge + ' ' + styles.userRating}
                    >
                      <span className={styles.ratingLabel}>You</span>
                      <span className={styles.ratingValue}>
                        {whiskey.userRating}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
              {isAdmin && (
                <button
                  className={styles.deleteBtn}
                  onClick={() => {
                    if (confirm(`Delete "${whiskey.name}"?`)) {
                      deleteWhiskey.mutate({
                        eventId: eventId!,
                        whiskeyId: whiskey.id,
                      });
                    }
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
