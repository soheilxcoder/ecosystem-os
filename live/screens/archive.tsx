/** Archive — the append-only ledger. Lessons are recorded through the API. */
import { useState } from 'react';
import { useApi } from '../store';
import { useI18n } from '../../demo/src/i18n';
import { ScreenHeader } from '../ui';

export function ArchiveScreen() {
  const api = useApi();
  const { t, lang } = useI18n();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState<{ tone: 'good' | 'critical'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const recordLesson = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await api.post('/api/archive/lessons', { title: title.trim(), lesson: body.trim() });
      setNotice({
        tone: 'good',
        text: lang === 'fa' ? 'درس در بایگانی ثبت شد.' : 'Lesson recorded in the archive.',
      });
      setTitle('');
      setBody('');
    } catch (err) {
      setNotice({ tone: 'critical', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <ScreenHeader
        title={t('nav.archive')}
        sub={
          lang === 'fa'
            ? 'بایگانی فقط‌افزودنی است؛ هر رویداد مهم اکوسیستم اینجا ثبت می‌شود.'
            : 'The archive is append-only; every significant ecosystem event lands here.'
        }
      />

      <section className="panel max-w-2xl p-5">
        <h2 className="text-sm font-medium text-ink-950">
          {lang === 'fa' ? 'ثبت یک درس آموخته' : 'Record a lesson learned'}
        </h2>
        <div className="mt-3 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={lang === 'fa' ? 'عنوان درس' : 'Lesson title'}
            className="w-full rounded-md border border-line-200 bg-white px-3 py-2 text-sm focus:border-signal-600 focus:outline-none focus:ring-2 focus:ring-signal-600/20"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder={lang === 'fa' ? 'شرح درس…' : 'What did the pod learn…'}
            className="w-full rounded-md border border-line-200 bg-white px-3 py-2 text-sm focus:border-signal-600 focus:outline-none focus:ring-2 focus:ring-signal-600/20"
          />
          <button
            type="button"
            onClick={() => void recordLesson()}
            disabled={saving || !title.trim() || !body.trim()}
            className="rounded-md bg-signal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-signal-700 disabled:opacity-50"
          >
            {saving ? '…' : lang === 'fa' ? 'ثبت درس' : 'Record lesson'}
          </button>
        </div>
        {notice && (
          <div
            className={`mt-3 rounded-md border px-3 py-2 text-sm ${
              notice.tone === 'good'
                ? 'border-status-good/40 bg-status-good/10 text-ink-900'
                : 'border-status-critical/40 bg-status-critical/10 text-ink-900'
            }`}
          >
            {notice.text}
          </div>
        )}
      </section>
    </div>
  );
}
