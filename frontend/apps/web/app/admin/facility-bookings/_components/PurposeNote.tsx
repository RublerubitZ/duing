import type { ReactNode } from 'react';

/** 화면 목적 안내 배너(목업 PurposeNote) — sage-mist 카드 + 인포 아이콘 + 13px 본문. */
export function PurposeNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[12px] bg-sage-mist px-4 py-[13px] text-[13px] leading-normal text-ink-deep">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-px h-[17px] w-[17px] shrink-0 text-ink"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <div className="flex-1">{children}</div>
    </div>
  );
}
