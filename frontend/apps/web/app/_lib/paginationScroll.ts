/**
 * 페이지 버튼을 누른 뒤 새 페이지의 첫머리가 보이게 한다 — 버튼은 목록 아래에 있어, 그대로 두면 새 페이지의 끝부터 보인다.
 *
 * - 누른 버튼의 가장 가까운 `[data-pagination-anchor]` 조상(목록이 화면의 첫 내용이 아닌 곳 — 요약·탭 아래 목록, 상세 안 섹션)이
 *   있으면 그 위로 간다. 위가 이미 보이면 움직이지 않는다. 상단 고정 바는 그 요소의 scroll-margin-top(scroll-mt-*)으로 비킨다.
 * - 없으면 화면 맨 위로 간다 — 목록이 그 화면의 첫 내용이다.
 * - 애니메이션 없이 즉시 옮긴다(이전 목록을 훑고 지나가지 않게).
 *
 * 페이지 버튼의 클릭 핸들러에서만 부른다. 페이지 effect 에서 부르면 뒤로 가기로 다시 마운트될 때 복원한 스크롤을 덮는다.
 * 표지는 DOM 속성이라 `/clubs` 의 데스크탑·모바일 두 트리, 숨긴 채 마운트된 탭에서도 누른 쪽이 잡힌다.
 */
export function scrollToPaginatedListStart(trigger: Element): void {
  const anchor = trigger.closest<HTMLElement>('[data-pagination-anchor]');
  if (anchor === null) {
    window.scrollTo({ top: 0 });
    return;
  }
  const stickyOffset = Number.parseFloat(window.getComputedStyle(anchor).scrollMarginTop) || 0;
  if (anchor.getBoundingClientRect().top >= stickyOffset) return;
  // jsdom 에는 scrollIntoView 가 없어 있을 때만 부른다(AdminClubJoinCodesTable 전례).
  anchor.scrollIntoView?.({ block: 'start' });
}
