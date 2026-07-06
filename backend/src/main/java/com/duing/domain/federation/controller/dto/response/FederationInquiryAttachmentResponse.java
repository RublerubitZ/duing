package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiryAttachment;

// 비밀성: storageKey·URL 필드는 절대 포함하지 않는다 — 원본 바이트는 인증 프록시 다운로드로만 접근한다.
public record FederationInquiryAttachmentResponse(Long id, String fileName, String contentType, Long fileSize) {
    public static FederationInquiryAttachmentResponse from(FederationInquiryAttachment attachment) {
        return new FederationInquiryAttachmentResponse(
                attachment.getId(), attachment.getFileName(), attachment.getContentType(), attachment.getFileSize());
    }
}
