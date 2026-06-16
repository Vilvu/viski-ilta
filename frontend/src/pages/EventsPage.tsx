import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useEvents,
  useCreateEvent,
} from '@/hooks/useEvents';
import { useAuth } from '@/hooks/useAuth';
import type { CreateEventInput } from '@/api/events';
import styles from './EventsPage.module.css';

export default function EventsPage() {
  const { data: events, isLoading, error } = useEvents();
  const { isTaster } = useAuth();
  const createEvent = useCreateEvent();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateEventInput>({
    name: '',
    description: '',
    date: '',
    location: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createEvent.mutateAsync(form);
    setForm({ name: '', description: '', date: '', location: '' });
    setShowForm(false);
  };

  if (isLoading) return <div className={styles.loading}>Loading events...</div>;
  if (error) return <div className={styles.error}>Failed to load events.</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Events</h1>
        {isTaster && (
          <button
            className={styles.addBtn}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : '+ Add Event'}
          </button>
        )}
      </div>

      {showForm && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <h2>New Event</h2>
          <div className={styles.formGroup}>
            <label htmlFor="name">Event Name *</label>
            <input
              id="name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Highland Whisky Night"
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="Describe the event..."
              rows={3}
            />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="date">Date *</label>
              <input
                id="date"
                type="date"
                required
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="location">Location *</label>
              <input
                id="location"
                type="text"
                required
                value={form.location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location: e.target.value }))
                }
                placeholder="e.g. Helsinki, Finland"
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={createEvent.isPending}
            >
              {createEvent.isPending ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      )}

      {events?.length === 0 ? (
        <div className={styles.empty}>
          <p>
            No events yet.{' '}
            {isTaster ? 'Create the first one!' : 'Check back later.'}
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {events?.map((event) => (
            <div key={event.id} className={styles.card}>
              <Link to={`/events/${event.id}`} className={styles.cardLink}>
                <h2 className={styles.cardTitle}>{event.name}</h2>
                <p className={styles.cardMeta}>
                  📅{' '}
                  {new Date(event.date).toLocaleDateString('en-FI', {
                    dateStyle: 'long',
                  })}
                </p>
                <p className={styles.cardMeta}>📍 {event.location}</p>
                {event.description && (
                  <p className={styles.cardDescription}>{event.description}</p>
                )}
                <p className={styles.cardCount}>
                  🥃 {event.whiskeyCount} whiskeys
                </p>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
