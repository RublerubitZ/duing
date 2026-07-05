package com.duing.domain.federation.service.dto.query;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryAnswer;

public record FederationInquiryDetailQuery(FederationInquiry inquiry, FederationInquiryAnswer answer) {
}
