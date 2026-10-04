import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
import '../app/globals.css';
import '../demo/src/demo.css';
import './live.css';
import { App } from './App';
import { I18nProvider, readStoredLang } from '../demo/src/i18n';

/** Surface any uncaught failure on-screen (a headless page gives no console). */
function showFatalError(where: string, error: unknown): void {
  const root = document.getElementById('root');
  if (!root) return;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  root.innerHTML = `<div style="max-width:640px;margin:10vh auto;padding:24px;font-family:system-ui,sans-serif;border:1px solid #fca5a5;background:#fef2f2;border-radius:12px">
    <h1 style="font-size:16px;margin:0 0 8px">Live edition failed to start (${where})</h1>
    <p style="font-size:12px;color:#7f1d1d;word-break:break-word;white-space:pre-wrap">${message.replace(/</g, '&lt;')}</p>
  </div>`;
}

window.addEventListener('error', (event) => showFatalError('error', event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => showFatalError('promise', event.reason));

try {
  createRoot(document.getElementById('root')!).render(
    <I18nProvider initialLang={readStoredLang() ?? 'fa'}>
      <App />
    </I18nProvider>,
  );
} catch (error) {
  showFatalError('render', error);
}
