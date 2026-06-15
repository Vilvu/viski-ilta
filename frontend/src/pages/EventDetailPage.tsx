import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useEvent } from '@/hooks/useEvents';
import {
  useWhiskeys,
  useCreateWhiskey,
  useDeleteWhiskey,
  useUpdateWhiskey,
} from '@/hooks/useWhiskeys';
import { useUpdateEvent } from '@/hooks/useEvents';
import { useAuth } from '@/hooks/useAuth';
import type { CreateWhiskeyInput, UpdateWhiskeyInput } from '@/api/whiskeys';
import type { UpdateEventInput } from '@/api/events';
import type { Whiskey } from '@/types';
import styles from './EventDetailPage.module.css';

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { data: event, isLoading: eventLoading } = useEvent(eventId!);
  const { data: whiskeys, isLoading: whiskeysLoading } = useWhiskeys(eventId!);
  const { isAdmin, isTaster, user } = useAuth();
  const createWhiskey = useCreateWhiskey();
  const deleteWhiskey = useDeleteWhiskey();
  const updateWhiskey = useUpdateWhiskey();
  const updateEvent = useUpdateEvent();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<CreateWhiskeyInput, 'eventId'>>({
    name: '',
    distillery: '',
    region: '',
    age: undefined,
    abv: undefined,
    description: '',
  });
  const [editingWhiskeyId, setEditingWhiskeyId] = useState<string | null>(null);
  const [editWhiskeyForm, setEditWhiskeyForm] = useState<UpdateWhiskeyInput>({
    eventId: eventId!,
    whiskeyId: '',
    name: '',
    distillery: '',
    region: '',
    age: undefined,
    abv: undefined,
    description: '',
  });
  const [showEventEditForm, setShowEventEditForm] = useState(false);
  const [eventEditForm, setEventEditForm] = useState<UpdateEventInput>({
    name: '',
    description: '',
    date: '',
    location: '',
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

  const canDeleteWhiskey = (whiskey: Whiskey): boolean => {
    if (isAdmin) return true;
    if (isTaster && user && whiskey.createdByUserId === user.id) return true;
    return false;
  };

  const canEditWhiskey = (whiskey: Whiskey): boolean => {
    if (isAdmin) return true;
    if (isTaster && user && whiskey.createdByUserId === user.id) return true;
    return false;
  };

  const canEditEvent = (): boolean => {
    if (!event) return false;
    if (isAdmin) return true;
    if (isTaster && user && event.createdByUserId === user.id) return true;
    return false;
  };

  const handleWhiskeyEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWhiskeyId || !eventId) return;
    await updateWhiskey.mutateAsync({
      eventId,
      whiskeyId: editingWhiskeyId,
      name: editWhiskeyForm.name,
      distillery: editWhiskeyForm.distillery,
      region: editWhiskeyForm.region,
      age: editWhiskeyForm.age,
      abv: editWhiskeyForm.abv,
      description: editWhiskeyForm.description,
    });
    setEditingWhiskeyId(null);
    setEditWhiskeyForm({
      eventId: eventId!,
      whiskeyId: '',
      name: '',
      distillery: '',
      region: '',
      age: undefined,
      abv: undefined,
      description: '',
    });
  };

  const startEditWhiskey = (whiskey: Whiskey) => {
    setEditingWhiskeyId(whiskey.id);
    setEditWhiskeyForm({
      eventId: eventId!,
      whiskeyId: whiskey.id,
      name: whiskey.name,
      distillery: whiskey.distillery,
      region: whiskey.region,
      age: whiskey.age,
      abv: whiskey.abv,
      description: whiskey.description,
    });
  };

  const handleEventEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId) return;
    await updateEvent.mutateAsync({ id: eventId, input: eventEditForm });
    setShowEventEditForm(false);
  };

  const startEditEvent = () => {
    if (!event) return;
    setEventEditForm({
      name: event.name,
      description: event.description,
      date: event.date,
      location: event.location,
    });
    setShowEventEditForm(true);
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
        <div className={styles.headerActions}>
          {canEditEvent() && (
            <button className={styles.editBtn} onClick={startEditEvent}>
              Edit Event
            </button>
          )}
          {isTaster && (
            <button
              className={styles.addBtn}
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? 'Cancel' : '+ Add Whiskey'}
            </button>
          )}
        </div>
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

      {showEventEditForm && (
        <form className={styles.form} onSubmit={handleEventEditSubmit}>
          <h2>Edit Event</h2>
          <div className={styles.formGroup}>
            <label htmlFor="edit-name">Event Name *</label>
            <input
              id="edit-name"
              type="text"
              required
              value={eventEditForm.name}
              onChange={(e) =>
                setEventEditForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="e.g. Highland Whisky Night"
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="edit-description">Description</label>
            <textarea
              id="edit-description"
              value={eventEditForm.description}
              onChange={(e) =>
                setEventEditForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="Describe the event..."
              rows={3}
            />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="edit-date">Date *</label>
              <input
                id="edit-date"
                type="date"
                required
                value={eventEditForm.date}
                onChange={(e) =>
                  setEventEditForm((f) => ({ ...f, date: e.target.value }))
                }
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="edit-location">Location *</label>
              <input
                id="edit-location"
                type="text"
                required
                value={eventEditForm.location}
                onChange={(e) =>
                  setEventEditForm((f) => ({ ...f, location: e.target.value }))
                }
                placeholder="e.g. Helsinki, Finland"
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setShowEventEditForm(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={updateEvent.isPending}
            >
              {updateEvent.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {editingWhiskeyId && (
        <form className={styles.form} onSubmit={handleWhiskeyEditSubmit}>
          <h2>Edit Whiskey</h2>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Name *</label>
              <input
                type="text"
                required
                value={editWhiskeyForm.name}
                onChange={(e) =>
                  setEditWhiskeyForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Glenfiddich 12"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Distillery *</label>
              <input
                type="text"
                required
                value={editWhiskeyForm.distillery}
                onChange={(e) =>
                  setEditWhiskeyForm((f) => ({
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
                value={editWhiskeyForm.region}
                onChange={(e) =>
                  setEditWhiskeyForm((f) => ({ ...f, region: e.target.value }))
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
                value={editWhiskeyForm.age ?? ''}
                onChange={(e) =>
                  setEditWhiskeyForm((f) => ({
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
                value={editWhiskeyForm.abv ?? ''}
                onChange={(e) =>
                  setEditWhiskeyForm((f) => ({
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
              value={editWhiskeyForm.description}
              onChange={(e) =>
                setEditWhiskeyForm((f) => ({
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
                setEditingWhiskeyId(null);
                setEditWhiskeyForm({
                  eventId: eventId!,
                  whiskeyId: '',
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

      <h2 className={styles.sectionTitle}>
        Whiskeys ({whiskeys?.length ?? 0})
      </h2>

      {whiskeysLoading ? (
        <div className={styles.loading}>Loading whiskeys...</div>
      ) : whiskeys?.length === 0 ? (
        <div className={styles.empty}>
          No whiskeys added yet. {isTaster ? 'Add the first one!' : ''}
        </div>
      ) : (
        <div className={styles.list}>
          {whiskeys?.map((whiskey) => (
            <div key={whiskey.id} className={styles.whiskeyCard}>
              <div className={styles.whiskeyCardActions}>
                {canEditWhiskey(whiskey) && (
                  <button
                    className={styles.editBtn}
                    onClick={() => startEditWhiskey(whiskey)}
                    title="Edit"
                  >
                    ✎
                  </button>
                )}
                {canDeleteWhiskey(whiskey) && (
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
                    title="Delete"
                  >
                    ✕
                  </button>
                )}
              </div>
              {isTaster ? (
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
              ) : (
                <div className={styles.whiskeyLink}>
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
