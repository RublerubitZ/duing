// /clubs 의 modal 짝 — 없으면 /clubs 의 modal 은 기본값(__DEFAULT__)이 되고, 소프트 이동은 기본값 슬롯에 직전 세그먼트를 그대로 써서
// 인터셉트 상세에서 '동아리' 링크·404 화면의 '동아리 탐색으로'·상단 바 뒤로의 대체 이동(/clubs)을 눌러도 상세가 남는다(스펙 P1 §3.1).
// 하위 페이지의 짝은 (passthrough) 그룹 미러다 — 목록 짝만 그룹 밖 여기에 둔다. 그룹 안에 두면 목록의 modal 경로도 '(passthrough)' 로
// 시작해 ClubsSlotFrame 이 목록을 전체 페이지로 가른다.
export default function ModalListPage() {
  return null;
}
