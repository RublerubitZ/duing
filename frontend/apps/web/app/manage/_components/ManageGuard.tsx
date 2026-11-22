'use client';

import type { ReactNode } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ManagedClub } from '@duing/types';
import { toRoute } from '@/app/_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';

type ManageGuardProps = {
  managedClubs: ManagedClub[] | undefined;
  /** URL 의 `[clubId]` (숫자가 아니면 null). optional 로 두면 호출부가 빠뜨렸을 때 가드가 조용히 꺼진다. */
  currentClubId: number | null;
  /** 첫 조회 중 — 실패 뒤 다시 받는 중에는 false 로 받아 실패 안내를 그대로 둔다. */
  isLoading: boolean;
  /** 실패 뒤 다시 받는 중 — currentClubId 와 같은 이유로 optional 로 두지 않는다. */
  isRetrying: boolean;
  /** 운영 동아리 목록 다시 받기(쿼리 refetch). */
  onRetry: () => void;
  children: ReactNode;
};

export function ManageGuard({
  managedClubs,
  currentClubId,
  isLoading,
  isRetrying,
  onRetry,
  children,
}: ManageGuardProps) {
  if (isLoading) {
    return <LoadingGate label="운영 권한 확인 중" className="min-h-dvh" />;
  }

  // 받은 목록이 없으면 '없음'이 아니라 '모름'이다(#1579) — 운영 동아리가 없는 회원에게도 서버는 빈 배열로 답한다.
  if (!managedClubs) {
    return (
      <ManageGuardNotice
        heading="운영 동아리 목록을 불러오지 못했어요."
        actionHref={toRoute('/')}
        actionLabel="홈으로 돌아가기"
        retry={{ isRetrying, onRetry }}
      />
    );
  }

  if (managedClubs.length === 0) {
    return (
      <ManageGuardNotice
        heading="현재 운영하는 동아리가 없습니다."
        actionHref={toRoute('/')}
        actionLabel="홈으로 돌아가기"
      />
    );
  }

  // clubId 는 주소창에서 오는 값이라 숫자만 바꾸면 남의 동아리 콘솔 URL 이 된다. 하위 페이지마다
  // 개별로 막으면 새로 추가되는 페이지에서 다시 빠지므로, 콘솔 전체를 감싸는 이 레이아웃 가드
  // 한 곳에서만 판정한다. 실제 권한 경계는 서버이며 각 API 가 별도로 검증한다.
  if (currentClubId === null || !managedClubs.some((club) => club.clubId === currentClubId)) {
    return (
      <ManageGuardNotice
        status="403 Forbidden"
        heading="이 동아리의 운영 권한이 없습니다."
        actionHref={toRoute('/manage')}
        actionLabel="내 운영 콘솔로 이동"
      />
    );
  }

  return <>{children}</>;
}

/**
 * 차단 화면 — `.duing` 브랜드 스코프가 children 안(ManageShell)에 있어 가드 화면에는 닿지 않으므로
 * 여기서 직접 두른다. 레이아웃 밖 단독 화면이라 `/403` 페이지와 동일하게 main + h1 로 구성한다.
 */
function ManageGuardNotice({
  status,
  heading,
  actionHref,
  actionLabel,
  retry,
}: {
  status?: string;
  heading: string;
  actionHref: Route;
  actionLabel: string;
  /** 조회 실패 화면만 — 나가는 링크 앞에 '다시 시도'를 둔다. */
  retry?: { isRetrying: boolean; onRetry: () => void };
}) {
  return (
    <main className="duing bg-cream grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        {status && <p className="text-charcoal-3 text-sm font-semibold">{status}</p>}
        <h1 className="mt-2 text-xl font-bold text-ink">{heading}</h1>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {retry && (
            // 다시 받는 동안에도 같은 버튼을 둔다 — 갈아 끼우거나 disabled 로 바꾸면 누른 사람의 포커스가 사라진다.
            // 흐리게 하지 않는다(.btn 은 :disabled 일 때만 흐려진다). 잠긴 동안 누름을 무시하는 건 aria-disabled 의 뜻과 맞추기 위해서다.
            <button
              type="button"
              aria-disabled={retry.isRetrying || undefined}
              onClick={() => {
                if (!retry.isRetrying) retry.onRetry();
              }}
              className="btn btn-primary"
            >
              {retry.isRetrying ? '다시 불러오는 중' : '다시 시도'}
            </button>
          )}
          <Link href={actionHref} className="btn btn-secondary inline-flex">
            {actionLabel}
          </Link>
        </div>
      </div>
    </main>
  );
}
