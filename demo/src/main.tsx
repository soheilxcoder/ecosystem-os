import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
import '../../app/globals.css';
import './demo.css';
import { App } from './App';
import { I18nProvider, readStoredLang } from './i18n';

createRoot(document.getElementById('root')!).render(
  <I18nProvider initialLang={readStoredLang() ?? 'en'}>
    <App />
  </I18nProvider>,
);
