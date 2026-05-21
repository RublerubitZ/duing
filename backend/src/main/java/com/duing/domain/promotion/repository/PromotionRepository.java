package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.Promotion;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PromotionRepository
        extends JpaRepository<Promotion, Long>, PromotionRepositoryCustom {
}
