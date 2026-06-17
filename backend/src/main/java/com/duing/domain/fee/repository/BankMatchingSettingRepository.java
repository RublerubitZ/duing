package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.BankMatchingSetting;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BankMatchingSettingRepository extends JpaRepository<BankMatchingSetting, Long> {

    Optional<BankMatchingSetting> findByClubId(Long clubId);
}
