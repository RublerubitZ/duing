import { ClubExploreSkeleton } from './_components/ClubExploreSkeleton';

// 탐색 전용 로딩 경계 — 루트 loading.tsx 대신 이 세그먼트 레이아웃(ClubsLayout) 안에서 걸려, 응답이 흘러오는 동안에도
// 상단 탐색 메뉴(ExploreNav)와 크림 캔버스가 유지된다(운영 실측 10/7: 루트 경계일 때 1.7초 동안 메뉴가 사라졌다).
// 그림은 서버 fallback 이 데이터 없을 때 쓰는 전체 스켈레톤과 같다. 150ms 안에 끝나는 이동에는 보이지 않는다 —
// 지연은 래퍼에, 펄스는 스켈레톤 안쪽에 둔다(같은 요소면 animation 축약끼리 덮어써 펄스가 꺼진다).
// 상태 코드 동작은 그대로다 — 루트 경계가 이미 /clubs 전체를 감싸고, 이 아래에 notFound()·redirect() 를 부르는 페이지가 없다.
// 상세·멤버 경로는 더 가까운 [clubId]/loading.tsx 를 쓴다.
export default function Loading() {
  return (
    <div className="delayed-show">
      <ClubExploreSkeleton />
    </div>
  );
}
