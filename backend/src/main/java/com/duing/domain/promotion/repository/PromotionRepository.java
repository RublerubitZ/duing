package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.Promotion;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PromotionRepository
        extends JpaRepository<Promotion, Long>, PromotionRepositoryCustom {

    List<Promotion> findAllByClubId(Long clubId);
}
