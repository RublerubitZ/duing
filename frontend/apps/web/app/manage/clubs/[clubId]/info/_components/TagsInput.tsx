'use client';

import { useState } from 'react';

type TagsInputProps = {
  value: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
  maxTags?: number;
};

export function TagsInput({ value, onChange, readOnly = false, maxTags = 20 }: TagsInputProps) {
  const [draft, setDraft] = useState('');

  function add(token: string) {
    const trimmed = token.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) return;
    if (value.length >= maxTags) return;
    onChange([...value, trimmed]);
    setDraft('');
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-wrap gap-2 rounded-md border border-slate-300 p-2">
      {value.map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs"
        >
          {tag}
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-slate-500 hover:text-slate-900"
              aria-label={`태그 ${tag} 삭제`}
            >
              ✕
            </button>
          )}
        </span>
      ))}
      {!readOnly && value.length < maxTags && (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(draft);
            }
          }}
          onBlur={() => add(draft)}
          placeholder={value.length === 0 ? '엔터로 태그 추가' : ''}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
        />
      )}
    </div>
  );
}
