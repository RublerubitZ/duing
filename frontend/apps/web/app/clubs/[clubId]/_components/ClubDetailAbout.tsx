'use client';

import { Check, ChevronDown } from 'lucide-react';
import { memo, useId, useMemo, useState } from 'react';

import { cn } from '@/app/_lib/cn';
import { PROSE_CLASS } from '@/app/notices/_components/NoticeContent';

import { splitDescription } from '../_lib/splitDescription';

type Props = {
  description: string | null;
  highlights: string[];
};

// rest 없는 단일 블록이 이보다 길면(텍스트 기준) 4줄 클램프 + 더보기로 접는다.
const CLAMP_THRESHOLD = 220;

// dangerouslySetInnerHTML 서브트리는 memo 로 분리한다 — 부모 재렌더마다 __html prop 객체가
// 새로 생성되면 React 가 innerHTML 을 매번 재설정해 주입 DOM 이 교체된다(공지 렌더 전례).
// props 는 html 만 — 클램프 등 토글되는 클래스는 절대 여기로 넘기지 않는다. prop 이 바뀌면 memo 가
// 깨져 React19 가 innerHTML 을 재주입하고(동일 문자열도) 주입 DOM 노드가 교체된다. 클램프는 바깥 래퍼가 소유.
const RichHtml = memo(function RichHtml({ html }: { html: string }) {
  return (
    <div
      className={PROSE_CLASS}
      // eslint-disable-next-line react/no-danger -- splitDescription 이 sanitizeNoticeHtml 후 파싱한 결과라 안전
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

function leadTextLength(isHtml: boolean, lead: string): number {
  if (!isHtml) return lead.length;
  return new DOMParser().parseFromString(lead, 'text/html').body.textContent?.length ?? 0;
}

function AboutDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  const { isHtml, lead, rest, clampLead } = useMemo(() => {
    const split = splitDescription(description);
    return {
      ...split,
      clampLead: split.rest === null && leadTextLength(split.isHtml, split.lead) > CLAMP_THRESHOLD,
    };
  }, [description]);

  const showToggle = rest !== null || clampLead;
  const clampClass = clampLead && !expanded ? 'line-clamp-4' : undefined;

  return (
    <div>
      {isHtml ? (
        // 클램프는 memo 밖 래퍼가 소유 — RichHtml prop 을 불변으로 유지해 토글 시 재주입을 막는다.
        <div className={clampClass}>
          <RichHtml html={lead} />
        </div>
      ) : (
        <p className={cn('whitespace-pre-wrap text-[15.5px] leading-relaxed text-charcoal', clampClass)}>
          {lead}
        </p>
      )}

      {rest !== null && (
        <div
          id={panelId}
          aria-hidden={!expanded}
          inert={!expanded}
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-duing motion-reduce:transition-none',
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-5 pt-5">
              {isHtml ? (
                <RichHtml html={rest} />
              ) : (
                <p className="whitespace-pre-wrap text-[15.5px] leading-relaxed text-charcoal">{rest}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={rest !== null ? panelId : undefined}
          className="mt-3 inline-flex items-center gap-1 py-1.5 text-[14px] font-semibold text-ink"
        >
          {expanded ? '접기' : '더보기'}
          <ChevronDown aria-hidden className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}

// 한줄 소개는 탐색 카드 전용, 해시태그는 상세 히어로(이름 아래) 담당, 주요 프로젝트는 랜딩 섹션으로 이관 —
// 여기는 랜딩 공통 헤더(소개) + Paper Card(소개 본문 + "이런 분께 추천해요" 체크 리스트)를 다룬다.
export function ClubDetailAbout({ description, highlights }: Props) {
  if (description === null && highlights.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-2.5">
        <h2 className="text-[20px] font-bold text-ink-deep">소개</h2>
        <span className="text-[13px] text-charcoal-3">
          동아리가 추구하는 문화와 활동 방식을 소개합니다.
        </span>
      </div>

      <div className="rounded-[20px] border border-line bg-white p-7 shadow-1">
        {description !== null && <AboutDescription description={description} />}

        {highlights.length > 0 && (
          <div className={cn(description !== null && 'mt-5 pt-5')}>
            <p className="mb-3 text-[15px] font-semibold text-ink-deep">이런 분께 추천해요</p>
            <ul className="space-y-2">
              {highlights.map((keyword, index) => (
                <li key={index} className="flex items-start gap-2 text-[15px] text-charcoal">
                  <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
                  <span>{keyword}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
