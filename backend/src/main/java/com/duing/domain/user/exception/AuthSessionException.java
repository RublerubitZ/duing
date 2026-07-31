package com.duing.domain.user.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

/**
 * 세션 인증 실패 계층 — 이 클래스의 모든 서브타입은 "복구 불가한 세션 종료(401)"를 뜻한다.
 * {@code AuthController.webRefresh} 가 부모 타입으로 catch 해 인증 쿠키 3종을 삭제하므로,
 * 레이트리밋처럼 재시도로 회복되는 비종결 실패를 서브타입으로 추가하면 스로틀이 곧 강제 로그아웃이 된다 —
 * 그런 실패는 이 계층이 아니라 별도 예외 계층으로 만든다.
 */
public class AuthSessionException extends ApplicationException {

    protected AuthSessionException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    /**
     * 재사용 탐지를 제외한 모든 refresh 실패는 사유 불문 단일 401 — 미존재·만료·폐기 세션을
     * 구분해 주지 않는다(유효/무효 토큰 오라클 차단). 상세 사유는 auth_event·Sentry 로만 남긴다.
     */
    public static class SessionExpiredException extends AuthSessionException {
        private static final String MESSAGE = "로그인이 만료되었습니다. 다시 로그인해주세요.";

        public SessionExpiredException() {
            super(MESSAGE, HttpStatus.UNAUTHORIZED, "AUTH_SESSION_EXPIRED");
        }
    }

    /**
     * 폐기·회전 완료된 리프레시 토큰의 재제시(Replay/탈취) 탐지 — 패밀리(세션) 폐기와 함께
     * 별도 코드로 응답한다. 노출되는 정보는 "이 토큰이 한때 유효했고 이미 회전됐다"뿐이다.
     * 탐지가 세션을 폐기하므로 이 코드는 패밀리당 최초 1회이고, 이후 재제시는 세션 사용 가능
     * 검사에서 걸려 AUTH_SESSION_EXPIRED 로 떨어진다.
     */
    public static class RefreshTokenReusedException extends AuthSessionException {
        private static final String MESSAGE = "이미 사용된 리프레시 토큰입니다. 다시 로그인해주세요.";

        public RefreshTokenReusedException() {
            super(MESSAGE, HttpStatus.UNAUTHORIZED, "REFRESH_TOKEN_REUSED");
        }
    }
}
