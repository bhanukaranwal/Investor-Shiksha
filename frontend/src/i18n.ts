import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend';

// Import translation resources
import enTranslations from '../public/locales/en.json';
import hiTranslations from '../public/locales/hi.json';
import taTranslations from '../public/locales/ta.json';

// Define supported languages
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
];

// Initialize i18n
i18n
  .use(HttpApi)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',
    supportedLngs: SUPPORTED_LANGUAGES.map(lang => lang.code),
    
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
    
    backend: {
      loadPath: '/locales/{{lng}}.json',
      addPath: '/locales/add/{{lng}}/{{ns}}',
      allowMultiLoading: false,
      crossDomain: false,
      debounceInterval: 300,
    },
    
    detection: {
      order: ['querystring', 'cookie', 'localStorage', 'sessionStorage', 'navigator', 'htmlTag'],
      lookupQuerystring: 'lng',
      lookupCookie: 'i18next',
      lookupLocalStorage: 'i18nextLng',
      lookupSessionStorage: 'i18nextLng',
      lookupFromPathIndex: 0,
      lookupFromSubdomainIndex: 0,
      caches: ['localStorage', 'cookie'],
      excludeCacheFor: ['cimode'],
    },
    
    // Namespace configuration
    ns: ['common', 'auth', 'dashboard', 'trading', 'courses', 'profile'],
    defaultNS: 'common',
    
    // Resources for offline support
    resources: process.env.NODE_ENV === 'development' ? {
      en: { common: enTranslations },
      hi: { common: hiTranslations },
      ta: { common: taTranslations },
    } : undefined,
    
    // React options
    react: {
      useSuspense: false,
      bindI18n: 'languageChanged',
      bindI18nStore: 'added removed',
      transEmptyNodeValue: '',
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'em'],
    },
  });

// Export configured i18n instance
export default i18n;

// Helper function to change language
export const changeLanguage = (language: string) => {
  return i18n.changeLanguage(language);
};

// Get current language information
export const getCurrentLanguage = () => {
  const currentLng = i18n.language;
  return SUPPORTED_LANGUAGES.find(lang => lang.code === currentLng) || SUPPORTED_LANGUAGES[0];
};

// RTL languages configuration
export const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

export const isRTL = (language?: string) => {
  const lng = language || i18n.language;
  return RTL_LANGUAGES.includes(lng);
};
