package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationFaqCategory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FederationFaqCategoryRepository extends JpaRepository<FederationFaqCategory, Long> {

    List<FederationFaqCategory> findAllByOrderBySortOrderAscIdAsc();
}
