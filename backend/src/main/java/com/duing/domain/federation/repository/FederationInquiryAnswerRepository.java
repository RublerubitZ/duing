package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationInquiryAnswer;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FederationInquiryAnswerRepository extends JpaRepository<FederationInquiryAnswer, Long> {

    Optional<FederationInquiryAnswer> findByInquiryId(Long inquiryId);
}
