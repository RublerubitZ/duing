'use client';

import { cn } from '@/app/_lib/cn';
import { TabIndicator } from '@/components/motion/TabIndicator';

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
                // 활성 표시를 색 보더(border-ink) 대신 인디케이터가 맡는다 — 항목마다 보더를
                // 토글하면 요소가 달라 layoutId 전환이 성립하지 않는다. 보더 클래스는 기존
                // 그대로 두되(버튼 리셋 border-none 이 걸려 두께를 잡지 않는다) 색만 뺐다.
                'relative flex items-center gap-2 py-4 bg-transparent border-none border-b-[2.5px] border-transparent text-[15px] font-semibold cursor-pointer transition-colors duration-150',
                isActive ? 'text-ink' : 'text-charcoal-3 hover:text-charcoal',
              )}
            >
              {isActive && <TabIndicator layoutId="mypage-tab" />}
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
