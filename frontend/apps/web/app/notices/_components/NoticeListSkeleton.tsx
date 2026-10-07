import { InfoTabs } from '@/app/_components/InfoTabs';
import { Skeleton } from '@/components/loading/Skeleton';

const CATEGORY_PILL_COUNT = 6;
const LIST_ROW_COUNT = 5;

/**
 * 소식 목록 경로 로딩 스켈레톤(loading.tsx) — NoticePage 와 같은 틀(정보 탭 → 220px 사이드바 + 본문 격자)을 그려,
 * 응답이 흘러오는 동안 정보 탭 줄이 사라졌다 생기거나 본문이 튀지 않게 한다. 정보 탭은 데이터가 필요 없는 실제
 * 컴포넌트라 바로 그리고, 나머지는 150ms 지연 표시한다(지연은 래퍼, 펄스는 status 컨테이너 하나 — Skeleton 규약).
 * 막대 크기는 NoticePage 의 CSS 값(출처 세그먼트 약 47px·제목 36px·검색 40px·칩·행 72px)에서 가져왔다.
 * 행 모양은 NoticePage 목록 로딩(ListRowsSkeleton h-[72px] rounded-2xl 5행)과 같다. 한 status 안에 모두 담으려고
 * ListRowsSkeleton(자체 status)을 중첩하지 않고 같은 블록을 그린다. 캔버스 높이는 NoticesLayout(min-h-lvh)이 지킨다.
 */
export function NoticeListSkeleton() {
  return (
    <div>
      <InfoTabs />
      <div className="delayed-show">
        <div
          role="status"
          aria-busy="true"
          aria-label="공지 목록 불러오는 중"
          className="mx-auto grid animate-pulse grid-cols-1 items-start gap-7 px-4 pb-20 pt-page-top motion-reduce:animate-none md:grid-cols-[220px_1fr] md:gap-10 md:px-10"
          style={{ maxWidth: 1280 }}
        >
          <Skeleton className="hidden h-[420px] rounded-[18px] md:block" />
          <div>
            {/* 출처 세그먼트(학교 공지 / 내 동아리) 자리 — 로그인 여부와 관계없이 늘 그려진다(높이 약 47px + 아래 18px). */}
            <Skeleton className="mb-[18px] h-[47px] w-[104px] rounded-xl" />
            <div className="mb-[22px] flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
              <div className="flex-1">
                <Skeleton className="h-3.5 w-14" />
                <Skeleton className="mt-2.5 h-10 w-44" />
                <Skeleton className="mt-2.5 h-5 w-full max-w-[420px]" />
                {/* 모바일 전용 "총동연 자주 묻는 질문" 링크 자리 — 데스크탑은 사이드바에 같은 진입점이 있다. */}
                <Skeleton className="mt-2.5 h-[18px] w-36 md:hidden" />
              </div>
              <Skeleton className="h-10 w-full rounded-[10px] md:mt-1 md:w-[280px] md:shrink-0" />
            </div>
            <div className="mb-6 flex flex-wrap gap-2">
              {Array.from({ length: CATEGORY_PILL_COUNT }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-16 rounded-full" />
              ))}
            </div>
            <div className="space-y-3">
              {Array.from({ length: LIST_ROW_COUNT }).map((_, index) => (
                <Skeleton key={index} className="h-[72px] w-full rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
