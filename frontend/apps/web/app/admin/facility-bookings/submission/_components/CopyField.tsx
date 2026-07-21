'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { cn } from '@/app/_lib/cn';

/**
 * 클릭 한 번에 값을 복사하는 필드. HWP 전사 콕핏에서 라벨·값·복사를 한 행에 두어, 담당자가 값을
 * 누르면 바로 클립보드에 담기게 한다(시선 이동 최소화). 복사 성공은 ~1.1초 체크 표시로 알린다.
 *
 * `big` 은 동아리명·목적처럼 길고 중요한 값을 크게 보여줄 때 쓴다.
 */
export function CopyField({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  const [done, setDone] = useState(false);

  const copy = () => {
    // 클립보드 미지원(비보안 컨텍스트 등)이면 조용히 무시 — 값은 화면에 그대로 보이므로 수기 복사가 가능하다.
    void navigator.clipboard?.writeText(value).catch(() => undefined);
    setDone(true);
    window.setTimeout(() => setDone(false), 1100);
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${label} 복사: ${value}`}
      className={cn(
        'grid grid-cols-[104px_1fr_34px] items-center gap-3.5 rounded-md border border-line bg-paper text-left',
        'outline-none hover:border-sage focus-visible:ring-2 focus-visible:ring-ink',
        big ? 'px-4 py-3.5' : 'px-4 py-2.5',
      )}
    >
      <span className="text-[12.5px] font-bold text-charcoal-3">{label}</span>
      <span
        className={cn(
          'truncate font-semibold text-ink-deep',
          big ? 'text-[19px] font-extrabold' : 'text-[15px]',
        )}
      >
        {value}
      </span>
      <span
        aria-hidden
        className={cn(
          'grid h-[30px] w-[30px] place-items-center rounded-md',
          done ? 'bg-sage-mist text-ink' : 'bg-graysoft text-charcoal-3',
        )}
      >
        {done ? <Check size={15} strokeWidth={3} /> : <Copy size={15} />}
      </span>
    </button>
  );
}
