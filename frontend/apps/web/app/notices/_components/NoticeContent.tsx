'use client';

import {
  memo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { NoticeContentFormat } from '@duing/types';
import { NoticeMarkdown } from './NoticeMarkdown';
import { NoticeImageLightbox, type NoticeImage } from './NoticeImageLightbox';
import { sanitizeNoticeHtml } from '../_lib/sanitizeHtml';

// 공지 본문 리치 렌더용 prose 스타일. 동아리 소개(ClubDetailAbout)도 재사용해 리치 텍스트 렌더를 일치시킨다.
export const PROSE_CLASS = 'text-[16px] leading-[1.85] text-charcoal [&_p]:mb-4 [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_h2]:text-[21px] [&_h2]:font-bold [&_h2]:text-ink-deep [&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:pl-3 [&_h2]:border-l-[3px] [&_h2]:border-sage [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:text-ink-deep [&_h3]:mt-6 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_li]:mb-1.5 [&_img]:w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_blockquote]:text-charcoal-2';

// 탭(클릭) vs 스크롤 제스처 구분 — 시작점 대비 이동량이 이 값 미만이면 탭으로 본다.
const TAP_SLOP = 10;

type Props = {
  content: string;
  // 백엔드가 content_format 을 아직 안 내려주는 환경에서는 undefined 일 수 있다.
  format?: NoticeContentFormat;
};

// dangerouslySetInnerHTML 을 사용하는 div 는 매 렌더마다 prop 객체가 새로 생성되어
// React 가 항상 innerHTML 을 재설정한다. 그러면 내부 img DOM 노드가 교체되어
// 포인터 이벤트 위임으로 저장해둔 image 참조가 끊긴다.
// memo 로 감싸 content 가 바뀔 때만 innerHTML 을 교체하도록 한다.
type BodyProps = { content: string; format?: NoticeContentFormat };
const NoticeBody = memo(function NoticeBody({ content, format }: BodyProps) {
  if (format === 'MARKDOWN') {
    return <NoticeMarkdown content={content} />;
  }
  return (
    <div
      className={PROSE_CLASS}
      // eslint-disable-next-line react/no-danger -- sanitizeNoticeHtml 로 allowlist sanitize 후 렌더
      dangerouslySetInnerHTML={{ __html: sanitizeNoticeHtml(content) }}
    />
  );
});

export function NoticeContent({ content, format }: Props) {
  const [zoomed, setZoomed] = useState<NoticeImage | null>(null);
  // 포인터다운 시점의 좌표·대상 이미지를 기억해 포인터업에서 탭 여부를 판정한다.
  const tapStart = useRef<{ x: number; y: number; image: HTMLImageElement } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    tapStart.current =
      event.target instanceof HTMLImageElement
        ? { x: event.clientX, y: event.clientY, image: event.target }
        : null;
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = tapStart.current;
    tapStart.current = null;
    if (!start || event.target !== start.image) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP) return;
    setZoomed({ src: start.image.currentSrc || start.image.src, alt: start.image.alt });
  }

  // 본문 이미지가 <a> 로 감싸여 있어도 탭=확대 우선 — 앵커 기본 이동을 막는다.
  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLImageElement) event.preventDefault();
  }

  return (
    <>
      <div
        className="[&_img]:cursor-zoom-in"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          tapStart.current = null;
        }}
        onClickCapture={handleClickCapture}
      >
        <NoticeBody content={content} format={format} />
      </div>
      <NoticeImageLightbox image={zoomed} onClose={() => setZoomed(null)} />
    </>
  );
}
