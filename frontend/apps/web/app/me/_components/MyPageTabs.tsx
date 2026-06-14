'use client';

import { cn } from '@/app/_lib/cn';

type Section = {
  id: string;
  label: string;
  count?: number;
  badge?: boolean;
};

type Props = {
  sections: Section[];
  active: string;
  onSelect: (id: string) => void;
};

export function MyPageTabs({ sections, active, onSelect }: Props) {
  return (
    <div className="sticky top-0 z-[5] bg-cream border-b border-line px-4 sm:px-6 md:px-10">
      <div className="max-w-layout mx-auto flex gap-6 flex-wrap">
        {sections.map((section) => {
          const isActive = section.id === active;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              className={cn(
                'flex items-center gap-2 py-4 bg-transparent border-none text-[15px] font-semibold cursor-pointer transition-colors duration-150 -mb-px',
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
              {section.badge && (
                <span className="w-1.5 h-1.5 rounded-full bg-coral -ml-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
