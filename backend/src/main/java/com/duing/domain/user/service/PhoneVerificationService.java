package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.command.IssuePhoneVerificationCommand;
import com.duing.domain.user.service.dto.query.PhoneVerificationIssueResult;
import com.duing.domain.user.service.dto.query.PhoneVerificationStatusResult;

public interface PhoneVerificationService {

    /** MO 인증 세션 발급(번호당 1행 upsert) — 이미 가입된 번호 409, 60초 쿨다운 429. */
    PhoneVerificationIssueResult issue(IssuePhoneVerificationCommand issueCommand, String clientIp);

    /**
     * 폴링용 상태 조회 — PENDING 이면 스로틀·쿼터 안에서 Octomo exists 를 poll-through 해
     * 인증을 확정한다. clientIp/userAgent 는 VERIFIED 감사 이벤트에 기록된다.
     */
    PhoneVerificationStatusResult getStatus(String verificationToken, String clientIp, String userAgent);
}
