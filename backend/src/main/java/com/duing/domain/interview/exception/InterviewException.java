package com.duing.domain.interview.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class InterviewException extends ApplicationException {

    protected InterviewException(String message, HttpStatus status) {
        super(message, status);
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
}
