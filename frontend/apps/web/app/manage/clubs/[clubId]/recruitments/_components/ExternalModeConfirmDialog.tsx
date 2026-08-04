'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MemberEnrollmentStepsCard } from './MemberEnrollmentStepsCard';

// 스펙 §1.1 안내 항목 — 외부 폼 모집에서 쓸 수 없는 기능과, 회원이 등록되는 경로.
const EXTERNAL_MODE_NOTICES = [
  '지원서를 두잉에서 받지 않아요 — 지원자는 외부 폼으로 이동해 작성해요.',
  '지원서 질문을 사용할 수 없어요.',
  '안내문을 사용할 수 없어요.',
  '면접 단계를 사용할 수 없어요.',
  '지원자 수 공개를 사용할 수 없어요.',
  '합격자는 가입 링크로 등록해요 — 운영진 승인으로 확정돼요.',
];

type Props = {
  open: boolean;
  /** 취소·Escape·바깥 클릭 — 자체 폼을 유지한다. */
  onCancel: () => void;
  /** 확인 — 외부 폼으로 전환하고 내부 전용 값을 그 자리에서 정리한다(호출부 책임). */
  onConfirm: () => void;
};

/**
 * 지원 방식을 외부 폼으로 바꾸기 전 확인 다이얼로그 (스펙 §1.1).
 * 전환은 안내문·질문·면접·지원자 수 공개를 되돌릴 수 없게 비우므로 즉시 바꾸지 않고 한 번 묻는다.
 * 포커스 트랩·Escape 닫힘은 공통 Dialog(Radix) 가 제공한다.
 */
export function ExternalModeConfirmDialog({ open, onCancel, onConfirm }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>외부 폼 모집으로 전환할까요?</DialogTitle>
          <DialogDescription>
            구글 폼·네이버 폼으로 지원을 받고, 합격자는 가입 링크로 등록하는 모집 방식이에요.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-charcoal-2">
          {EXTERNAL_MODE_NOTICES.map((notice) => (
            <li key={notice} className="flex gap-1.5">
              <span aria-hidden="true" className="text-charcoal-3">
                ·
              </span>
              <span>{notice}</span>
            </li>
          ))}
        </ul>

        <div>
          <div className="mb-2 text-[12.5px] font-bold text-ink-deep">회원 등록 절차</div>
          <MemberEnrollmentStepsCard />
        </div>

        <p className="rounded-[10px] bg-coral/5 px-3 py-2 text-xs leading-relaxed text-coral">
          지금까지 작성한 안내문·지원서 질문과 면접 진행·지원자 수 공개 설정은 전환하면 초기화돼요.
        </p>

        <DialogFooter>
          <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button type="button" onClick={onConfirm} className="btn btn-primary btn-sm">
            확인하고 전환
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
