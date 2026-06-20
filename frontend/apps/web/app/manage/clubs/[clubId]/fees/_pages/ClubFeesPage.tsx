'use client';

import { useState, type ReactNode } from 'react';

import { useClubBankMatchingStatusQuery, useClubFeeAccountQuery } from '@duing/hooks';

import { cn } from '@/app/_lib/cn';
import { bankLabel } from '@/app/_lib/feeLabels';

import { BankReviewQueue } from '../_components/BankReviewQueue';
import { BankSyncDialog } from '../_components/BankSyncDialog';
import { BillList } from '../_components/BillList';
import { CashbookPanel } from '../_components/CashbookPanel';
import { CreatePolicyDialog } from '../_components/CreatePolicyDialog';
import { FeeAccountSection } from '../_components/FeeAccountSection';
import { FeeSummaryCards } from '../_components/FeeSummaryCards';
import { GenerateBillsDialog } from '../_components/GenerateBillsDialog';
import { PolicyList } from '../_components/PolicyList';

type ClubFeesPageProps = {
  clubId: number;
};

type FeeTab = 'policy' | 'bill' | 'account' | 'bank' | 'cashbook';

const TABS: { id: FeeTab; label: string }[] = [
  { id: 'policy', label: '정책' },
  { id: 'bill', label: '청구' },
  { id: 'account', label: '계좌' },
  { id: 'bank', label: '거래' },
  { id: 'cashbook', label: '장부' },
];

export function ClubFeesPage({ clubId }: ClubFeesPageProps) {
  const [activeTab, setActiveTab] = useState<FeeTab>('policy');
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isGenerateOpen, setGenerateOpen] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <header>
        <h1 className="text-xl font-bold">회비 관리</h1>
        <p className="mt-1 text-sm text-charcoal-2">
          회비 정책을 만들고, 회원에게 청구서를 발행합니다.
        </p>
      </header>

      <div role="tablist" aria-label="회비 관리 탭" className="flex gap-1 border-b border-line">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`fee-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`fee-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
              activeTab === tab.id
                ? 'border-ink text-ink'
                : 'border-transparent text-charcoal-3 hover:text-charcoal-2',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'policy' && (
        <section
          id="fee-panel-policy"
          role="tabpanel"
          aria-labelledby="fee-tab-policy"
          className="space-y-4"
        >
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-ink-deep"
            >
              정책 추가
            </button>
          </div>

          <PolicyList clubId={clubId} />

          {isCreateOpen && (
            <CreatePolicyDialog clubId={clubId} onClose={() => setCreateOpen(false)} />
          )}
        </section>
      )}

      {activeTab === 'bill' && (
        <section
          id="fee-panel-bill"
          role="tabpanel"
          aria-labelledby="fee-tab-bill"
          className="space-y-4"
        >
          <FeeSummaryCards clubId={clubId} />

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setGenerateOpen(true)}
              className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-ink-deep"
            >
              청구 발행
            </button>
          </div>

          <BillList clubId={clubId} />

          {isGenerateOpen && (
            <GenerateBillsDialog clubId={clubId} onClose={() => setGenerateOpen(false)} />
          )}
        </section>
      )}

      {activeTab === 'account' && (
        <section
          id="fee-panel-account"
          role="tabpanel"
          aria-labelledby="fee-tab-account"
          className="space-y-4"
        >
          <FeeAccountSection clubId={clubId} />
        </section>
      )}

      {activeTab === 'bank' && (
        <section
          id="fee-panel-bank"
          role="tabpanel"
          aria-labelledby="fee-tab-bank"
          className="space-y-4"
        >
          <BankTabPanel clubId={clubId} />
        </section>
      )}

      {activeTab === 'cashbook' && (
        <section
          id="fee-panel-cashbook"
          role="tabpanel"
          aria-labelledby="fee-tab-cashbook"
          className="space-y-4"
        >
          <CashbookPanel clubId={clubId} />
        </section>
      )}
    </div>
  );
}

type BankTabPanelProps = {
  clubId: number;
};

// 거래 탭에서 동기화 버튼 대신 보여주는 안내 카드(로딩·오류·미사용 상태 공용).
function BankTabNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-graysoft px-6 py-12 text-center">
      {children}
    </div>
  );
}

// 거래 탭 본문. BANK 자동매칭 사용 가능 여부를 먼저 조회해, 미사용 동아리는 동기화를 눌러보기 전에
// 안내 카드만 노출하고 동기화 버튼·검토 큐는 숨긴다. fee_account 가 등록돼 있으면 동기화 모달에 그 은행 라벨을 넘긴다.
function BankTabPanel({ clubId }: BankTabPanelProps) {
  const [isSyncOpen, setSyncOpen] = useState(false);
  const {
    data: matchingStatus,
    isLoading: isStatusLoading,
    isError: isStatusError,
  } = useClubBankMatchingStatusQuery(clubId);
  const { data: feeAccount } = useClubFeeAccountQuery(clubId);

  // 사용 가능 여부가 확정되기 전에는 동기화 버튼을 노출하지 않는다 — 미연동인데 잠깐 버튼이 보였다 사라지는 깜빡임 방지.
  if (isStatusLoading) {
    return (
      <BankTabNotice>
        <p className="text-sm text-charcoal-3">불러오는 중…</p>
      </BankTabNotice>
    );
  }

  // 조회 실패 시에는 미사용으로 단정하지 않는다 — 정상 연동 동아리가 일시 오류로 "미사용" 안내를 받지 않도록
  // 별도 오류 안내를 보여준다(동기화 버튼은 여전히 숨긴다).
  if (isStatusError) {
    return (
      <BankTabNotice>
        <p className="text-sm text-charcoal-2">
          BANK 자동매칭 사용 가능 여부를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      </BankTabNotice>
    );
  }

  // 미사용(enabled=false) 동아리는 동기화를 누르기 전에 안내 카드만 노출한다.
  if (!matchingStatus?.enabled) {
    return (
      <BankTabNotice>
        <p className="text-sm text-charcoal-2">
          이 동아리는 BANK 자동매칭을 사용하지 않습니다. (총동연 등록 필요)
        </p>
      </BankTabNotice>
    );
  }

  // 계좌 미등록(404 등)이면 은행 라벨을 알 수 없다 — 동기화 모달은 빈 상태에서도 열 수 있으나
  // 라벨 자리에는 안내 문구를 보여준다.
  const syncBankLabel = feeAccount ? bankLabel(feeAccount.bank) : '등록된 회비 계좌 없음';

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setSyncOpen(true)}
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-ink-deep"
        >
          거래내역 동기화
        </button>
      </div>

      <BankReviewQueue clubId={clubId} />

      {isSyncOpen && (
        <BankSyncDialog
          clubId={clubId}
          bankLabel={syncBankLabel}
          onClose={() => setSyncOpen(false)}
        />
      )}
    </div>
  );
}
