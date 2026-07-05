package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationFaqCategory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface FederationFaqCategoryRepository extends JpaRepository<FederationFaqCategory, Long> {

    List<FederationFaqCategory> findAllByOrderBySortOrderAscIdAsc();

    boolean existsByName(String name);

    @Query("select coalesce(max(category.sortOrder), -1) from FederationFaqCategory category where category.deletedAt is null")
    int findMaxSortOrder();
}
