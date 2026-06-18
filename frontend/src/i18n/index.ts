import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enTranslation from './locales/en.json';
import fiTranslation from './locales/fi.json';

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslation,
      },
      fi: {
        translation: fiTranslation,
      },
    },
    fallbackLng: 'fi',
    supportedLngs: ['fi', 'en'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'lang',
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

export default i18next;
