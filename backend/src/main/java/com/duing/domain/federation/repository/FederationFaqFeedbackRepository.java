package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationFaqFeedback;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FederationFaqFeedbackRepository
        extends JpaRepository<FederationFaqFeedback, Long>, FederationFaqFeedbackRepositoryCustom {

    Optional<FederationFaqFeedback> findByFaqIdAndUserId(Long faqId, Long userId);

    Optional<FederationFaqFeedback> findByFaqIdAndSessionKey(Long faqId, String sessionKey);
}
