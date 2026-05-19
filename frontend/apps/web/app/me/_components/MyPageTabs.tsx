'use client';

import { MY_SECTIONS, type SectionId } from '../_constants/mock';

type Props = {
  active: SectionId;
  onSelect: (id: SectionId) => void;
};

export function MyPageTabs({ active, onSelect }: Props) {
  return (
    <div className="sticky top-0 z-[5] bg-cream border-b border-line px-10 backdrop-saturate-[1.1]">
      <div className="max-w-layout mx-auto flex gap-6 flex-wrap">
        {MY_SECTIONS.map((section) => {
          const isActive = section.id === active;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              className={[
                'py-4 bg-none border-none -mb-[1.5px] text-[15px] font-semibold font-body cursor-pointer transition-colors duration-[180ms] flex items-center gap-2',
                isActive
                  ? 'text-ink border-b-[2.5px] border-ink'
                  : 'text-charcoal-3 border-b-[2.5px] border-transparent',
              ].join(' ')}
            >
              {section.label}
              {section.count != null && (
                <span
                  className={[
                    'text-[11px] font-bold px-2 py-0.5 rounded-full font-mono transition-colors duration-[180ms]',
                    isActive
                      ? 'bg-ink text-white'
                      : 'bg-graysoft text-charcoal-3',
                  ].join(' ')}
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
