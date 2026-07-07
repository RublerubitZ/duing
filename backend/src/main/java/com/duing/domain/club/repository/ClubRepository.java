package com.duing.domain.club.repository;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClubRepository extends JpaRepository<Club, Long>, ClubRepositoryCustom {

    boolean existsByName(String name);

    boolean existsByIdAndStatus(Long id, ClubStatus status);
}
