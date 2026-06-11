package com.duing.domain.interview.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class InterviewException extends ApplicationException {

    protected InterviewException(String message, HttpStatus status) {
        super(message, status);
    }

    // ── 404 Not Found ─────────────────────────────────────────────────────────

    public static final class RoundNotFound extends InterviewException {
        private static final String MESSAGE = "면접 라운드를 찾을 수 없습니다.";
        public RoundNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static final class SlotNotFound extends InterviewException {
        private static final String MESSAGE = "면접 슬롯을 찾을 수 없습니다.";
        public SlotNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    // ── 409 슬롯 수정 ──────────────────────────────────────────────────────────

    public static final class CapacityBelowAssigned extends InterviewException {
        private static final String MESSAGE = "정원이 이미 배정된 인원수보다 적을 수 없습니다.";
        public CapacityBelowAssigned() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    // ── 400 Bad Request ───────────────────────────────────────────────────────

    public static final class InterviewNotUsed extends InterviewException {
        private static final String MESSAGE = "면접을 사용하지 않는 모집입니다.";
        public InterviewNotUsed() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static final class CandidateNotEligible extends InterviewException {
        private static final String MESSAGE = "면접 대상으로 선정할 수 없는 상태의 지원자가 포함되어 있습니다.";
        public CandidateNotEligible() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static final class CandidateNotInRecruitment extends InterviewException {
        private static final String MESSAGE = "해당 모집의 지원자가 아닙니다.";
        public CandidateNotInRecruitment() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static final class InvalidDeadline extends InterviewException {
        private static final String MESSAGE = "면접 가능시간 마감은 현재 이후여야 합니다.";
        public InvalidDeadline() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static final class InvalidSlotTime extends InterviewException {
        private static final String MESSAGE = "슬롯 종료 시각은 시작 시각 이후여야 합니다.";
        public InvalidSlotTime() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static final class SlotTimePairRequired extends InterviewException {
        private static final String MESSAGE = "시작 시각과 종료 시각은 함께 입력해야 합니다.";
        public SlotTimePairRequired() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    // ── 409 Conflict ──────────────────────────────────────────────────────────

    public static final class DraftRoundAlreadyExists extends InterviewException {
        private static final String MESSAGE = "이미 준비 중(DRAFT)인 면접 라운드가 있습니다.";
        public DraftRoundAlreadyExists() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class CandidateAlreadyInActiveRound extends InterviewException {
        private static final String MESSAGE = "이미 진행 중인 면접 라운드에 소속된 지원자가 포함되어 있습니다.";
        public CandidateAlreadyInActiveRound() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class MemberTransitionNotAllowed extends InterviewException {
        private static final String MESSAGE = "현재 상태에서 허용되지 않는 멤버 상태 변경입니다.";
        public MemberTransitionNotAllowed() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class SlotChangeNotAllowedInCurrentPhase extends InterviewException {
        private static final String MESSAGE = "현재 단계에서는 슬롯을 변경할 수 없습니다.";
        public SlotChangeNotAllowedInCurrentPhase() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class SlotHasAvailability extends InterviewException {
        private static final String MESSAGE = "해당 슬롯을 선택한 지원자가 있어 삭제할 수 없습니다.";
        public SlotHasAvailability() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class SlotTimeChangeForbiddenForSelectedSlot extends InterviewException {
        private static final String MESSAGE = "지원자가 선택한 슬롯의 시간은 변경할 수 없습니다. 정원만 변경할 수 있습니다.";
        public SlotTimeChangeForbiddenForSelectedSlot() { super(MESSAGE, HttpStatus.CONFLICT); }
    }
}
