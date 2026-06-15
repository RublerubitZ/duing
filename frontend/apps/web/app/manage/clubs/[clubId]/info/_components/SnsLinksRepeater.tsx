'use client';

import type { ClubSnsLink } from '@duing/types';

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'X', 'YOUTUBE', 'KAKAO', 'WEB'] as const;
type PlatformLiteral = (typeof PLATFORMS)[number];

function isPlatform(value: string): value is PlatformLiteral {
  return (PLATFORMS as readonly string[]).includes(value);
}

const rowInputCls =
  'w-full border border-[#cfcab8] bg-white rounded-[8px] px-3 py-2 text-[14px] text-[#2a2f27] placeholder:text-[#b8b8ac] focus:outline-none focus:border-[#4a6b3f] focus:shadow-[0_0_0_3px_rgba(74,107,63,0.15)] transition-[border-color,box-shadow]';

const rowSelectCls =
  'w-[140px] border border-[#cfcab8] bg-white rounded-[8px] px-3 py-2 text-[14px] text-[#2a2f27] appearance-none focus:outline-none focus:border-[#4a6b3f] transition-[border-color]';

const deleteBtnCls =
  'px-2 py-1.5 rounded-[6px] text-[12.5px] text-[#8a8f83] hover:text-[#b35a3a] hover:bg-[rgba(179,90,58,0.06)] cursor-pointer transition-colors bg-transparent border-none';

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
    <div className="space-y-1.5">
      {value.map((link, idx) => (
        <div key={idx} className="grid grid-cols-[110px_1fr_auto] gap-2 items-center sm:grid-cols-[140px_1fr_auto]">
          <select
            value={link.platform}
            onChange={(event) => {
              const next = event.target.value;
              if (isPlatform(next)) update(idx, { platform: next });
            }}
            disabled={readOnly}
            className={rowSelectCls}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' fill='none' stroke='%234a5247' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center',
              backgroundSize: '12px',
              paddingRight: '30px',
            }}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <input
            type="url"
            value={link.url}
            onChange={(event) => update(idx, { url: event.target.value })}
            placeholder="https://..."
            disabled={readOnly}
            className={rowInputCls}
          />

          {!readOnly && (
            <button type="button" onClick={() => remove(idx)} className={deleteBtnCls}>
              삭제
            </button>
          )}
        </div>
      ))}

      {!readOnly && value.length < maxLinks && (
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 mt-1.5 bg-transparent border-none text-[13px] font-medium text-[#3e5b34] hover:text-[#4a6b3f] hover:underline cursor-pointer px-0 py-1"
        >
          + SNS 링크 추가
        </button>
      )}
    </div>
  );
}
