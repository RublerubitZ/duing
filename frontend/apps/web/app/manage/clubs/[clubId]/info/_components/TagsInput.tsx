'use client';

import { useState } from 'react';

type TagsInputProps = {
  value: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
  maxTags?: number;
  maxTagLength?: number;
};

export function TagsInput({ value, onChange, readOnly = false, maxTags = 5, maxTagLength = 5 }: TagsInputProps) {
  const [draft, setDraft] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  function add(token: string) {
    const trimmed = token.trim();
    if (!trimmed) return;
    if (trimmed.length > maxTagLength) return;
    if (value.includes(trimmed)) return;
    if (value.length >= maxTags) return;
    onChange([...value, trimmed]);
    setDraft('');
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-wrap gap-1.5 min-h-[42px] border border-[#cfcab8] bg-white rounded-[8px] px-2.5 py-2 focus-within:border-[#5b7e4d]">
      {value.map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          className="inline-flex items-center gap-1.5 bg-[#e7ebd9] text-[#3e5b34] border border-[#cfd6b3] rounded-full py-[3px] pl-[11px] pr-2.5 text-[12.5px] font-medium"
        >
          {tag}
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(idx)}
              aria-label={`태그 ${tag} 삭제`}
              className="text-[#4a6b3f] text-[13px] leading-none opacity-70 hover:opacity-100 cursor-pointer"
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!readOnly && value.length < maxTags && (
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (isComposing) return;
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add(draft);
            }
          }}
          onBlur={() => {
            if (isComposing) return;
            add(draft);
          }}
          maxLength={maxTagLength}
          placeholder={value.length === 0 ? '엔터로 태그 추가' : ''}
          className="min-w-[8rem] flex-1 bg-transparent text-[14px] text-[#2a2f27] placeholder:text-[#b8b8ac] outline-none"
        />
      )}
    </div>
  );
}
