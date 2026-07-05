package com.duing.domain.federation.service.dto.query;

import com.duing.domain.federation.entity.FederationInquiry;

public record AdminFederationInquiryRow(FederationInquiry inquiry, String authorName, String authorStudentId) {
}
