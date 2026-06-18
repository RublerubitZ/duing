package com.duing.domain.cashbook.repository;

import com.duing.domain.cashbook.entity.CashbookEntry;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CashbookEntryRepository extends JpaRepository<CashbookEntry, Long>, CashbookEntryRepositoryCustom {
    Optional<CashbookEntry> findByIdAndClubId(Long id, Long clubId);
}
