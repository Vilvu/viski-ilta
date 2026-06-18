import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEvents, useCreateEvent } from '@/hooks/useEvents';
import { useAuth } from '@/hooks/useAuth';
import type { CreateEventInput } from '@/api/events';
import styles from './EventsPage.module.css';

export default function EventsPage() {
  const { t, i18n } = useTranslation();
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
    const submitData = {
      ...form,
      location: form.location || undefined,
    };
    await createEvent.mutateAsync(submitData as CreateEventInput);
    setForm({ name: '', description: '', date: '', location: '' });
    setShowForm(false);
  };

  if (isLoading)
    return <div className={styles.loading}>{t('common.loading')}</div>;
  if (error)
    return <div className={styles.error}>{t('events.loadFailed')}</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>{t('events.title')}</h1>
        {isTaster && (
          <button
            className={styles.addBtn}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? t('common.cancel') : `+ ${t('events.addEvent')}`}
          </button>
        )}
      </div>

      {showForm && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <h2>{t('events.newEvent')}</h2>
          <div className={styles.formGroup}>
            <label htmlFor="name">{t('events.eventName')} *</label>
            <input
              id="name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('events.placeholders.eventName')}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="description">{t('events.description')}</label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder={t('events.placeholders.description')}
              rows={3}
            />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="date">{t('events.date')} *</label>
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
              <label htmlFor="location">{t('events.location')}</label>
              <input
                id="location"
                type="text"
                value={form.location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location: e.target.value }))
                }
                placeholder={t('events.placeholders.location')}
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={createEvent.isPending}
            >
              {createEvent.isPending
                ? t('common.creating')
                : t('events.createEvent')}
            </button>
          </div>
        </form>
      )}

      {events?.length === 0 ? (
        <div className={styles.empty}>
          <p>
            {isTaster
              ? t('events.emptyMessage')
              : t('events.emptyTasterMessage')}
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
                  {new Date(event.date).toLocaleDateString(
                    i18n.language === 'fi' ? 'fi-FI' : 'en-GB',
                    {
                      dateStyle: 'long',
                    },
                  )}
                </p>
                {event.location && (
                  <p className={styles.cardMeta}>📍 {event.location}</p>
                )}
                {event.description && (
                  <p className={styles.cardDescription}>{event.description}</p>
                )}
                <p className={styles.cardCount}>
                  🥃{' '}
                  {t('events.whiskeyCount', {
                    count: event.whiskeyCount,
                    defaultValue:
                      event.whiskeyCount === 1
                        ? `${event.whiskeyCount} ${t('events.whiskeyCount_one')}`
                        : `${event.whiskeyCount} ${t('events.whiskeyCount_other')}`,
                  })}
                </p>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
