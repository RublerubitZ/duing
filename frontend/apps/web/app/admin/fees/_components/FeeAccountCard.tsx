'use client';

import Link from 'next/link';

import { useAdminFeeAccountQuery } from '@duing/hooks';

import { bankLabel } from '@/app/_lib/feeLabels';
import { toRoute } from '@/app/_lib/route';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { EmptyState } from '../../_components/EmptyState';
import { ErrorState } from '../../_components/ErrorState';

/**
 * 계좌 탭(스펙 §8.3) — 조회만 한다. 등록·변경·삭제 버튼을 두지 않는 것은 화면을 덜 만든 결과가 아니라
 * 이 콘솔의 원칙(§2 ADMIN 불가)이다. 회비 계좌는 동아리 운영진만 손댈 수 있다.
 *
 * <p>매칭 허용 여부는 플랫폼 기능 게이트라 총동연의 일이 맞지만, 그 화면은 따로 있다 — 링크로만 잇는다.
 */
export function FeeAccountCard({ clubId }: { clubId: number }) {
  const accountQuery = useAdminFeeAccountQuery(clubId);
  const account = accountQuery.data;

  if (accountQuery.isLoading) {
    return <ListRowsSkeleton rows={2} rowClassName="h-12 rounded-md" label="회비 계좌 조회 중" />;
  }

  if (accountQuery.isError) {
    return (
      <ConsoleCard>
        <ErrorState
          message="회비 계좌를 불러오지 못했어요."
          onRetry={() => void accountQuery.refetch()}
        />
      </ConsoleCard>
    );
  }

  if (!account?.registered) {
    return (
      <ConsoleCard>
        <EmptyState
          icon="🏦"
          title="등록된 회비 계좌가 없습니다"
          body={'이 동아리는 아직 회비 계좌를 등록하지 않았어요.\n계좌 등록은 동아리 운영진만 할 수 있습니다.'}
        />
      </ConsoleCard>
    );
  }

  return (
    <ConsoleCard className="p-6">
      <section aria-label="회비 계좌 정보">
        <p className="text-[17px] font-bold text-ink-deep">
          {/* 복호화에 실패하면 은행·예금주는 살아 있어도 번호만 비어 온다 — 카드를 통째로 감추지 않는다. */}
          {account.bank === null ? '은행 미상' : bankLabel(account.bank)}
          <span className="ml-2 tabular-nums text-charcoal">
            {account.maskedAccountNumber ?? '계좌번호 확인 불가'}
          </span>
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-[13.5px] sm:grid-cols-2">
          <div>
            <dt className="text-[12px] font-semibold text-charcoal-2">예금주</dt>
            <dd className="mt-0.5 text-ink">{account.accountHolder ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-semibold text-charcoal-2">BANK 자동매칭</dt>
            <dd className="mt-0.5 text-ink">
              {account.bankMatchingActive ? '사용 중' : '사용 안 함'}
            </dd>
          </div>
        </dl>

        <p className="mt-5 rounded-md border border-line bg-graysoft/50 px-3.5 py-3 text-[12.5px] leading-relaxed text-charcoal-2">
          ⓘ 계좌 정보는 조회만 가능합니다. 매칭 허용 설정은{' '}
          <Link
            href={toRoute('/admin/bank-matching')}
            className="font-semibold text-ink underline underline-offset-2"
          >
            BANK 자동매칭 콘솔 →
          </Link>
        </p>
      </section>
    </ConsoleCard>
  );
}
