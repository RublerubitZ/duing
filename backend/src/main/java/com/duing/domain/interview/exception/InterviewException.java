package com.duing.domain.interview.exception;

import com.duing.domain.interview.service.dto.query.UnresolvedMembersPayload;
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

    public static final class ScheduleNotFound extends InterviewException {
        private static final String MESSAGE = "해제할 면접 배정이 없습니다.";
        public ScheduleNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static final class MemberNotFound extends InterviewException {
        private static final String MESSAGE = "해당 면접 라운드의 멤버가 아닙니다.";
        public MemberNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static final class SlotNotFound extends InterviewException {
        private static final String MESSAGE = "면접 슬롯을 찾을 수 없습니다.";
        public SlotNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static final class RoundMembershipNotFound extends InterviewException {
        private static final String MESSAGE = "응답할 수 있는 면접 라운드가 없습니다.";
        public RoundMembershipNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
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

    public static final class InvalidSlotSelection extends InterviewException {
        private static final String MESSAGE = "선택한 슬롯이 유효하지 않습니다.";
        public InvalidSlotSelection() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static final class InvalidAvailabilityRequest extends InterviewException {
        private static final String MESSAGE = "슬롯 선택과 '가능한 시간 없음' 중 하나만 보내야 합니다.";
        public InvalidAvailabilityRequest() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
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

    public static final class AvailabilityDeadlineRequired extends InterviewException {
        private static final String MESSAGE = "발송 전에 면접 가능시간 마감을 설정해야 합니다.";
        public AvailabilityDeadlineRequired() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
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

    public static final class AvailabilityPeriodClosed extends InterviewException {
        private static final String MESSAGE = "면접 가능 시간 응답 기간이 아닙니다.";
        public AvailabilityPeriodClosed() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class ApplicationAlreadyDecided extends InterviewException {
        private static final String MESSAGE = "이미 합격/불합격 처리된 지원입니다.";
        public ApplicationAlreadyDecided() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class RoundTransitionNotAllowed extends InterviewException {
        private static final String MESSAGE = "현재 단계에서 허용되지 않는 라운드 상태 변경입니다.";
        public RoundTransitionNotAllowed() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class SlotCapacityExceeded extends InterviewException {
        private static final String MESSAGE = "해당 슬롯의 수용 인원이 가득 찼습니다.";
        public SlotCapacityExceeded() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class RoundHasNoSlots extends InterviewException {
        private static final String MESSAGE = "슬롯이 없는 라운드는 발송할 수 없습니다. 슬롯을 먼저 생성해주세요.";
        public RoundHasNoSlots() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class NoMemberToNotify extends InterviewException {
        private static final String MESSAGE = "알림을 보낼 대상자가 없습니다.";
        public NoMemberToNotify() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

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

    public static final class LastSlotUndeletableWhileCollecting extends InterviewException {
        private static final String MESSAGE = "응답 수집 중에는 마지막 슬롯을 삭제할 수 없습니다.";
        public LastSlotUndeletableWhileCollecting() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class NothingToConfirm extends InterviewException {
        private static final String MESSAGE = "확정할 면접 배정이 없습니다.";
        public NothingToConfirm() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class RoundHasUnresolvedMembers extends InterviewException {
        private static final String MESSAGE = "미처리 멤버가 있어 확정할 수 없습니다. 처리 후 다시 시도하거나 강제 확정하세요.";
        private final UnresolvedMembersPayload payload;

        public RoundHasUnresolvedMembers(UnresolvedMembersPayload payload) {
            super(MESSAGE, HttpStatus.CONFLICT);
            this.payload = payload;
        }

        public UnresolvedMembersPayload getPayload() {
            return payload;
        }
    }
}
