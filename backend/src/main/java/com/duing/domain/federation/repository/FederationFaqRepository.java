package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationFaq;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface FederationFaqRepository extends JpaRepository<FederationFaq, Long>, FederationFaqRepositoryCustom {

    // 신규 FAQ는 맨 뒤 배치 — soft delete 제외 최대 정렬값
    @Query("select coalesce(max(faq.sortOrder), -1) from FederationFaq faq where faq.deletedAt is null")
    int findMaxSortOrder();
}
