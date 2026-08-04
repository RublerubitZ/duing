'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { ReactNode } from 'react';

import { ButtonSpinner } from '@/components/loading/Spinner';

type Props = {
  open: boolean;
  title: string;
  /**
   * 서식이 필요한 안내(대상 이름 강조 등)를 위해 ReactNode 를 받는다. 문자열도 그대로 통과한다.
   * <p> 안에 렌더되므로 인라인 요소만 넣는다 — div 등 블록 요소는 하이드레이션 경고가 된다.
   */
  description?: ReactNode;
  confirmLabel?: string;
  isPending?: boolean;
  /**
   * 확인 액션이 실패했을 때의 안내. 넘기면 모달을 닫지 말고 이 값을 채운다 — 소비처가 오류를
   * 화면 본문에 그리면 모달이 열려 있는 동안 오버레이·aria-hidden 뒤에 갇힌다.
   * 취소·재시도 시 소비처가 직접 비운다(상태 소유자가 소비처이므로 별도 리셋 콜백은 두지 않는다).
   */
  errorMessage?: string | null;
  /**
   * 확인 전에 한 단계를 더 요구하는 파괴적 액션용 슬롯(예: 문구 타이핑 확인). 설명 아래·푸터 위에 그린다.
   * 넘기지 않으면 이 노드 자체가 없어 기존 소비처 DOM 은 그대로다.
   */
  children?: ReactNode;
  /** 추가 단계를 아직 통과하지 못한 상태 — 확인 버튼만 잠근다(취소는 열어둔다). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 파괴적(삭제 등) 액션 확인용 공통 모달. 네이티브 confirm() 대신 디자인 시스템 Dialog 로 통일한다.
 * 처리 중(isPending)에는 외부 클릭·ESC 로 닫히지 않게 막아 중복 실행을 방지한다.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '삭제',
  isPending = false,
  errorMessage = null,
  children,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) onCancel();
      }}
    >
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {/* 실패는 모달 안에 남긴다 — 바깥에 그리면 오버레이와 aria-hidden 뒤에 갇혀 눈에도
            스크린리더에도 닿지 않는다. role="alert" 이 나중에 나타나는 이 문구를 즉시 읽게 한다.
            errorMessage 를 넘기지 않으면 이 노드 자체가 없어 기존 소비처 DOM 은 그대로다. */}
        {errorMessage && (
          <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">
            {errorMessage}
          </p>
        )}

        {children}

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending || confirmDisabled}
            className="btn btn-sm bg-coral text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50"
          >
            {isPending && <ButtonSpinner />}
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
