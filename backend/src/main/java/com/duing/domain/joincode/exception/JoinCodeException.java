package com.duing.domain.joincode.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class JoinCodeException extends ApplicationException {

    protected JoinCodeException(String message, HttpStatus status) {
        super(message, status);
    }

    /** 미존재·타 동아리 코드를 하나로 묶어 존재 여부 열거를 막는다(IDOR 차단). */
    public static final class JoinCodeNotFoundException extends JoinCodeException {
        private static final String MESSAGE = "유효하지 않은 가입 링크입니다.";

        public JoinCodeNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    /** 모집당 활성 코드 1개 제약(partial unique)에 동시 재생성이 걸린 경우 — 재시도로 해소된다. */
    public static final class ConcurrentJoinCodeOperationException extends JoinCodeException {
        private static final String MESSAGE =
                "다른 운영진이 먼저 가입 링크를 변경했습니다. 새로고침 후 다시 시도해주세요.";

        public ConcurrentJoinCodeOperationException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /** 자체 폼(SELF) 모집에는 가입 코드 개념이 없다 — 지원서·합격 처리가 두잉 안에서 끝난다. */
    public static final class ExternalRecruitmentRequiredException extends JoinCodeException {
        private static final String MESSAGE = "외부 폼 모집에서만 가입 링크를 사용할 수 있습니다.";

        public ExternalRecruitmentRequiredException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /**
     * 진행 중(OPEN) 모집에서만 발급한다(스펙 v2 4.2) — "모집 생성 → 즉시 마감 → 코드만 발급" 식의
     * 정책 우회를 막는다. 외부 폼 모집의 회원 등록은 모집 기간 안에서 이뤄진다.
     */
    public static final class OpenRecruitmentRequiredException extends JoinCodeException {
        private static final String MESSAGE = "모집이 진행 중일 때만 가입 링크를 만들 수 있습니다.";

        public OpenRecruitmentRequiredException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static final class InvalidJoinWindowDaysException extends JoinCodeException {
        private static final String MESSAGE =
                "가입 가능 기간은 모집 종료일까지, 종료 후 7일, 종료 후 14일 중 하나여야 합니다.";

        public InvalidJoinWindowDaysException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    /** 부원 초대 링크의 유효기간은 2택 프리셋이다(스펙 §3) — 장기 링크 방치를 막는다. */
    public static final class InvalidInviteExpiresInHoursException extends JoinCodeException {
        private static final String MESSAGE = "초대 링크 유효기간은 24시간 또는 72시간이어야 합니다.";

        public InvalidInviteExpiresInHoursException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }
}
