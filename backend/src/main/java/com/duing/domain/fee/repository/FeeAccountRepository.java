package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.FeeAccount;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FeeAccountRepository extends JpaRepository<FeeAccount, Long> {
    Optional<FeeAccount> findByClubId(Long clubId);
    boolean existsByClubId(Long clubId);
}
