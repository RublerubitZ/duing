'use client';

import type { ClubSnsLink } from '@duing/types';

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'X', 'YOUTUBE', 'KAKAO', 'WEB'] as const;

type SnsLinksRepeaterProps = {
  value: ClubSnsLink[];
  onChange: (next: ClubSnsLink[]) => void;
  readOnly?: boolean;
  maxLinks?: number;
};

export function SnsLinksRepeater({
  value, onChange, readOnly = false, maxLinks = 10,
}: SnsLinksRepeaterProps) {
  function update(idx: number, patch: Partial<ClubSnsLink>) {
    onChange(value.map((link, i) => (i === idx ? { ...link, ...patch } : link)));
  }

  function add() {
    if (value.length >= maxLinks) return;
    onChange([...value, { platform: 'INSTAGRAM', url: '' }]);
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {value.map((link, idx) => (
        <div key={idx} className="flex gap-2">
          <select
            value={link.platform}
            onChange={(e) => update(idx, { platform: e.target.value })}
            disabled={readOnly}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input
            type="url"
            value={link.url}
            onChange={(e) => update(idx, { url: e.target.value })}
            placeholder="https://…"
            disabled={readOnly}
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-sm text-slate-500 hover:text-rose-600"
            >
              삭제
            </button>
          )}
        </div>
      ))}
      {!readOnly && value.length < maxLinks && (
        <button
          type="button"
          onClick={add}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          + SNS 링크 추가
        </button>
      )}
    </div>
  );
}
