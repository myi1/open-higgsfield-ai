'use client';

import { useEffect, useState } from 'react';

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function PeopleTable() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/usage?month=${month}`);
      const body = await res.json();
      if (!cancelled) setData(body);
    })();
    return () => { cancelled = true; };
  }, [month]);

  async function setKeyMode(clerkUserId, keyMode) {
    const res = await fetch('/api/admin/key-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clerkUserId, keyMode }),
    });
    const body = await res.json();
    setNotice(body.warning ?? null);
    const refreshed = await fetch(`/api/admin/usage?month=${month}`);
    setData(await refreshed.json());
  }

  if (!data) return <p className="text-white/40">Loading…</p>;

  const totals = data.people.reduce(
    (acc, p) => ({
      images: acc.images + p.images,
      videos: acc.videos + p.videos,
      company: acc.company + p.paidByCompany,
    }),
    { images: 0, videos: 0, company: 0 },
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-6">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg bg-black/60 border border-white/15 px-3 py-2 text-sm text-white"
        />
        <div className="flex gap-6 text-sm">
          <span className="text-white/50">
            Images <span className="text-white font-semibold">{totals.images}</span>
          </span>
          <span className="text-white/50">
            Video &amp; lip sync <span className="text-[#d9ff00] font-semibold">{totals.videos}</span>
          </span>
          <span className="text-white/50">
            On the company <span className="text-white font-semibold">{totals.company}</span>
          </span>
        </div>
      </div>

      {notice && (
        <p className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          {notice}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="text-white/40 text-left bg-white/5">
            <tr>
              <th className="py-3 px-4 font-medium">Person</th>
              <th className="px-4 font-medium">Images</th>
              <th className="px-4 font-medium">Video &amp; lip sync</th>
              <th className="px-4 font-medium">Total</th>
              <th className="px-4 font-medium">Who pays</th>
            </tr>
          </thead>
          <tbody>
            {data.people.length === 0 && (
              <tr><td colSpan={5} className="py-6 px-4 text-white/40">Nobody has signed in yet.</td></tr>
            )}
            {data.people.map((p) => (
              <tr key={p.clerkUserId} className="border-t border-white/10">
                <td className="py-3 px-4">{p.email}</td>
                <td className="px-4">{p.images}</td>
                <td className="px-4">{p.videos}</td>
                <td className="px-4 font-semibold">{p.total}</td>
                <td className="px-4">
                  <select
                    value={p.keyMode}
                    onChange={(e) => setKeyMode(p.clerkUserId, e.target.value)}
                    className="rounded bg-black/60 border border-white/15 px-2 py-1 text-white"
                  >
                    <option value="COMPANY">Company</option>
                    <option value="SELF">Their own key</option>
                  </select>
                  {p.keyMode === 'SELF' && !p.ownKeyLast4 && (
                    <span className="ml-2 text-yellow-400" title="No key saved — they cannot generate">
                      ⚠ no key
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm uppercase tracking-wider text-white/40">Recent generations</h2>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="text-white/40 text-left bg-white/5">
            <tr>
              <th className="py-3 px-4 font-medium">When</th>
              <th className="px-4 font-medium">Person</th>
              <th className="px-4 font-medium">Studio</th>
              <th className="px-4 font-medium">Model</th>
              <th className="px-4 font-medium">From</th>
              <th className="px-4 font-medium">Paid by</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.length === 0 && (
              <tr><td colSpan={6} className="py-6 px-4 text-white/40">Nothing generated this month.</td></tr>
            )}
            {data.recent.map((g) => (
              <tr key={g.id} className="border-t border-white/10">
                <td className="py-2 px-4 whitespace-nowrap">
                  {new Date(g.createdAt).toLocaleString('en-GB')}
                </td>
                <td className="px-4">{g.email}</td>
                <td className="px-4">{g.studio}</td>
                <td className="px-4 font-mono text-xs">{g.model}</td>
                <td className="px-4">{g.via === 'MCP' ? 'Claude' : 'Website'}</td>
                <td className="px-4">{g.paidBy === 'SELF' ? 'Themselves' : 'Company'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
