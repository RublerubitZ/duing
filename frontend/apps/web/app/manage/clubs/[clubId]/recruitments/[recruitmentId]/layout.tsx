'use client';

import { use } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRecruitmentDetailQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';

/**
 * URL 의 clubId 와 recruitmentId 소속이 일치하는지 확인한다.
 *
 * 상위 ManageGuard 는 "내가 이 동아리 운영진인가"만 판정하므로, 내 동아리 clubId + 남의 모집 id 조합
 * (`/manage/clubs/1/recruitments/999`)은 통과한다. 모집 상세 조회는 공개 API(GET /recruitments/{id})라
 * 서버가 막지 않아 남의 모집이 내 콘솔 안에 렌더된다 — 그 조합을 여기서 끊는다. 하위 페이지마다
 * 붙이면 새 페이지에서 다시 빠지므로 이 세그먼트 layout 한 곳에서만 판정한다.
 *
 * 쓰기·비공개 조회는 이 화면과 무관하게 서버가 이미 403 으로 막는다(권한 경계는 서버). 따라서 조회
 * 실패(네트워크·404)로 소속을 확인할 수 없을 때는 차단하지 않고 각 페이지의 기존 처리에 맡긴다.
 */
export default function RecruitmentScopeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ clubId: string; recruitmentId: string }>;
}) {
  const { clubId: clubIdParam, recruitmentId: recruitmentIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const recruitmentId = Number(recruitmentIdParam);

  const { data: recruitment, isLoading } = useRecruitmentDetailQuery(
    isNaN(recruitmentId) ? undefined : recruitmentId,
  );

  if (isLoading) {
    return <LoadingGate label="모집 정보 불러오는 중" />;
  }

  if (recruitment && recruitment.clubId !== clubId) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-sm font-semibold text-charcoal-3">403 Forbidden</p>
        <p className="mt-2 text-charcoal-2">이 동아리의 모집 공고가 아닙니다.</p>
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments`)}
          className="btn btn-secondary mt-6 inline-flex"
        >
          모집 관리로 돌아가기
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
