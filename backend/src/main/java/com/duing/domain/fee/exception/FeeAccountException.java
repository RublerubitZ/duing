package com.duing.domain.fee.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FeeAccountException extends ApplicationException {

    protected FeeAccountException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class FeeAccountNotFoundException extends FeeAccountException {
        private static final String MESSAGE = "등록된 회비 계좌가 없습니다.";

        public FeeAccountNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    /**
     * 저장된 암호문이 변조됐거나 키가 바뀌어 복호화에 실패한 경우(서버 측 데이터 무결성 문제).
     * 원인(cause)만 로깅 체계로 넘기고 평문·암호문·키는 메시지에 절대 싣지 않는다.
     */
    public static class AccountDecryptionFailedException extends FeeAccountException {
        private static final String MESSAGE = "회비 계좌 정보를 불러올 수 없습니다.";

        public AccountDecryptionFailedException(Throwable cause) {
            super(MESSAGE, HttpStatus.INTERNAL_SERVER_ERROR);
            initCause(cause); // 원인 스택은 보존하되, 메시지엔 평문·암호문·키를 절대 싣지 않는다.
        }
    }

    /**
     * 자동매칭이 사용 가능한(active && api_registered, 지원 은행) 계좌를 수정·재등록하려 한 경우.
     * 활성 중 은행·계좌번호가 바뀌면 이미 적재된 거래({@code bank_transaction.bank_code})와 귀속이 어긋나므로
     * 잠근다 — 변경하려면 자동매칭을 먼저 해제해야 한다. (외부 등록 개념이 사라진 뒤에도 이 가드는 유효하다.)
     */
    public static class BankMatchingActiveException extends FeeAccountException {
        private static final String MESSAGE =
                "자동매칭이 활성화된 계좌는 수정할 수 없습니다. 자동매칭 해제 후 다시 시도해 주세요.";

        public BankMatchingActiveException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /**
     * 계좌가 없는 동아리에 두 요청이 동시에 첫 등록을 시도해 한쪽이 {@code uk_fee_account_club} 에 걸린 경우.
     * 등록은 멱등 PUT 이라 사전 검증으로 걸러낼 중복이 없으므로, 이 예외는 <em>경합 전용</em>이다 —
     * 사전 검증 실패(권한·자동매칭 잠금)와 달리 재시도하면 갱신 경로로 정상 처리된다.
     */
    public static class ConcurrentRegistrationException extends FeeAccountException {
        private static final String MESSAGE =
                "다른 운영진이 먼저 회비 계좌를 등록했습니다. 새로고침 후 다시 시도해주세요.";

        public ConcurrentRegistrationException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
}
