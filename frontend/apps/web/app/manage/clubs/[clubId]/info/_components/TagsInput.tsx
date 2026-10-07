'use client';

import { useState } from 'react';
import { appendTag, normalizeTag } from '../../../../../_lib/tags';

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
  const limits = { maxTags, maxTagLength };

  function add(token: string) {
    const next = appendTag(value, token, limits);
    if (next === value) return;
    onChange(next);
    setDraft('');
  }

  // 한글 IME 조합·keyCode 229 모바일 키보드는 onKeyDown 의 ',' 분기를 건너뛰어 쉼표가 값으로 들어온다(#1338).
  // 쉼표 앞 조각은 태그로 넣고(넣을 수 없는 조각은 버린다) 마지막 쉼표 뒤만 입력란에 남긴다.
  function splitOnComma(nextDraft: string) {
    if (!nextDraft.includes(',')) {
      setDraft(nextDraft);
      return;
    }
    const tokens = nextDraft.split(',');
    const tail = tokens.pop() ?? '';
    const next = tokens.reduce((tags, token) => appendTag(tags, token, limits), value);
    // 쉼표 뒤 공백이 5자 칸을 차지하지 않게 지운다. 한도를 채워 입력란이 사라지면 꼬리도 버린다 — 칩을 지울 때 숨은 글자가 되살아나지 않게.
    setDraft(next.length >= maxTags ? '' : tail.trimStart());
    if (next !== value) onChange(next);
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
          {normalizeTag(tag)}
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(idx)}
              aria-label={`태그 ${normalizeTag(tag)} 삭제`}
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
          onChange={(event) => {
            // 조합 중에 값을 바꾸면 IME 가 글자를 다시 넣을 수 있어, 쉼표는 조합이 끝난 뒤에 나눈다.
            if (isComposing) setDraft(event.target.value);
            else splitOnComma(event.target.value);
          }}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(event) => {
            setIsComposing(false);
            splitOnComma(event.currentTarget.value);
          }}
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
