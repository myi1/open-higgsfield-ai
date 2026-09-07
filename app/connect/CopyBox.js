'use client';

import { useState } from 'react';

export default function CopyBox({ value, multiline = false }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="relative">
      <pre
        className={`rounded-lg bg-black/60 border border-white/15 p-4 pr-28 text-xs font-mono text-white/80 ${
          multiline ? 'whitespace-pre overflow-x-auto' : 'whitespace-pre-wrap break-all'
        }`}
      >
        {value}
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 rounded-lg bg-[#d9ff00] px-3 py-1.5 text-black text-xs font-semibold"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
