package com.duing.domain.federation.repository;

/**
 * Native query 결과를 바인딩하는 Spring Data interface projection.
 * {@link FederationInquiryAttachmentRepository#findPurgeTargets} 에서 사용한다 (DeadlineRow 전례).
 */
public interface FederationInquiryAttachmentPurgeTarget {

    Long getId();

    String getStorageKey();
}
