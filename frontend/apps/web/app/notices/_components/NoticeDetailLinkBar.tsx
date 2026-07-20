// 모바일 전용(md:hidden) 공지 상세 하단 고정 바 — 행사 외부 안내 페이지로 가는 '자세히 보기' CTA.
// 동아리 상세의 하단 지원 바와 같은 패턴(상단 액션바 + 하단 CTA). 외부 링크가 있는 이벤트 공지에만 노출.
// 데스크탑은 우측 NoticeEventCard 의 '자세히 보기' 버튼을 쓴다. 페이지 pb-24(96px)가 바(약 72px) 가림을 막는다.

import { ExternalLink } from 'lucide-react';
import type { NoticeEventInfo } from '@duing/types';

import { formatEventRange } from '../_lib/eventFormat';
import { safeExternalHref } from '../../_lib/route';

type Props = {
  eventInfo: NoticeEventInfo;
  linkUrl: string | null;
};

export function NoticeDetailLinkBar({ eventInfo, linkUrl }: Props) {
  const safeLink = safeExternalHref(linkUrl);
  if (!safeLink) return null;

  return (
    <div
      data-bottom-bar
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line bg-cream/95 px-[18px] pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] font-body backdrop-blur md:hidden">
      <div className="min-w-0">
        <div className="text-[10.5px] text-charcoal-3">행사 안내</div>
        <div className="truncate text-sm font-bold text-ink">
          {formatEventRange(eventInfo.startAt, eventInfo.endAt)}
        </div>
      </div>
      <a
        href={safeLink}
        target="_blank"
        rel="noreferrer"
        className="btn btn-primary flex flex-1 items-center justify-center gap-1.5 rounded-[14px] py-3.5 text-[15px]"
      >
        자세히 보기
        <ExternalLink size={16} aria-hidden />
      </a>
    </div>
  );
}
