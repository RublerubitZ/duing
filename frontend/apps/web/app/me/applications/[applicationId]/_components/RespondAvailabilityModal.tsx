'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@duing/api';
import { useRespondAvailabilityMutation } from '@duing/hooks';
import type { ApplicantInterviewSelectableSlot } from '@duing/types';
import { SlotPickerByDateGroup } from '@/components/interview/SlotPickerByDateGroup';
import { ButtonSpinner } from '@/components/loading/Spinner';

// 지원자 면접 가능 시간 응답 모달 (BE#8 — XOR payload).
// - 슬롯 경로: selected=true 인 슬롯을 초기 selectedSlotIds 로 프리필, 저장 시 { slotIds }
// - 가능없음 경로: "가능한 시간이 없어요" 토글 ON → 슬롯 피커 비활성 + textarea(선택, 500자)
//   저장 시 { noAvailableSlot: true, alternativeText? }
// XOR 는 UI 구조로 강제 — 토글 ON 이면 slotIds 를 payload 에 포함하지 않는다.
// 400/409 응답 시 서버 메시지를 인라인 에러로 표시(모달 유지).
//
// a11y 패턴: role=dialog·aria-modal·backdrop onClick close·escape 종료.

type Props = {
  isOpen: boolean;
  onClose: () => void;
  applicationId: number;
  slots: ApplicantInterviewSelectableSlot[];
  initialNoSlot?: boolean;
  initialAlternativeText?: string | null;
};

export function RespondAvailabilityModal({
  isOpen,
  onClose,
  applicationId,
  slots,
  initialNoSlot,
  initialAlternativeText,
}: Props) {
  // 서버 phase 의 selected 로 초기 선택 상태 구성 (프리필).
  const initialSelected = slots.filter((slot) => slot.selected).map((slot) => slot.slotId);

  const [selectedSlotIds, setSelectedSlotIds] = useState<number[]>(initialSelected);
  const [noSlotToggle, setNoSlotToggle] = useState(initialNoSlot ?? false);
  const [alternativeText, setAlternativeText] = useState(initialAlternativeText ?? '');
  const [inlineError, setInlineError] = useState<string | null>(null);

  const respondMutation = useRespondAvailabilityMutation(applicationId);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // 모달이 열릴 때마다 상태 초기화.
  useEffect(() => {
    if (isOpen) {
      setSelectedSlotIds(slots.filter((s) => s.selected).map((s) => s.slotId));
      setNoSlotToggle(initialNoSlot ?? false);
      setAlternativeText(initialAlternativeText ?? '');
      setInlineError(null);
    }
  }, [isOpen, slots, initialNoSlot, initialAlternativeText]);

  // Escape 닫기 + 진입 시 첫 인터랙티브 요소 autofocus.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'button:not([disabled])',
    );
    firstFocusable?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isSaveDisabled =
    respondMutation.isPending ||
    (!noSlotToggle && selectedSlotIds.length === 0);

  function handleSave() {
    setInlineError(null);
    const payload = noSlotToggle
      ? ({
          noAvailableSlot: true,
          ...(alternativeText.trim() ? { alternativeText: alternativeText.trim() } : {}),
        } as const)
      : ({ slotIds: selectedSlotIds } as const);

    respondMutation.mutate(payload, {
      onSuccess: () => {
        onClose();
      },
      onError: (error) => {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
            ? error.message
            : '저장에 실패했습니다.';
        setInlineError(message);
      },
    });
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(20, 48, 37, 0.35)',
        padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="respond-availability-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
          width: '100%',
          maxWidth: 480,
          borderRadius: 14,
          background: 'var(--paper)',
          padding: 24,
          boxShadow: 'var(--shadow-3)',
          gap: 0,
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <h3
            id="respond-availability-title"
            style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-deep)', margin: 0 }}
          >
            면접 가능 시간 선택
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="모달 닫기"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--charcoal-2)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {/* "가능한 시간이 없어요" 토글 */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
            cursor: 'pointer',
            fontSize: 13,
            color: 'var(--ink-deep)',
          }}
        >
          <input
            type="checkbox"
            checked={noSlotToggle}
            onChange={(event) => setNoSlotToggle(event.target.checked)}
            aria-label="가능한 시간이 없어요"
          />
          가능한 시간이 없어요
        </label>

        {/* 슬롯 피커 또는 사유 textarea */}
        <div style={{ minHeight: 0, flex: 1, overflowY: 'auto' }}>
          {noSlotToggle ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12.5, color: 'var(--charcoal-3)', margin: 0 }}>
                사유를 남겨주세요 (선택, 500자 이내)
              </p>
              <textarea
                value={alternativeText}
                onChange={(event) =>
                  setAlternativeText(event.target.value.slice(0, 500))
                }
                placeholder="운영진에게 전달할 내용을 입력하세요."
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--gray-line)',
                  fontSize: 13,
                  resize: 'vertical',
                  color: 'var(--ink-deep)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ) : (
            <SlotPickerByDateGroup
              slots={slots}
              selectedSlotIds={selectedSlotIds}
              onChange={setSelectedSlotIds}
              disabled={false}
              minSelected={1}
            />
          )}
        </div>

        {/* 인라인 에러 */}
        {inlineError && (
          <p
            role="alert"
            style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--error-line, #F5C2C2)',
              background: 'var(--error-bg, #FFF0F0)',
              color: 'var(--error-text, #C0392B)',
              fontSize: 12.5,
              margin: '12px 0 0',
            }}
          >
            {inlineError}
          </p>
        )}

        {/* 액션 버튼 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 16,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--gray-line)',
              background: 'transparent',
              fontSize: 13,
              color: 'var(--charcoal-2)',
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaveDisabled}
            className="inline-flex items-center gap-1.5"
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: isSaveDisabled ? 'var(--charcoal-3)' : '#2E6149',
              color: '#fff',
              fontSize: 13,
              cursor: isSaveDisabled ? 'not-allowed' : 'pointer',
              opacity: isSaveDisabled ? 0.55 : 1,
            }}
          >
            {respondMutation.isPending && <ButtonSpinner />}저장
          </button>
        </div>
      </div>
    </div>
  );
}
