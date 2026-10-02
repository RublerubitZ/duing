'use client';

import { useState } from 'react';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
};

// 서버 CreateNoticeRequest·UpdateNoticeRequest 의 태그 길이 상한(@Size(max = 20))과 같다. 입력란 maxLength 로는
// 걸지 않는다 — 쉼표로 여러 태그를 한 번에 붙여넣으면 잘려 뒤 태그가 사라진다. 태그를 넣을 때 검사한다.
const MAX_TAG_LENGTH = 20;

export function NoticeTagInput({ value, onChange, max = 8 }: Props) {
  const [draft, setDraft] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  // 넣을 수 있는 태그면 붙인 목록을, 아니면 받은 목록을 그대로 돌려준다.
  const appendTag = (tags: string[], token: string) => {
    const tag = token.trim();
    if (!tag || tag.length > MAX_TAG_LENGTH || tags.includes(tag) || tags.length >= max) return tags;
    return [...tags, tag];
  };

  // 쉼표는 태그 필터의 구분자라 태그에 넣지 않는다(#1338). 한글 IME·keyCode 229 키보드는 쉼표를 keydown 없이
  // 값으로 넣으므로 값이 바뀔 때 나눈다 — 쉼표 앞 조각은 태그로 넣고(넣을 수 없는 조각은 버린다) 마지막 쉼표 뒤만 남긴다.
  const splitOnComma = (nextDraft: string) => {
    if (!nextDraft.includes(',')) {
      setDraft(nextDraft);
      return;
    }
    const tokens = nextDraft.split(',');
    const tail = tokens.pop() ?? '';
    const next = tokens.reduce(appendTag, value);
    setDraft(tail.trimStart());
    if (next !== value) onChange(next);
  };

  const addTag = () => {
    // 쉼표가 아직 나뉘지 않은 입력(브라우저에 따라 조합이 끝나기 전에 추가 버튼이 눌릴 수 있다)은 쉼표 경로로 넣는다.
    if (draft.includes(',')) {
      splitOnComma(`${draft},`);
      return;
    }
    const tag = draft.trim();
    if (!tag) return;
    if (tag.length > MAX_TAG_LENGTH) return;
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
          placeholder={`태그 입력 후 Enter (최대 ${max}개, ${MAX_TAG_LENGTH}자 이하)`}
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