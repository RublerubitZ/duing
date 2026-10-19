package com.duing.domain.user.profilecheck.repository;

import com.duing.domain.user.profilecheck.entity.ProfileCheckConfirmation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProfileCheckConfirmationRepository extends JpaRepository<ProfileCheckConfirmation, Long> {
}
