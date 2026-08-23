package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.command.IssuePhoneVerificationCommand;
import com.duing.domain.user.service.dto.query.PasswordResetStartResult;
import com.duing.domain.user.service.dto.query.PhoneVerificationIssueResult;
import com.duing.domain.user.service.dto.query.PhoneVerificationStatusResult;

public interface PhoneVerificationService {

    /** MO 인증 세션 발급(번호당 1행 upsert) — 이미 가입된 번호 409, 60초 쿨다운 429. */
    PhoneVerificationIssueResult issue(IssuePhoneVerificationCommand issueCommand, String clientIp);

    /**
     * 비밀번호 재설정 인증 시작 — 학번으로 계정을 찾아 <b>등록된 번호로만</b> PASSWORD_RESET 세션을
     * 발급한다(번호를 입력받지 않는다, spec §10.2). 학번당 시간당 3회 제한.
     *
     * <p>미가입·탈퇴 학번도 학번에서 파생한 decoy 번호로 <b>실제 세션을 발급해</b> 계정 존재 여부와
     * 무관하게 같은 202 를 돌려준다 (계정 열거 평탄화, spec §7.6). 응답·쿨다운·폴링·리밋이 모두
     * 존재 계정과 동일하다.
     */
    PasswordResetStartResult startPasswordReset(String studentId, boolean includeQr, String clientIp);

    /**
     * 폴링용 상태 조회 — PENDING 이면 스로틀·쿼터 안에서 Octomo exists 를 poll-through 해
     * 인증을 확정한다. clientIp/userAgent 는 VERIFIED 감사 이벤트에 기록된다.
     */
    PhoneVerificationStatusResult getStatus(String verificationToken, String clientIp, String userAgent);
}
