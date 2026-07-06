package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationInquiryAttachment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FederationInquiryAttachmentRepository extends JpaRepository<FederationInquiryAttachment, Long> {

    List<FederationInquiryAttachment> findAllByInquiryIdOrderBySortOrderAsc(Long inquiryId);
}
