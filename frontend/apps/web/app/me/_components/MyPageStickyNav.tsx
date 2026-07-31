'use client';

import { cn } from '@/app/_lib/cn';

type Section = {
  id: string;
  label: string;
  count?: number;
};

type Props = {
  sections: Section[];
  active: string;
  onSelect: (id: string) => void;
};

export function MyPageStickyNav({ sections, active, onSelect }: Props) {
  return (
    <div
      className="sticky z-20 bg-cream px-4 sm:px-6 md:px-10"
      style={{ top: -1, marginTop: -1, boxShadow: '0 -16px 0 var(--cream)' }}
    >
      {/* breadcrumb row */}
      <div className="max-w-layout mx-auto flex items-center gap-2.5 pt-7 pb-2.5 text-[11.5px] leading-4 font-semibold text-charcoal-3 whitespace-nowrap">
        <span>⌂</span>
        <span>내 두잉</span>
        <span>›</span>
        <span className="text-ink font-bold">마이페이지</span>
      </div>

      {/* tab row */}
      <div className="max-w-layout mx-auto flex gap-6 flex-wrap">
        {sections.map((section) => {
          const isActive = section.id === active;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              className={cn(
                'flex items-center gap-2 py-4 bg-transparent border-none text-[15px] font-semibold cursor-pointer transition-colors duration-150',
                isActive
                  ? 'text-ink border-b-[2.5px] border-ink'
                  : 'text-charcoal-3 border-b-[2.5px] border-transparent hover:text-charcoal',
              )}
            >
              {section.label}
              {section.count != null && (
                <span
                  className={cn(
                    'text-[11px] font-bold px-2 py-0.5 rounded-full font-mono transition-colors duration-150',
                    isActive ? 'bg-ink text-paper' : 'bg-graysoft text-charcoal-3',
                  )}
                >
                  {section.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
