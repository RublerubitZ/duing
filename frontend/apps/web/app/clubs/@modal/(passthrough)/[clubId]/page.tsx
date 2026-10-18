// 하드 로드 동아리 상세의 modal 짝 — 인터셉트가 아닌 /clubs/<id>(하드 로드·새로고침)에서 modal 은 비어 있다(스펙 P1 §3.1).
// (passthrough) 그룹은 children 의 /clubs 하위 페이지를 같은 경로·같은 파라미터 이름으로 따라 만든 미러다. catch-all 은 쓰지 않는다
// — /clubs/[...passthrough] 가 아무 주소나 받는 독립 라우트가 돼 잘못된 주소(/clubs/a/b)가 404 대신 200(loading 경계 안의 소프트
// 404)이 된다. ClubsSlotFrame 이 useSelectedLayoutSegments('modal') 의 '(passthrough)' 그룹 세그먼트로 전체 페이지를 가른다 —
// 그룹 이름을 바꾸면 거기도 바꾼다. children 에 /clubs 하위 페이지를 더하면 여기에도 같은 경로로 빈 미러를 더한다
// (test/clubs/clubs-modal-routes.test.tsx 가 막는다).
// 빌드 때 만드는 경로는 없다 — 이 함수가 없으면 하드 로드 /clubs/<id> 가 동적(ƒ)으로 떨어질 수 있다(catch-all 때 스파이크 실측).
export function generateStaticParams() {
  return [];
}

export default function ModalPassthroughClubDetail() {
  return null;
}
