package com.duing.domain.federation.service.dto.query;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryAnswer;

public record AdminFederationInquiryDetailQuery(
        FederationInquiry inquiry,
        FederationInquiryAnswer answer,
        String authorName,
        String authorStudentId
) {
}
