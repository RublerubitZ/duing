'use client';

import type { ClubSnsLink } from '@duing/types';
import { SNS_PLATFORM_LABELS } from '@/app/_lib/snsPlatform';

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'KAKAO', 'OTHER'] as const;
type PlatformLiteral = (typeof PLATFORMS)[number];

function isPlatform(value: string): value is PlatformLiteral {
  return (PLATFORMS as readonly string[]).includes(value);
}

const rowInputCls =
  'w-full border border-field bg-white rounded-[8px] px-3 py-2 text-[14px] text-ink-deep placeholder:text-charcoal-3 focus:outline-none focus:border-ink focus:ring-[3px] focus:ring-ink/15 transition-[border-color,box-shadow]';

const rowSelectCls =
  'w-[140px] border border-field bg-white rounded-[8px] px-3 py-2 text-[14px] text-ink-deep appearance-none focus:outline-none focus:border-ink focus:ring-[3px] focus:ring-ink/15 transition-[border-color]';

const deleteBtnCls =
  'px-2 py-1.5 rounded-[6px] text-[12.5px] text-charcoal-3 hover:text-danger hover:bg-danger/5 cursor-pointer transition-colors bg-transparent border-none';

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
    onChange([...value, { platform: 'INSTAGRAM', label: null, url: '' }]);
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
              if (!isPlatform(next)) return;
              update(idx, { platform: next, label: next === 'OTHER' ? (link.label ?? '') : null });
            }}
            disabled={readOnly}
            className={rowSelectCls}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' fill='none' stroke='%234A504F' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center',
              backgroundSize: '12px',
              paddingRight: '30px',
            }}
          >
            {PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>{SNS_PLATFORM_LABELS[platform]}</option>
            ))}
          </select>

          <div className="min-w-0 space-y-1.5">
            {link.platform === 'OTHER' && (
              <input
                type="text"
                value={link.label ?? ''}
                maxLength={20}
                onChange={(event) => update(idx, { label: event.target.value })}
                placeholder="플랫폼명 (예: GitHub)"
                disabled={readOnly}
                className={rowInputCls}
              />
            )}
            <input
              type="url"
              value={link.url}
              onChange={(event) => update(idx, { url: event.target.value })}
              placeholder="https://..."
              disabled={readOnly}
              className={rowInputCls}
            />
          </div>

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
          className="inline-flex items-center gap-1.5 mt-1.5 bg-transparent border-none text-[13px] font-medium text-ink hover:underline cursor-pointer px-0 py-1"
        >
          + SNS 링크 추가
        </button>
      )}
    </div>
  );
}
