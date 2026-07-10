package com.duing.domain.user.entity;

import java.time.Duration;

/**
 * MO 인증 세션의 용도 — 인증 후 완료(소비)까지의 유효 시간이 용도별로 다르다 (spec §5.1).
 * SIGNUP 은 남은 가입 폼 작성 시간을 넉넉히, 그 외는 짧게 둔다.
 * PHONE_CHANGE·PASSWORD_RESET 플로우는 PR4 에서 구현되며 여기서는 값만 정의한다.
 */
public enum VerificationPurpose {
    SIGNUP(Duration.ofMinutes(30)),
    PHONE_CHANGE(Duration.ofMinutes(10)),
    PASSWORD_RESET(Duration.ofMinutes(10));

    private final Duration completionValidity;

    VerificationPurpose(Duration completionValidity) {
        this.completionValidity = completionValidity;
    }

    public Duration completionValidity() {
        return completionValidity;
    }
}
