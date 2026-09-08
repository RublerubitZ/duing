package com.duing.domain.clubaudit.service;

import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.service.dto.query.AdminClubActivityEventRow;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface AdminClubActivityQueryService {

    /**
     * 동아리 활동 이력(상태 전이·폐쇄·가입 링크 3종) 최신순.
     * {@code types} 미지정 → 허용 5종 전체, 지정 → 허용 집합과 교집합, 전부 허용 밖 → 빈 페이지.
     */
    Page<AdminClubActivityEventRow> getActivityEvents(Long clubId, List<ClubAuditEventType> types, Pageable pageable);
}
