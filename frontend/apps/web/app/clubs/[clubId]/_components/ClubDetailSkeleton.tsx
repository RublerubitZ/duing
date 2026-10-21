import { Skeleton, TextLinesSkeleton } from '@/components/loading/Skeleton';

import { ClubDetailTopBar } from './ClubDetailTopBar';

type Props = {
  /** 데스크탑 로고 자리의 공유요소 이름(club-logo-<id>)과 상단 바에 쓴다 — 경계(ClubsRouteLoading)는 도착 경로에서, 페이지 안(ClubDetailPage)은 props 로 받는다. */
  clubId: number;
};

/**
 * 동아리 상세 로딩 스켈레톤 — 화면 안 로딩 분기(ClubDetailPage)와 경로 로딩 경계(ClubsRouteLoading)가 같은 모양을 쓴다.
 * 상세 히어로 모양이다(iOS 깜빡임 P0 §6.1) — 프리페치 전 진입에서 View Transition 의 "새 화면" 이 이 경계라, 상단 바와 (데스크탑의)
 * 로고가 착지할 자리가 첫 프레임부터 있어야 한다(소식 상세 NoticeDetailSkeleton 선례). 실제 히어로처럼 hidden md:block(데스크탑)·
 * md:hidden(모바일) 두 블록으로 나눠 그린다.
 * - 데스크탑: 브레드크럼 줄 + 히어로와 같은 크기·모양·공유요소 이름의 중립 회색 로고 자리(140) + 이름 자리. 데스크탑 로고 위치는 커버와
 *   무관해(커버는 배경) 착지 뒤 그대로다.
 * - 모바일: 실제 ClubDetailTopBar(뒤로·찜·공유 — 이력이 없으면 /clubs)와 텍스트 줄만. 로고 자리를 두지 않는다 — 모바일 로고 위치는
 *   배너(커버 또는 활동 사진) 유무로 약 56px/126px 로 달라지는데(운영 표본 40곳 중 배너 42%) 경계는 알 수 없다. 배너 없는 위치에 두면
 *   배너 동아리는 착지 뒤 약 70px 내려가고, 배너 높이를 늘 예약하면 나머지가 붕괴형으로 올라간다. 모바일 전환은 공유요소 모핑 없이
 *   화면 전체가 밀려 들어오므로(globals.css) 로고는 실제 히어로와 함께 나타난다.
 * - 텍스트 줄만 150ms 지연(delayed-show). 펄스(animate-pulse)와 같은 요소에 걸면 animation 축약끼리 덮어써 펄스가 꺼지므로 지연은 래퍼,
 *   펄스는 안쪽에 둔다. 상단 바·로고 자리는 즉시 보인다.
 * 도착한 히어로가 같은 상단 바를 다시 마운트하므로 로딩 중 상단 바 버튼에 있던 포커스는 풀릴 수 있다 — 경미(로딩 중 탭 포커스는 드물다).
 * 페이지 안 분기는 히어로와 동시에 존재하지 않아 view-transition-name 이 겹치지 않는다. 캔버스 높이는 ClubsLayout(min-h-dvh)이 지킨다.
 */
export function ClubDetailSkeleton({ clubId }: Props) {
  const logoTransitionName = `club-logo-${clubId}`;
  return (
    <div>
      {/* 데스크탑/태블릿(md+) — 브레드크럼 줄 + 히어로 행. 래퍼·간격 클래스는 ClubDetailHero 데스크탑 블록과 같다. */}
      <div className="hidden md:block">
        <div className="bg-cream">
          {/* 글자 크기가 같아 줄 높이가 실제 브레드크럼과 같다 — 로고 자리의 세로 위치가 맞는다. */}
          <div className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-4 text-[12.5px] text-charcoal-3">
            <span className="delayed-show">동아리 탐색</span>
          </div>
        </div>
        <section className="bg-cream">
          <div className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-9">
            <div className="flex items-start gap-6">
              <div
                className="h-[140px] w-[140px] shrink-0 rounded-[28px] border-[3px] border-white bg-graysoft shadow-lg"
                style={{ viewTransitionName: logoTransitionName }}
                aria-hidden="true"
              />
              <div className="delayed-show flex-1 pt-2">
                <div className="animate-pulse motion-reduce:animate-none" aria-hidden="true">
                  <Skeleton className="mb-3.5 h-6 w-40 rounded-full" />
                  <Skeleton className="h-[56px] w-72" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* 모바일(md 미만) — 상단 바가 오버레이될 자리(커버 없는 히어로의 스페이서와 같은 높이, 부모 relative) + 실제 상단 바.
          로고 자리는 두지 않는다(위 주석 — 배너 유무로 위치가 갈려 착지 뒤 튐이 생긴다). */}
      <div className="md:hidden">
        <div className="relative">
          <div className="h-[calc(3.25rem+env(safe-area-inset-top))]" />
          <ClubDetailTopBar clubId={clubId} />
        </div>
      </div>

      <div className="delayed-show mx-auto max-w-layout px-4 py-10 sm:px-6 md:px-10">
        <TextLinesSkeleton lines={8} label="동아리 정보 불러오는 중" />
      </div>
    </div>
  );
}
