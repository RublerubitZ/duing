package com.duing.domain.notice.repository;

import com.duing.domain.notice.entity.Notice;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NoticeRepository extends JpaRepository<Notice, Long>, NoticeRepositoryCustom {

    /** 주간 브리핑 — 기간에 쓴 총동연 공지(소유 동아리 없음). 감사 created_at(system regime), from 포함·to 미만. */
    long countByOwningClubIdIsNullAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(LocalDateTime from, LocalDateTime to);
}
