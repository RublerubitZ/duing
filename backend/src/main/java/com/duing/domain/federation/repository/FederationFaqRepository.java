package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationFaq;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FederationFaqRepository extends JpaRepository<FederationFaq, Long>, FederationFaqRepositoryCustom {
}
