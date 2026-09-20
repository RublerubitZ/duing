package com.duing.global.privacy;

import jakarta.validation.constraints.NotNull;
import java.time.Period;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * PII 보관기간 파기 잡 설정.
 *
 * <p>{@code enabled} 기본 비활성 — 법무/내부 방침으로 보관기간을 확정한 뒤 운영에서 켠다. 보관기간은 {@link Period}
 * (예: {@code P45D}, {@code P6M})로 환경변수 주입하며, 코드에 하드코딩하지 않는다.
 *
 * <ul>
 *   <li>{@code window} — 회원 탈퇴(soft-delete) 후 PII 보관기간. 사용자 비식별화, soft-delete 지원서 답변 비우기,
 *       탈퇴 회원의 지원서 자유서술 답변·미제출 초안 파기, MO 인증 감사 이벤트 삭제에 쓴다.</li>
 *   <li>{@code applicationAnswerWindow} — 모집 마감({@code LEAST(closed_at::date, end_date)}) 후 지원서 자유서술
 *       답변·미제출 초안 보관기간. 개인정보 처리방침 3조 "모집 종료 후 6개월" 과 일치시킨다.</li>
 * </ul>
 */
@Validated
@ConfigurationProperties(prefix = "duing.privacy.retention")
public record RetentionProperties(boolean enabled,
                                  @NotNull Period window,
                                  @NotNull Period applicationAnswerWindow) {
}
