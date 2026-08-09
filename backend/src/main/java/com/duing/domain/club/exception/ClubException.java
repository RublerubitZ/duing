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

    /** 찜 필터는 "요청 사용자의 찜"이 기준 — 비로그인은 기준 자체가 없어 빈 목록(200)이 아니라 401 로 구분한다. */
    public static class FavoriteFilterLoginRequiredException extends ClubException {
        private static final String MESSAGE = "찜한 동아리 필터는 로그인이 필요합니다.";

        public FavoriteFilterLoginRequiredException() {
            super(MESSAGE, HttpStatus.UNAUTHORIZED);
        }
    }

    /** 단과대 동아리(centralClub=false) 는 소속 단과대학이 필수 — 비우기 요청을 거부한다. */
    public static class CollegeRequiredException extends ClubException {
        private static final String MESSAGE = "단과대 동아리는 소속 단과대학이 필요합니다.";

        public CollegeRequiredException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class ClubNotClosableException extends ClubException {
        public ClubNotClosableException(String currentStatus) {
            super("운영 중단(INACTIVE) 또는 거절(REJECTED) 상태의 동아리만 폐쇄할 수 있습니다. 현재 상태: " + currentStatus,
                    HttpStatus.BAD_REQUEST);
        }
    }

}
