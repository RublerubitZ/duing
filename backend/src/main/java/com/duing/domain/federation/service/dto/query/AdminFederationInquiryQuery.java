package com.duing.domain.federation.service.dto.query;

import com.duing.domain.federation.entity.FederationInquiry;

public record AdminFederationInquiryQuery(FederationInquiry inquiry, String authorName, String authorStudentId) {
}
