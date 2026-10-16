'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useSelectedLayoutSegment, useSelectedLayoutSegments } from 'next/navigation';

import { parsePositiveIdParam } from '@/app/_lib/idParam';

// modal 미러 라우트 그룹(@modal/(passthrough)/…)의 세그먼트 — 하드 로드 상세·회원 화면의 modal 경로에 들어 있다. 폴더 이름과
// 같아야 한다(미러 구조는 test/clubs/clubs-modal-routes.test.tsx 가 지킨다).
const PASSTHROUGH_SEGMENT = '(passthrough)';

type Props = {
  children: ReactNode;
  modal: ReactNode;
};

/**
 * 동아리 레이아웃의 슬롯 판별·목록 숨김(스펙 P1 §3.2) — 목록에서 상세를 인터셉트(modal 슬롯)로 열 때 목록(children)을 hidden 으로
 * 숨긴 채 마운트해 둬, 뒤로가기(iOS 스와이프 백)에서 다시 그리지 않는다. 판별 값은 이 레이아웃 기준이다(LayoutRouterContext 가
 * clubs 세그먼트).
 * - 인터셉트 = modal 경로(useSelectedLayoutSegments('modal'))에 미러 그룹 '(passthrough)' 가 없고 마지막 세그먼트가 양의 정수 id 일
 *   때뿐이다((.)[clubId] 는 동아리 id 로 나온다). 그 밖에는 children 세그먼트로 가른다(null = 목록, 아니면 전체 페이지). fail-open 이다
 *   — Next 내부 세그먼트('(__SLOT__)'·'__DEFAULT__' 등)는 보지 않아, 모르는 값이 생겨도 목록·하드 로드 상세는 그대로 그려진다(인터셉트를
 *   놓치면 목록이 숨지 않은 채 상세 셸이 그 아래 함께 그려진다 — 빈 화면은 아니다). 남는 의존은 라우트 그룹이 이 값에 남는 동작(Next 문서)이라 Next 를 올리면 E2E 표식 케이스를 돌린다(스펙 §3.2).
 *   단수형 useSelectedLayoutSegment('modal') 은 경로의 마지막 세그먼트라 하드 로드 상세와 인터셉트가 같은 id 다.
 * - 숨겨 유지하는 것은 목록뿐이다. children 이 목록이 아니면(회원 화면·하드 로드 상세) 인터셉트 동안 렌더하지 않는다 — 숨겨 두면
 *   그 화면 effect 가 계속 돈다(거부된 회원 화면의 접근 가드가 replace 를 끝없이 되풀이한다). 뒤로 오면 다시 마운트된다(현행과 같다).
 * - 목록을 숨긴 채 새로 마운트하지 않는다 — 직전 커밋에 마운트돼 있지 않았으면(회원 화면 → 뒤로 체인, 다른 화면에서 뒤로 들어온
 *   인터셉트 엔트리) 인터셉트 동안 렌더하지 않고 목록이 보일 때 새로 마운트한다. 그래서 목록은 늘 목록 주소의 쿼리로 마운트된다.
 * - children 래퍼는 상태와 상관없이 같은 자리에 둔다(래퍼가 바뀌면 목록이 다시 마운트된다). 숨김은 hidden 으로만 — visibility·
 *   position 으로 숨기면 문서 높이가 남고 View Transition 캡처에 들어가 로고 이름(club-logo-<id>)이 겹친다.
 * - 상세(modal)는 children 래퍼 뒤에 문서 흐름으로 그린다(고정 오버레이 아님 — iOS 문서 스크롤·툴바 접힘 유지).
 * 루트 data-clubs-slot(list·page·intercepted)과 숨은 목록 래퍼의 data-clubs-hidden-list 는 테스트·QA 가 인터셉트와 전체 페이지를
 * 가르는 표식이다.
 */
export function ClubsSlotFrame({ children, modal }: Props) {
  const modalPath = useSelectedLayoutSegments('modal');
  const modalLeaf = modalPath[modalPath.length - 1];
  const intercepted =
    !modalPath.includes(PASSTHROUGH_SEGMENT) && modalLeaf !== undefined && parsePositiveIdParam(modalLeaf) !== null;
  const childSegment = useSelectedLayoutSegment();
  const childIsList = childSegment === null;
  // 직전 커밋에 목록이 마운트돼 있었는지 — 렌더에서 읽고 커밋 뒤에 갱신한다.
  const listMountedRef = useRef(false);
  const keepsHiddenList = intercepted && childIsList && listMountedRef.current;
  const rendersChildren = !intercepted || keepsHiddenList;
  const slotState = intercepted ? 'intercepted' : childIsList ? 'list' : 'page';

  useEffect(() => {
    listMountedRef.current = rendersChildren && childIsList;
  });

  return (
    <div data-clubs-slot={slotState}>
      {rendersChildren && (
        <div hidden={keepsHiddenList} data-clubs-hidden-list={keepsHiddenList ? 'true' : undefined}>
          {children}
        </div>
      )}
      {modal}
    </div>
  );
}
