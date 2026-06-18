import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEvent } from '@/hooks/useEvents';
import {
  useWhiskeys,
  useAddWhiskeyToEvent,
} from '@/hooks/useWhiskeys';
import { useUpdateEvent, useDeleteEvent } from '@/hooks/useEvents';
import { useAuth } from '@/hooks/useAuth';
import type {
  CreateCatalogWhiskeyInput,
} from '@/api/whiskeys';
import type { UpdateEventInput } from '@/api/events';
import styles from './EventDetailPage.module.css';

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { data: event, isLoading: eventLoading } = useEvent(eventId!);
  const { data: whiskeys, isLoading: whiskeysLoading } = useWhiskeys(eventId!);
  const { isAdmin, isTaster, user } = useAuth();
  const addWhiskey = useAddWhiskeyToEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateCatalogWhiskeyInput>({
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
    const submitData = {
      ...form,
      distillery: form.distillery || undefined,
      region: form.region || undefined,
    };
    await addWhiskey.mutateAsync({ eventId: eventId!, input: submitData });
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

  const canEditEvent = (): boolean => {
    if (!event) return false;
    if (isAdmin) return true;
    if (isTaster && user && event.createdByUserId === user.id) return true;
    return false;
  };

  const canDeleteEvent = (): boolean => {
    if (!event) return false;
    if (isAdmin) return true;
    if (isTaster && user && event.createdByUserId === user.id) return true;
    return false;
  };

  const handleDeleteEvent = async () => {
    if (!eventId || !event) return;
    if (confirm(t('eventDetail.confirmDelete', { name: event.name }))) {
      await deleteEvent.mutateAsync(eventId);
      navigate('/');
    }
  };

  const handleEventEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId) return;
    const submitData = {
      ...eventEditForm,
      location: eventEditForm.location || undefined,
    };
    await updateEvent.mutateAsync({ id: eventId, input: submitData as UpdateEventInput });
    setShowEventEditForm(false);
  };

   const startEditEvent = () => {
     if (!event) return;
     setEventEditForm({
       name: event.name,
       description: event.description,
       date: event.date,
       location: event.location || '',
     });
     setShowEventEditForm(true);
   };

  if (eventLoading)
    return <div className={styles.loading}>{t('common.loading')}</div>;
  if (!event) return <div className={styles.error}>{t('eventDetail.notFound')}</div>;

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to="/">{t('eventDetail.breadcrumb')}</Link> / {event.name}
      </div>

      <div className={styles.eventHeader}>
        <div>
          <h1>{event.name}</h1>
           <p className={styles.meta}>
              📅{' '}
              {new Date(event.date).toLocaleDateString(i18n.language === 'fi' ? 'fi-FI' : 'en-GB', {
                dateStyle: 'long',
              })}
              {event.location && ` · 📍 ${event.location}`}
            </p>
          {event.description && (
            <p className={styles.description}>{event.description}</p>
          )}
        </div>
        <div className={styles.headerActions}>
           {showEventEditForm && canDeleteEvent() && (
             <button
               className={styles.deleteEventBtn}
               onClick={handleDeleteEvent}
               disabled={deleteEvent.isPending}
             >
               {deleteEvent.isPending ? t('common.deleting') : t('eventDetail.deleteEvent')}
             </button>
           )}
           {!showEventEditForm && canEditEvent() && (
             <button className={styles.editBtn} onClick={startEditEvent}>
               {t('eventDetail.editEvent')}
             </button>
           )}
           {isTaster && (
             <button
               className={styles.addBtn}
               onClick={() => setShowForm(!showForm)}
             >
               {showForm ? t('common.cancel') : t('eventDetail.addWhiskey')}
             </button>
           )}
        </div>
      </div>

       {showForm && (
         <form className={styles.form} onSubmit={handleSubmit}>
           <h2>{t('eventDetail.addWhiskey')}</h2>
           <div className={styles.formRow}>
             <div className={styles.formGroup}>
               <label>{t('eventDetail.formLabels.name')} *</label>
               <input
                 type="text"
                 required
                 value={form.name}
                 onChange={(e) =>
                   setForm((f) => ({ ...f, name: e.target.value }))
                 }
                 placeholder={t('eventDetail.placeholders.whiskeyName')}
               />
             </div>
             <div className={styles.formGroup}>
               <label>{t('eventDetail.formLabels.distillery')}</label>
               <input
                 type="text"
                 value={form.distillery}
                 onChange={(e) =>
                   setForm((f) => ({ ...f, distillery: e.target.value }))
                 }
                 placeholder={t('eventDetail.placeholders.distillery')}
               />
             </div>
           </div>
           <div className={styles.formRow}>
             <div className={styles.formGroup}>
               <label>{t('eventDetail.formLabels.region')}</label>
               <input
                 type="text"
                 value={form.region}
                 onChange={(e) =>
                   setForm((f) => ({ ...f, region: e.target.value }))
                 }
                 placeholder={t('eventDetail.placeholders.region')}
               />
             </div>
             <div className={styles.formGroup}>
               <label>{t('eventDetail.formLabels.age')}</label>
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
               <label>{t('eventDetail.formLabels.abv')}</label>
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
             <label>{t('eventDetail.formLabels.description')}</label>
             <textarea
               value={form.description}
               onChange={(e) =>
                 setForm((f) => ({ ...f, description: e.target.value }))
               }
               rows={2}
               placeholder={t('eventDetail.placeholders.tastingNotes')}
             />
           </div>
           <div className={styles.formActions}>
             <button
               type="submit"
               className={styles.submitBtn}
               disabled={addWhiskey.isPending}
             >
               {addWhiskey.isPending ? t('common.adding') : t('eventDetail.addWhiskey')}
             </button>
           </div>
         </form>
       )}

       {showEventEditForm && (
         <form className={styles.form} onSubmit={handleEventEditSubmit}>
           <h2>{t('eventDetail.editEvent')}</h2>
           <div className={styles.formGroup}>
             <label htmlFor="edit-name">{t('eventDetail.formLabels.eventName')} *</label>
             <input
               id="edit-name"
               type="text"
               required
               value={eventEditForm.name}
               onChange={(e) =>
                 setEventEditForm((f) => ({ ...f, name: e.target.value }))
               }
               placeholder={t('eventDetail.placeholders.eventName')}
             />
           </div>
           <div className={styles.formGroup}>
             <label htmlFor="edit-description">{t('eventDetail.formLabels.description')}</label>
             <textarea
               id="edit-description"
               value={eventEditForm.description}
               onChange={(e) =>
                 setEventEditForm((f) => ({ ...f, description: e.target.value }))
               }
               placeholder={t('eventDetail.placeholders.eventDescription')}
               rows={3}
             />
           </div>
           <div className={styles.formRow}>
             <div className={styles.formGroup}>
               <label htmlFor="edit-date">{t('eventDetail.formLabels.date')} *</label>
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
               <label htmlFor="edit-location">{t('eventDetail.formLabels.location')}</label>
               <input
                 id="edit-location"
                 type="text"
                 value={eventEditForm.location}
                 onChange={(e) =>
                   setEventEditForm((f) => ({ ...f, location: e.target.value }))
                 }
                 placeholder={t('eventDetail.placeholders.location')}
               />
             </div>
           </div>
           <div className={styles.formActions}>
             <button
               type="button"
               className={styles.cancelBtn}
               onClick={() => setShowEventEditForm(false)}
             >
               {t('common.cancel')}
             </button>
             <button
               type="submit"
               className={styles.submitBtn}
               disabled={updateEvent.isPending}
             >
               {updateEvent.isPending ? t('common.saving') : t('eventDetail.submitEvent')}
             </button>
           </div>
         </form>
       )}

        <h2 className={styles.sectionTitle}>
         {t('eventDetail.whiskeyCount', { count: whiskeys?.length ?? 0 })}
       </h2>

       {whiskeysLoading ? (
         <div className={styles.loading}>{t('common.loading')}</div>
       ) : whiskeys?.length === 0 ? (
         <div className={styles.empty}>
           {t('eventDetail.emptyMessage')}
         </div>
       ) : (
        <div className={styles.list}>
           {whiskeys?.map((whiskey) => (
             <div key={whiskey.id} className={styles.whiskeyCard}>
               {isTaster ? (
                <Link
                  to={`/events/${eventId}/whiskeys/${whiskey.id}`}
                  className={styles.whiskeyLink}
                >
                   <div className={styles.whiskeyInfo}>
                     <h3>{whiskey.name}</h3>
                     <p className={styles.whiskeyMeta}>
                       {[
                         whiskey.distillery,
                         whiskey.region,
                         whiskey.age ? `${whiskey.age}yr` : null,
                         whiskey.abv ? `${whiskey.abv}%` : null,
                       ]
                         .filter(Boolean)
                         .join(' · ')}
                     </p>
                   </div>
                    <div className={styles.ratings}>
                      {whiskey.userRating !== undefined && (
                       <div
                         className={styles.ratingBadge + ' ' + styles.userRating}
                       >
                         <span className={styles.ratingLabel}>{t('eventDetail.ratingLabels.you')}</span>
                         <span className={styles.ratingValue}>
                           {whiskey.userRating}
                         </span>
                       </div>
                     )}
                     <div className={styles.ratingBadge}>
                       <span className={styles.ratingLabel}>{t('eventDetail.ratingLabels.avg')}</span>
                       <span className={styles.ratingValue}>
                         {whiskey.ratingCount > 0
                           ? whiskey.averageRating.toFixed(1)
                           : '—'}
                       </span>
                     </div>
                    
                  </div>
                </Link>
              ) : (
                 <div className={styles.whiskeyLink}>
                   <div className={styles.whiskeyInfo}>
                     <h3>{whiskey.name}</h3>
                     <p className={styles.whiskeyMeta}>
                       {[
                         whiskey.distillery,
                         whiskey.region,
                         whiskey.age ? `${whiskey.age}yr` : null,
                         whiskey.abv ? `${whiskey.abv}%` : null,
                       ]
                         .filter(Boolean)
                         .join(' · ')}
                     </p>
                   </div>
                    <div className={styles.ratings}>
                     <div className={styles.ratingBadge}>
                       <span className={styles.ratingLabel}>{t('eventDetail.ratingLabels.avg')}</span>
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
                         <span className={styles.ratingLabel}>{t('eventDetail.ratingLabels.you')}</span>
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
