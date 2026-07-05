package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiryAnswer;
import java.time.LocalDateTime;

// answeredBy(관리자 개인)는 학생·관리자 응답 모두 미노출 — 표기는 FE 에서 "총동아리연합회" 고정(스펙 §5).
public record FederationInquiryAnswerResponse(
        String content, LocalDateTime answeredAt, LocalDateTime updatedAt
) {
    public static FederationInquiryAnswerResponse from(FederationInquiryAnswer answer) {
        return answer == null ? null : new FederationInquiryAnswerResponse(
                answer.getContent(), answer.getCreatedAt(), answer.getUpdatedAt());
    }
}
