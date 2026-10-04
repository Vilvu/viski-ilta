import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { whiskeyImageUrl, type RecognitionLanguage } from '@/api/whiskeys';
import {
  useDeleteWhiskeyImage,
  useRecognizeWhiskey,
} from '@/hooks/useWhiskeys';
import { prepareImage } from '@/lib/image';
import type { RecognizedWhiskey } from '@/types';
import styles from './WhiskeyImageField.module.css';

interface WhiskeyImageFieldProps {
  /** The saved whiskey when editing; omit when adding a new whiskey. */
  whiskey?: { id: string; name: string; imageUpdatedAt?: string };
  /** Prepared (downscaled JPEG) photo waiting to be uploaded on save. */
  pendingImage: Blob | null;
  onPendingImageChange: (image: Blob | null) => void;
  /**
   * Called with the AI result. The parent merges it into its form state and
   * returns how many fields it filled, which is shown to the user.
   */
  onRecognized: (result: RecognizedWhiskey) => number;
}

type Message = { kind: 'info' | 'error'; text: string } | null;

function recognitionErrorKey(error: unknown): string {
  if (isAxiosError(error)) {
    if (error.response?.status === 503) return 'whiskeyForm.aiUnavailable';
    if (error.response?.status === 429) return 'whiskeyForm.aiBusy';
  }
  return 'whiskeyForm.aiFailed';
}

/**
 * Bottle photo picker used by the add and edit whiskey forms: choose or
 * replace a photo (uploaded by the parent on save), remove the saved photo,
 * and optionally ask the AI to fill empty fields from the photo.
 */
export default function WhiskeyImageField({
  whiskey,
  pendingImage,
  onPendingImageChange,
  onRecognized,
}: WhiskeyImageFieldProps) {
  const { t, i18n } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const deleteImage = useDeleteWhiskeyImage();
  const recognize = useRecognizeWhiskey();
  const [message, setMessage] = useState<Message>(null);
  const [preparing, setPreparing] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  // Recognition is async: always merge into the latest form state, so edits
  // typed while the AI is working are not overwritten by a stale callback.
  const onRecognizedRef = useRef(onRecognized);
  useEffect(() => {
    onRecognizedRef.current = onRecognized;
  });

  useEffect(() => {
    if (!pendingImage) {
      setPendingUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingImage);
    setPendingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  const savedUrl = whiskey ? whiskeyImageUrl(whiskey) : undefined;
  const previewUrl = pendingUrl ?? savedUrl;
  const hasAnyPhoto = !!pendingImage || !!savedUrl;
  const busy = preparing || recognize.isPending || deleteImage.isPending;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setMessage(null);
    setPreparing(true);
    try {
      onPendingImageChange(await prepareImage(file));
    } catch {
      setMessage({ kind: 'error', text: t('whiskeyForm.invalidImage') });
    } finally {
      setPreparing(false);
    }
  };

  const handleRemoveSaved = async () => {
    if (!whiskey || !confirm(t('whiskeyForm.confirmRemovePhoto'))) return;
    setMessage(null);
    try {
      await deleteImage.mutateAsync(whiskey.id);
    } catch {
      setMessage({ kind: 'error', text: t('whiskeyForm.removeFailed') });
    }
  };

  const handleRecognize = async () => {
    setMessage(null);
    try {
      let image = pendingImage;
      if (!image && savedUrl) {
        const response = await fetch(savedUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        image = await response.blob();
      }
      if (!image) return;

      const language: RecognitionLanguage = i18n.language?.startsWith('fi')
        ? 'fi'
        : 'en';
      const result = await recognize.mutateAsync({ image, language });
      const filled = onRecognizedRef.current(result);
      setMessage({
        kind: 'info',
        text:
          filled > 0
            ? t('whiskeyForm.recognizedFilled', { count: filled })
            : t('whiskeyForm.recognizedNothing'),
      });
    } catch (error) {
      setMessage({ kind: 'error', text: t(recognitionErrorKey(error)) });
    }
  };

  return (
    <div className={styles.field}>
      <span className={styles.label}>{t('whiskeyForm.photo')}</span>
      <div className={styles.body}>
        <div className={styles.preview}>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={
                pendingImage
                  ? t('whiskeyForm.pendingPhotoAlt')
                  : t('whiskeyForm.photoAlt', { name: whiskey?.name ?? '' })
              }
            />
          ) : (
            <span className={styles.placeholder}>🥃</span>
          )}
        </div>
        <div className={styles.controls}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className={styles.fileInput}
            onChange={handleFileChange}
            data-testid="whiskey-photo-input"
          />
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {hasAnyPhoto
              ? t('whiskeyForm.changePhoto')
              : t('whiskeyForm.choosePhoto')}
          </button>
          {pendingImage && (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => onPendingImageChange(null)}
              disabled={busy}
            >
              {t('whiskeyForm.clearPhoto')}
            </button>
          )}
          {!pendingImage && savedUrl && (
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={handleRemoveSaved}
              disabled={busy}
            >
              {deleteImage.isPending
                ? t('whiskeyForm.removingPhoto')
                : t('whiskeyForm.removePhoto')}
            </button>
          )}
          {hasAnyPhoto && (
            <>
              <button
                type="button"
                className={styles.aiBtn}
                onClick={handleRecognize}
                disabled={busy}
              >
                {recognize.isPending
                  ? t('whiskeyForm.recognizing')
                  : `✨ ${t('whiskeyForm.recognize')}`}
              </button>
              <p className={styles.hint}>{t('whiskeyForm.recognizeHint')}</p>
            </>
          )}
          {message && (
            <p
              className={message.kind === 'error' ? styles.error : styles.info}
              role={message.kind === 'error' ? 'alert' : 'status'}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
