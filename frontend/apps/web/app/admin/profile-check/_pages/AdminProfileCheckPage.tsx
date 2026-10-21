'use client';

import { ApiError } from '@duing/api';
import { useAdminProfileCheckQuery } from '@duing/hooks';

import { ErrorState } from '@/app/admin/_components/ErrorState';
import { LoadingGate } from '@/components/loading/LoadingGate';

import { ProfileCheckOverview } from '../_components/ProfileCheckOverview';
import { ProfileCheckSettingsForm } from '../_components/ProfileCheckSettingsForm';

const LOAD_FALLBACK_MESSAGE = '설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';

// 네트워크·타임아웃은 api 계층이 이미 사용자 문구로 정규화해 두므로 그대로 쓴다. 나머지는 폴백 한 줄이다.
function loadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && (error.code === 'NETWORK' || error.code === 'TIMEOUT')) {
    return error.message;
  }
  return LOAD_FALLBACK_MESSAGE;
}

/** 총동연 콘솔 — 학기별 사용자 정보 확인 팝업의 노출 상태·확인 현황과 설정. */
export function AdminProfileCheckPage() {
  const { data: profileCheck, isLoading, isError, error, refetch } = useAdminProfileCheckQuery();

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold text-ink">정보 확인 팝업</h1>
        <p className="mt-1 text-[13.5px] text-charcoal-2">
          학기 초 사용자에게 학년·전공을 확인받는 팝업을 관리합니다.
        </p>
      </header>

      {/* 데이터가 이미 있으면 재조회 실패로 화면을 비우지 않는다(BankMatchingClubs 전례) — 저장 직후 무효화가 일시 실패해도 방금 본 화면이 남는다. */}
      {profileCheck ? (
        <div className="max-w-3xl space-y-6">
          <ProfileCheckOverview profileCheck={profileCheck} />
          <ProfileCheckSettingsForm profileCheck={profileCheck} />
        </div>
      ) : isLoading ? (
        <LoadingGate className="min-h-0 py-16" label="정보 확인 팝업 설정 불러오는 중" />
      ) : isError ? (
        <ErrorState message={loadErrorMessage(error)} onRetry={() => void refetch()} />
      ) : null}
    </main>
  );
}
