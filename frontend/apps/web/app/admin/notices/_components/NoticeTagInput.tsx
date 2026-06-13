'use client';

import { useState } from 'react';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
};

export function NoticeTagInput({ value, onChange, max = 8 }: Props) {
  const [draft, setDraft] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  const addTag = () => {
    const tag = draft.trim();
    if (!tag) return;
    if (tag.length > 20) return;
    if (value.includes(tag)) { setDraft(''); return; }
    if (value.length >= max) return;
    onChange([...value, tag]);
    setDraft('');
  };

  const removeTag = (target: string) => {
    onChange(value.filter((tag) => tag !== target));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-graysoft text-charcoal-2 text-[12px]">
            #{tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-charcoal-3 hover:text-ink"
              aria-label={`${tag} 태그 제거`}
            >×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={(event) => {
            // 한글 등 IME 조합 중/확정 keydown 은 무시한다 (동아리 TagsInput #269 와 동일 가드).
            // isComposing 단독으로는 일부 브라우저의 확정 keydown(keyCode 229, isComposing=false)을
            // 놓쳐 "안녕" → "안녕"+"녕" 이중 등록이 발생하므로 keyCode 229·조합 상태도 함께 확인한다.
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (isComposing) return;
            if (event.key === 'Enter') {
              event.preventDefault();
              addTag();
            }
          }}
          placeholder={`태그 입력 후 Enter (최대 ${max}개, 20자 이하)`}
          className="flex-1 px-3 py-2 rounded-md border border-line bg-paper text-[13px]"
        />
        <button
          type="button"
          onClick={addTag}
          disabled={value.length >= max}
          className="px-3 py-2 rounded-md bg-paper border border-line text-[13px] font-semibold disabled:opacity-50"
        >추가</button>
      </div>
    </div>
  );
}