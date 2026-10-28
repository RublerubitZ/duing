import type { FeeStatus } from '@duing/types';

// 서버 페이지(fees/page.tsx)가 import 한다 — 이 파일에 클라이언트 지시문을 붙이지 말 것. 클라이언트 모듈에서 가져오면 서버에서
// 클라이언트 참조가 되어 요청 시점에 페이지가 깨지고, 테스트·빌드로는 잡히지 않는다(test/manage/fee-tabs.test.ts 가 고정).
export type FeeTab = 'policy' | 'bill' | 'account' | 'bank' | 'cashbook';

export const FEE_TABS: { id: FeeTab; label: string }[] = [
  { id: 'policy', label: '정책' },
  { id: 'bill', label: '청구' },
  { id: 'account', label: '계좌' },
  { id: 'bank', label: '거래' },
  { id: 'cashbook', label: '장부' },
];

const FEE_STATUSES: FeeStatus[] = ['PENDING', 'PAID', 'PARTIAL_PAID', 'OVERDUE', 'CANCELLED'];

/** `?tab=` 값 → 처음 탭. 모르는 값·배열·없음은 정책 탭. */
export function parseFeeTab(value: string | string[] | undefined): FeeTab {
  return FEE_TABS.find((tab) => tab.id === value)?.id ?? 'policy';
}

/** 청구 탭일 때만 `?status=` 를 청구 목록 첫 필터로 받는다(운영진 홈의 회비 연체 행 → OVERDUE). */
export function parseInitialBillStatus(tab: FeeTab, value: string | string[] | undefined): FeeStatus | '' {
  if (tab !== 'bill') return '';
  return FEE_STATUSES.find((status) => status === value) ?? '';
}
