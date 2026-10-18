// 회원 공지 목록(/clubs/<id>/member/notices)의 modal 짝 — modal 은 비어 있다. 미러 규칙은 (passthrough)/[clubId]/page.tsx 주석을 본다.
// 빌드 때 만드는 경로는 없다 — 이 함수가 없으면 이 회원 화면 라우트가 동적(ƒ)으로 떨어질 수 있다.
export function generateStaticParams() {
  return [];
}

export default function ModalPassthroughMemberNotices() {
  return null;
}
