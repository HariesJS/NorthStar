'use client';

import { useState } from 'react';

interface AddResponse {
  added?: string[];
  duplicates?: string[];
  unrecognized?: string[];
  error?: string;
}

export function BulkAddForm({ onAdded }: { onAdded: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AddResponse | null>(null);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setReport(null);
    try {
      const res = await fetch('/api/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as AddResponse;
      setReport(data);
      if (res.ok) {
        setText('');
        onAdded();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <label htmlFor="bulk" className="mb-2 block text-sm font-medium text-slate-200">
        Вставьте ссылки на приложения
      </label>
      <textarea
        id="bulk"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        spellCheck={false}
        placeholder={
          'https://play.google.com/store/apps/details?id=com.example.app\ncom.another.app\n… можно сразу 50 строк, вперемешку'
        }
        className="w-full resize-y rounded-lg border border-white/10 bg-[#0d1219] p-3 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500/60"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Добавляю и проверяю…' : 'Добавить'}
        </button>

        {report && (
          <p className="text-sm text-slate-300">
            {report.error ? (
              <span className="text-red-300">{report.error}</span>
            ) : (
              <>
                добавлено <b className="text-green-300">{report.added?.length ?? 0}</b>
                {report.duplicates?.length ? (
                  <>
                    , уже были <b className="text-slate-400">{report.duplicates.length}</b>
                  </>
                ) : null}
                {report.unrecognized?.length ? (
                  <>
                    , не распознано{' '}
                    <b className="text-amber-300">{report.unrecognized.length}</b>
                  </>
                ) : null}
              </>
            )}
          </p>
        )}
      </div>

      {report?.unrecognized?.length ? (
        <details className="mt-2 text-xs text-slate-400">
          <summary className="cursor-pointer">показать нераспознанные строки</summary>
          <ul className="mt-1 space-y-0.5 font-mono">
            {report.unrecognized.map((u) => (
              <li key={u} className="truncate">
                {u}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
