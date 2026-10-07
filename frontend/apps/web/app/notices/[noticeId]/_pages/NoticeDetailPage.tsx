'use client';

import { useParams } from 'next/navigation';
import { ResourceNotFound } from '@/app/_components/ResourceNotFound';
import { cn } from '@/app/_lib/cn';
import { useDocumentTitle } from '@/app/_lib/useDocumentTitle';
import { useEnteredFromSkeleton } from '@/app/_lib/useEnteredFromSkeleton';
import { useHydrated } from '@/app/_lib/useHydrated';
import { parseKstInstant, useNoticeDetailQuery } from '@duing/hooks';
import { NoticeDetailTopBar } from '../../_components/NoticeDetailTopBar';
import { NoticeDetailSkeleton } from '../../_components/NoticeDetailSkeleton';
import { NoticeArticleHeader } from '../../_components/NoticeArticleHeader';
import { NoticePosterHero } from '../../_components/NoticePosterHero';
import { NoticeContent } from '../../_components/NoticeContent';
import { NoticeEventCard } from '../../_components/NoticeEventCard';
import { NoticeEventSummary } from '../../_components/NoticeEventSummary';
import { NoticeDetailLinkBar } from '../../_components/NoticeDetailLinkBar';
import { NoticeMetaCard } from '../../_components/NoticeMetaCard';
import { NoticeShareCard } from '../../_components/NoticeShareCard';
import { RelatedNotices } from '../../_components/RelatedNotices';
import { ExpiredBanner } from '../../_components/ExpiredBanner';

function getStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

export function NoticeDetailPage() {
  const params = useParams<{ noticeId: string }>();
  const noticeId = params.noticeId ? Number(params.noticeId) : null;

  const detailQuery = useNoticeDetailQuery(noticeId);
  const notice = detailQuery.data;

  // 공개 소식은 서버 metadata 가 제목을 붙인다. 동아리 공지(익명 404 → noindex 셸)는 서버가 제목을 모르므로
  // 회원 데이터가 도착한 뒤 탭 제목을 여기서 맞춘다.
  useDocumentTitle(notice?.title ?? null);
  // 스켈레톤을 거쳐 도착한 첫 방문만 본문이 떠오른다(캐시 재방문은 그대로) — early return 보다 위에서 잡는다.
  const enteredFromSkeleton = useEnteredFromSkeleton(detailQuery.isLoading);
  // 만료 배너는 하이드레이션 뒤에만 — 서버가 판정한 만료 여부는 ISR HTML 이 묵는 동안 달라진다(#418).
  const hydrated = useHydrated();

  // 세 분기 모두 크림 캔버스(duing min-h-lvh bg-cream)와 ExploreNav 는 notices/layout.tsx 가 렌더한다
  // — 로딩 경계 밖에서 유지되도록. ExploreNav 는 상세 경로에서 스스로 모바일 숨김을 판단한다(pathname 기반).
  // 최상위는 fragment 가 아닌 정적 div — 첫 요소가 sticky 면 라우터 자동 스크롤 기준에서 제외된다.
  // 로딩은 경로 로딩 경계와 같은 스켈레톤(NoticeDetailSkeleton) — 상단 바는 바로, 본문 자리는 150ms 지연 표시.
  if (detailQuery.isLoading) {
    return <NoticeDetailSkeleton />;
  }

  // 볼 수 없는 공지는 서버가 미존재와 같은 404 로 답한다(열거 방지) — 404 는 데이터가 있어도 "볼 수 없음"이다
  // (ISR 시드 뒤 삭제·비공개 전환이 재요청에서 드러난다). 403 은 데이터가 없을 때만 같은 화면으로 보낸다 —
  // 백엔드는 이 경로에 403 을 주지 않아 WAF·엣지 차단일 수 있다(서버 로더도 403 을 장애로 본다).
  // 자동 리다이렉트 대신 제자리에 남긴다 — 주소가 유지돼야 사용자가 무슨 일이 일어났는지 알 수 있다.
  const errorStatus = getStatus(detailQuery.error);
  if (errorStatus === 404 || (errorStatus === 403 && !notice) || (detailQuery.isSuccess && !notice)) {
    return (
      <div>
        <NoticeDetailTopBar />
        <ResourceNotFound
          title="이 소식은 지금 볼 수 없어요"
          description="삭제됐거나 볼 수 없는 소식이에요."
          actionHref="/notices"
          actionLabel="소식 목록으로"
        />
      </div>
    );
  }

  // 그 밖의 실패(5xx·네트워크·타임아웃·403 차단)는 데이터가 없을 때만 오류 — 재요청이 실패해도 서버가 그린
  // 본문(시드)은 지우지 않는다(동아리 상세와 같은 구조).
  if (!notice) {
    return (
      <div>
        <NoticeDetailTopBar />
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 md:px-10 py-16">
          <p className="text-coral text-[13px]">공지를 불러오지 못했습니다.</p>
        </div>
      </div>
    );
  }

  // expiresAt 은 오프셋 없는 KST 벽시계 — new Date() 로 읽으면 실행 환경 시간대(UTC 서버 등)만큼 어긋난다.
  const expiredAndPast =
    hydrated && notice.expiresAt !== null && parseKstInstant(notice.expiresAt).getTime() <= Date.now();

  return (
    <div>
      <NoticeDetailTopBar />
      <div className={cn('max-w-[1120px] mx-auto px-4 sm:px-6 md:px-10 pb-24', enteredFromSkeleton && 'enter-content')}>
        <NoticeArticleHeader
          category={notice.category}
          title={notice.title}
          pinned={notice.pinned}
          expiresAt={notice.expiresAt}
          createdAt={notice.createdAt}
          owningClubId={notice.owningClubId}
          clubName={notice.clubName}
        />

        {expiredAndPast && notice.expiresAt && (
          <div className="mt-6">
            <ExpiredBanner expiresAt={notice.expiresAt} />
          </div>
        )}

        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-12 pt-8 items-start">
          <article className="min-w-0">
            <NoticePosterHero
              coverImageUrl={notice.coverImageUrl}
              title={notice.title}
              summary={notice.summary}
            />
            {/* 모바일: 한눈에 보기(이벤트)를 본문 위로 끌어올림. 데스크탑은 우측 카드를 쓴다. */}
            {notice.eventInfo && (
              <NoticeEventSummary eventInfo={notice.eventInfo} className="mb-8 md:hidden" />
            )}
            <NoticeContent content={notice.content} format={notice.contentFormat} />
          </article>

          <aside className="lg:sticky lg:top-24 flex flex-col gap-4 min-w-0">
            {notice.eventInfo ? (
              <div className="hidden md:block">
                <NoticeEventCard eventInfo={notice.eventInfo} linkUrl={notice.linkUrl} />
              </div>
            ) : (
              <NoticeMetaCard
                category={notice.category}
                createdAt={notice.createdAt}
                expiresAt={notice.expiresAt}
                tags={notice.tags}
                linkUrl={notice.linkUrl}
              />
            )}
            {/* 공유 카드 — 모바일 삭제(상단 액션바로 공유). */}
            <div className="hidden md:block">
              <NoticeShareCard />
            </div>
            <RelatedNotices category={notice.category} currentId={notice.id} />
          </aside>
        </div>
      </div>

      {/* 모바일 전용 하단 고정 '자세히 보기' 바 — 외부 안내가 있는 이벤트 공지. 데스크탑은 우측 카드 버튼. */}
      {notice.eventInfo && (
        <NoticeDetailLinkBar eventInfo={notice.eventInfo} linkUrl={notice.linkUrl} />
      )}
    </div>
  );
}
