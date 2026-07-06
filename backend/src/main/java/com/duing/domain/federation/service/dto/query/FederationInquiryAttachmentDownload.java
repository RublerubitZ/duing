package com.duing.domain.federation.service.dto.query;

import com.duing.global.file.StoredFile;

// 인증 프록시 다운로드 응답 조립에 필요한 최소 정보 — fileName 은 Content-Disposition 표시용,
// file 은 스토리지에서 읽은 실제 스트림·Content-Type·Content-Length(StoredFile).
public record FederationInquiryAttachmentDownload(String fileName, StoredFile file) {
}
