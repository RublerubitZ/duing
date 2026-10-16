// /clubs 의 modal 짝 — 없으면 /clubs 의 modal 은 기본값(__DEFAULT__)이 되고, 소프트 이동은 기본값 슬롯에 직전 세그먼트를 그대로 써서
// 인터셉트 상세에서 '동아리' 링크·404 화면의 '동아리 탐색으로'·상단 바 뒤로의 대체 이동(/clubs)을 눌러도 상세가 남는다(스펙 P1 §3.1).
// 하위 페이지의 짝은 (passthrough) 그룹 미러다 — 목록 짝만 그룹 밖 여기에 둔다(구조 가드 test/clubs/clubs-modal-routes.test.tsx 가
// 목록 짝을 이 자리로 본다).
export default function ModalListPage() {
  return null;
}
