package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.service.dto.query.SuccessionAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface LeaderSuccessionRequestRepositoryCustom {
    Page<LeaderSuccessionRequest> searchForAdmin(SuccessionAdminSearchCondition condition, Pageable pageable);
}
