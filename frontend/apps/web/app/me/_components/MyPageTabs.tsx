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
    <div data-mypage-tabs className="sticky top-0 z-[5] bg-cream">
      <div className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 flex gap-6 flex-wrap">
        {sections.map((section) => {
          const isActive = section.id === active;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              className={cn(
                // border-none 은 border-style:none 이라 아래 border-b-[2.5px] 의 두께가 사용값 0 으로
                // 눌려 활성 탭 밑줄이 아예 그려지지 않았다. 버튼 기본 테두리는 border-0 으로 지우고
                // 밑줄만 명시적으로 solid 로 되살린다(비활성도 같은 두께의 투명 선이라 전환 시 안 밀린다).
                'flex items-center gap-2 py-4 bg-transparent border-0 border-b-[2.5px] border-solid text-[15px] font-semibold cursor-pointer transition-colors duration-150',
                isActive
                  ? 'text-ink border-ink'
                  : 'text-charcoal-3 border-transparent hover:text-charcoal',
              )}
            >
              {section.label}
              {section.count != null && (
                <span
                  className={cn(
                    'text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums transition-colors duration-150',
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
