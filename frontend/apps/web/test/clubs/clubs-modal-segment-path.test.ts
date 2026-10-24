import type { FlightRouterState } from 'next/dist/shared/lib/app-router-types';
import { getSelectedLayoutSegmentPath } from 'next/dist/shared/lib/segment';
import { describe, expect, it } from 'vitest';

// Next 를 올릴 때 이 표기가 바뀌면 CI 가 울리게 — ClubsSlotFrame 판별은 useSelectedLayoutSegments('modal')(이 함수)가 라우트 그룹
// '(passthrough)'·인터셉트 '(...)clubs' 세그먼트를 거르지 않고 돌려준다는 데 기댄다(실측 배열은 원장 Task 2.5, 16.3.8).
// 한계: 트리는 clubs 레이아웃 노드를 손으로 만든 것이라 서버가 보내는 트리 모양(슬롯 루트 '(__SLOT__)' 등)이 바뀌는 것은 못 본다 — E2E 몫.
const page: FlightRouterState = ['__PAGE__', {}];
const clubIdSegment = (clubId: string): FlightRouterState => [['clubId', clubId, 'd', null], { children: page }];
const clubsLayout = (children: FlightRouterState, modal: FlightRouterState): FlightRouterState => [
  'clubs',
  { children, modal: ['(__SLOT__)', { children: modal }] },
];
const memberNotices = (clubId: string): FlightRouterState => [
  ['clubId', clubId, 'd', null],
  { children: ['member', { children: ['notices', { children: page }] }] },
];

describe('Next 세그먼트 표기 — clubs 레이아웃의 modal 경로(ClubsSlotFrame 판별 입력)', () => {
  it.each<[string, FlightRouterState, string[]]>([
    ['인터셉트 /clubs/5', clubsLayout(page, ['(...)clubs', { children: clubIdSegment('5') }]), ['(__SLOT__)', '(...)clubs', '5']],
    ['목록 /clubs', clubsLayout(page, page), ['(__SLOT__)']],
    [
      '하드 로드 /clubs/abc',
      clubsLayout(clubIdSegment('abc'), ['(passthrough)', { children: clubIdSegment('abc') }]),
      ['(__SLOT__)', '(passthrough)', 'abc'],
    ],
  ])('%s', (_label, clubsLayoutTree, expectedModalPath) => {
    expect(getSelectedLayoutSegmentPath(clubsLayoutTree, 'modal')).toEqual(expectedModalPath);
  });
});

// 라우트 공지 영역의 밑 화면 키 — ClubsSlotFrame 이 useSelectedLayoutSegments()(children) 를 '/' 로 이어 넘긴다(스펙 2026-10-24 제목 연속성 §3.2).
// page 세그먼트를 거르는 규칙이 16.3.8 startsWith('__PAGE__') → 16.4.3 === '__PAGE__' 로 바뀌었다(16.4 는 page 세그먼트에 쿼리를 붙이지 않는다).
describe('Next 세그먼트 표기 — clubs 레이아웃의 children 경로(공지 영역의 밑 화면 키)', () => {
  it.each<[string, FlightRouterState, string[]]>([
    ['목록 /clubs', clubsLayout(page, page), []],
    ['하드 로드 상세 /clubs/5', clubsLayout(clubIdSegment('5'), ['(passthrough)', { children: clubIdSegment('5') }]), ['5']],
    [
      '회원 화면 /clubs/5/member/notices',
      clubsLayout(memberNotices('5'), ['(passthrough)', { children: memberNotices('5') }]),
      ['5', 'member', 'notices'],
    ],
    ['목록 위 인터셉트 /clubs/6', clubsLayout(page, ['(...)clubs', { children: clubIdSegment('6') }]), []],
    ['회원 화면 위 인터셉트 /clubs/6', clubsLayout(memberNotices('5'), ['(...)clubs', { children: clubIdSegment('6') }]), ['5', 'member', 'notices']],
  ])('%s', (_label, clubsLayoutTree, expectedChildrenPath) => {
    expect(getSelectedLayoutSegmentPath(clubsLayoutTree, 'children')).toEqual(expectedChildrenPath);
  });
});
