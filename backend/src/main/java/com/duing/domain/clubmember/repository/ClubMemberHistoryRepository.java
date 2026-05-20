package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.entity.ClubMemberHistory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClubMemberHistoryRepository extends JpaRepository<ClubMemberHistory, Long> {

    Page<ClubMemberHistory> findByClubIdOrderByCreatedAtDesc(Long clubId, Pageable pageable);
}
