'use client';

import Link from 'next/link';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toRoute } from '@/app/_lib/route';

/**
 * 회원 초대 진입점 (스펙 §5). 가입 링크는 모집에 귀속되므로 링크 관리 UI 는 모집 관리 화면으로 옮겼고,
 * 이 자리에는 안내와 이동 링크만 남긴다 — 이메일·QR·직접 초대가 붙을 자리라 진입점 구조는 유지한다.
 */
export function MemberInviteGuideDialog({
  clubId,
  onClose,
}: {
  clubId: number;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>회원 초대</DialogTitle>
          <DialogDescription>
            외부 폼 모집의 회원 등록은 모집 관리에서 진행합니다.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm leading-relaxed text-charcoal-2">
          합격자에게 전달할 가입 링크는 해당 모집의 관리 화면에서 만들고 관리해요. 학생이 링크로 보낸
          가입 요청을 운영진이 승인하면 회원으로 등록됩니다.
        </p>

        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments`)}
          onClick={onClose}
          className="btn btn-primary btn-sm w-full"
        >
          모집 관리로 이동
        </Link>
      </DialogContent>
    </Dialog>
  );
}
