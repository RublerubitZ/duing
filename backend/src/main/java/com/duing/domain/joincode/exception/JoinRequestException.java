package com.duing.domain.joincode.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class JoinRequestException extends ApplicationException {

    protected JoinRequestException(String message, HttpStatus status) {
        super(message, status);
    }

    /** 미존재·타 동아리 요청을 하나로 묶어 존재 여부 열거를 막는다(JoinCodeNotFoundException 전례). */
    public static final class JoinRequestNotFoundException extends JoinRequestException {
        private static final String MESSAGE = "가입 요청을 찾을 수 없습니다.";

        public JoinRequestNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    /** 두 운영진이 같은 요청을 동시에 처리한 경우 — 뒤늦은 처리를 거부한다(스펙 4.3). */
    public static final class AlreadyProcessedException extends JoinRequestException {
        private static final String MESSAGE = "이미 처리된 가입 요청입니다.";

        public AlreadyProcessedException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /**
     * 같은 요청에 대한 동시 처리를 낙관적 잠금(@Version)이 잡아낸 경우 — 상태 검사(TOCTOU)를 통과한
     * 뒤 다른 운영진이 먼저 커밋했음을 뜻한다.
     */
    public static final class ConcurrentDecisionException extends JoinRequestException {
        private static final String MESSAGE = "동시에 처리된 요청입니다. 새로고침 후 다시 확인해 주세요.";

        public ConcurrentDecisionException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static final class AlreadyMemberException extends JoinRequestException {
        private static final String MESSAGE = "이미 가입된 동아리입니다.";

        public AlreadyMemberException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static final class DuplicatePendingRequestException extends JoinRequestException {
        private static final String MESSAGE = "이미 가입 요청이 접수되어 있습니다.";

        public DuplicatePendingRequestException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /**
     * 만료·폐기·소진·귀속 모집 마감·비 ACTIVE 동아리를 하나로 묶는다 — 학생에게 사유를 구분해
     * 알리지 않는다(스펙 6 "사유 구분 없는 단일 안내").
     */
    public static final class UnusableJoinCodeException extends JoinRequestException {
        private static final String MESSAGE = "사용할 수 없는 가입 코드입니다.";

        public UnusableJoinCodeException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /** 코드 확인·요청 생성의 IP 레이트리밋 초과 — 코드 열거·스팸 요청 방지(스펙 4.5). */
    public static final class JoinCodeRateLimitedException extends JoinRequestException {
        private static final String MESSAGE = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";

        public JoinCodeRateLimitedException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
        }
    }
}
