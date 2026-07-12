package com.duing.domain.club.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ClubException extends ApplicationException {

    protected ClubException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class ClubNotFoundException extends ClubException {
        private static final String MESSAGE = "동아리를 찾을 수 없습니다.";

        public ClubNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    public static class DuplicateClubNameException extends ClubException {
        private static final String MESSAGE = "이미 존재하는 동아리 이름입니다.";

        public DuplicateClubNameException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class InvalidClubStatusTransitionException extends ClubException {
        public InvalidClubStatusTransitionException(String from, String to) {
            super("허용되지 않는 상태 전이입니다: " + from + " → " + to, HttpStatus.BAD_REQUEST);
        }
    }

    public static class RejectionReasonRequiredException extends ClubException {
        private static final String MESSAGE = "거절 사유는 필수입니다.";
        public RejectionReasonRequiredException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class ClubNotClosableException extends ClubException {
        public ClubNotClosableException(String currentStatus) {
            super("운영 중단(INACTIVE) 또는 거절(REJECTED) 상태의 동아리만 폐쇄할 수 있습니다. 현재 상태: " + currentStatus,
                    HttpStatus.BAD_REQUEST);
        }
    }

    public static class RoundNotFoundException extends ClubException {
        public RoundNotFoundException() {
            super("재인증 라운드를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class DuplicateOpenRoundException extends ClubException {
        public DuplicateOpenRoundException() {
            super("해당 연도에 이미 열린 재인증 라운드가 있습니다.", HttpStatus.CONFLICT);
        }
    }

    public static class RoundAlreadyClosedException extends ClubException {
        public RoundAlreadyClosedException() {
            super("이미 종료된 재인증 라운드입니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class RecertificationRequestNotFoundException extends ClubException {
        public RecertificationRequestNotFoundException() {
            super("재인증 요청을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class NotCentralClubException extends ClubException {
        public NotCentralClubException() {
            super("중앙동아리만 재인증을 제출할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class NoOpenRoundException extends ClubException {
        public NoOpenRoundException() {
            super("열린 재인증 라운드가 없습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class DuplicatePendingRecertificationException extends ClubException {
        public DuplicatePendingRecertificationException() {
            super("이미 처리 대기 중인 재인증 요청이 있습니다.", HttpStatus.CONFLICT);
        }
    }

    public static class InvalidRecertificationTransitionException extends ClubException {
        public InvalidRecertificationTransitionException(String reason) {
            super("재인증 요청 상태 전이가 올바르지 않습니다: " + reason, HttpStatus.BAD_REQUEST);
        }
    }
}
