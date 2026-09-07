'use client';

import { useState } from 'react';

export default function KeyForm({ initialLast4 }) {
  const [last4, setLast4] = useState(initialLast4);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState(null);

  async function save(e) {
    e.preventDefault();
    setStatus('saving');
    const res = await fetch('/api/settings/key', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: value }),
    });
    const body = await res.json();
    if (res.ok) {
      setLast4(body.last4);
      setValue('');
      setStatus('saved');
    } else {
      setStatus(body.error ?? 'Could not save that key.');
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {last4 && (
        <p className="text-sm text-white/70">
          Saved key: <span className="font-mono">••••{last4}</span>
        </p>
      )}
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={last4 ? 'Enter a new key to replace it' : 'Your MuAPI key'}
        className="w-full rounded-lg bg-black/60 border border-white/15 px-3 py-2 font-mono text-sm text-white"
      />
      <button
        type="submit"
        className="rounded-lg bg-[#d9ff00] px-4 py-2 text-black text-sm font-semibold"
      >
        {last4 ? 'Replace key' : 'Save key'}
      </button>
      {status === 'saved' && <p className="text-sm text-[#d9ff00]">Saved.</p>}
      {status && status !== 'saved' && status !== 'saving' && (
        <p className="text-sm text-red-400">{status}</p>
      )}
      <p className="text-xs text-white/40">
        Your key is encrypted before it is stored and is never shown again — not to you, not to
        an administrator. Replace it any time. It is used only to bill your own generations.
      </p>
    </form>
  );
}
