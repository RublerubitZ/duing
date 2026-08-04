'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useJoinRequestsQuery } from '@duing/hooks';
import type { RecruitmentSummary } from '@duing/types';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toRoute } from '@/app/_lib/route';
import { MemberEnrollmentPanel } from './MemberEnrollmentSection';

/**
 * 외부 폼(EXTERNAL) 모집 카드의 액션 (스펙 §5.1). 지원서·통계를 쓰지 않는 모드라 지원자 관리·통계
 * 대신 가입 링크 관리와 가입 요청 관리만 남긴다. 링크 관리는 상세와 같은 패널을 다이얼로그로 띄워
 * 목록에서 바로 끝낸다 — 운영진이 가장 자주 하는 작업이라 상세 진입 한 단계를 없앤다.
 *
 * 활성 링크·대기 건수 조회는 EXTERNAL 카드에서만 필요하므로 훅을 이 컴포넌트 안에 가둔다
 * (자체 폼 카드는 이 컴포넌트를 렌더하지 않아 요청 자체가 나가지 않는다).
 */
export function ExternalRecruitmentActions({
  clubId,
  recruitment,
}: {
  clubId: number;
  recruitment: RecruitmentSummary;
}) {
  const [joinLinkOpen, setJoinLinkOpen] = useState(false);
  const { data: pendingJoinRequests } = useJoinRequestsQuery(clubId, 'PENDING');
  const pendingCount = pendingJoinRequests?.length ?? 0;

  return (
    <>
      <button type="button" onClick={() => setJoinLinkOpen(true)} className="btn btn-primary btn-sm">
        가입 링크
      </button>
      <Link
        href={toRoute(`/manage/clubs/${clubId}/members/requests`)}
        className="btn btn-secondary btn-sm"
      >
        가입 요청 관리
        {pendingCount > 0 && (
          <span className="ml-1.5 rounded-full bg-coral px-1.5 py-0.5 text-xs font-semibold text-paper">
            {pendingCount}
          </span>
        )}
      </Link>

      <Dialog open={joinLinkOpen} onOpenChange={setJoinLinkOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>가입 링크</DialogTitle>
            <DialogDescription>
              합격자에게 전달할 가입 링크를 만들고 관리해요.
            </DialogDescription>
          </DialogHeader>

          <MemberEnrollmentPanel
            clubId={clubId}
            recruitmentId={recruitment.id}
            clubName={recruitment.clubName}
            canCreate={recruitment.effectivelyOpen}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
