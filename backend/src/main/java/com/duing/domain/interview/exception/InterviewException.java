package com.duing.domain.interview.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class InterviewException extends ApplicationException {

    protected InterviewException(String message, HttpStatus status) {
        super(message, status);
    }

    // ── 404 Not Found ─────────────────────────────────────────────────────────

    public static final class InterviewConfigNotFound extends InterviewException {
        private static final String MESSAGE = "면접 설정을 찾을 수 없습니다.";
        public InterviewConfigNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static final class SlotNotFound extends InterviewException {
        private static final String MESSAGE = "면접 슬롯을 찾을 수 없습니다.";
        public SlotNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static final class ScheduleNotFound extends InterviewException {
        private static final String MESSAGE = "면접 일정을 찾을 수 없습니다.";
        public ScheduleNotFound() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    // ── 409 라이프사이클 ────────────────────────────────────────────────────────

    public static final class ConfigAlreadyExists extends InterviewException {
        private static final String MESSAGE = "이미 면접 설정이 존재합니다.";
        public ConfigAlreadyExists() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class RecruitmentAlreadyStarted extends InterviewException {
        private static final String MESSAGE = "이미 시작된 모집에는 면접 설정과 슬롯을 변경할 수 없습니다.";
        public RecruitmentAlreadyStarted() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class AvailabilityPeriodClosed extends InterviewException {
        private static final String MESSAGE = "가용 시간 제출 기간이 마감되었습니다.";
        public AvailabilityPeriodClosed() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class AvailabilityPeriodOpen extends InterviewException {
        private static final String MESSAGE = "가용 시간 제출 기간이 아직 진행 중입니다.";
        public AvailabilityPeriodOpen() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class AssignmentAlreadyCompleted extends InterviewException {
        private static final String MESSAGE = "이미 면접 배정이 완료된 모집입니다.";
        public AssignmentAlreadyCompleted() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class NoSlotsAvailable extends InterviewException {
        private static final String MESSAGE = "모집이 종료되어 더 이상 면접 슬롯을 조회할 수 없습니다.";
        public NoSlotsAvailable() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class NoCandidates extends InterviewException {
        private static final String MESSAGE = "배정할 면접 대상자가 없습니다.";
        public NoCandidates() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    // ── 409 슬롯 수정 ──────────────────────────────────────────────────────────

    public static final class SlotHasAvailability extends InterviewException {
        private static final String MESSAGE = "해당 슬롯에 이미 가용 시간을 제출한 지원자가 있습니다.";
        public SlotHasAvailability() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class SlotHasSchedule extends InterviewException {
        private static final String MESSAGE = "해당 슬롯에 배정된 면접 일정이 존재합니다.";
        public SlotHasSchedule() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class CapacityBelowAssigned extends InterviewException {
        private static final String MESSAGE = "정원이 이미 배정된 인원수보다 적을 수 없습니다.";
        public CapacityBelowAssigned() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static final class CapacityExceeded extends InterviewException {
        private static final String MESSAGE = "슬롯 정원을 초과하여 배정할 수 없습니다.";
        public CapacityExceeded() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    // ── 409 race ──────────────────────────────────────────────────────────────

    public static final class AvailabilityConflict extends InterviewException {
        private static final String MESSAGE = "동일한 슬롯에 중복으로 가용 시간을 제출할 수 없습니다.";
        public AvailabilityConflict() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    // ── 400 Bad Request ───────────────────────────────────────────────────────

    public static final class DuplicateSlotInRequest extends InterviewException {
        private static final String MESSAGE = "요청에 중복된 슬롯이 포함되어 있습니다.";
        public DuplicateSlotInRequest() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static final class InvalidSlotSelection extends InterviewException {
        private static final String MESSAGE = "선택한 슬롯이 유효하지 않습니다.";
        public InvalidSlotSelection() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static final class InvalidApplicationStatus extends InterviewException {
        private static final String MESSAGE = "면접 배정이 가능한 지원 상태가 아닙니다.";
        public InvalidApplicationStatus() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static final class InvalidDeadline extends InterviewException {
        private static final String MESSAGE = "면접 가능시간 제출 마감은 모집 시작일 이후여야 합니다.";
        public InvalidDeadline() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    // ── 403 Forbidden ─────────────────────────────────────────────────────────

    public static final class NotApplicationOwner extends InterviewException {
        private static final String MESSAGE = "본인의 지원서가 아닙니다.";
        public NotApplicationOwner() { super(MESSAGE, HttpStatus.FORBIDDEN); }
    }
}
