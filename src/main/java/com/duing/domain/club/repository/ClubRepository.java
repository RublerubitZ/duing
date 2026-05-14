package com.duing.domain.club.repository;

import com.duing.domain.club.entity.Club;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClubRepository extends JpaRepository<Club, Long>, ClubRepositoryCustom {

    boolean existsByName(String name);
}
