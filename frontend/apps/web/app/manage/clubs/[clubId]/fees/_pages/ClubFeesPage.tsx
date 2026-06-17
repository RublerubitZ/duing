'use client';

import { useState } from 'react';

import { cn } from '@/app/_lib/cn';

import { BillList } from '../_components/BillList';
import { CreatePolicyDialog } from '../_components/CreatePolicyDialog';
import { GenerateBillsDialog } from '../_components/GenerateBillsDialog';
import { PolicyList } from '../_components/PolicyList';

type ClubFeesPageProps = {
  clubId: number;
};

type FeeTab = 'policy' | 'bill';

const TABS: { id: FeeTab; label: string }[] = [
  { id: 'policy', label: '정책' },
  { id: 'bill', label: '청구' },
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
    </div>
  );
}
