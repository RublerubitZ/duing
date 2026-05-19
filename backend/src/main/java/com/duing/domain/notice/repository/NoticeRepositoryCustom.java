package com.duing.domain.notice.repository;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.service.dto.query.NoticeAdminSearchCondition;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface NoticeRepositoryCustom {

    Page<Notice> findFeed(NoticeSearchCondition condition, ViewerScope viewer, Pageable pageable);

    Optional<Notice> findVisibleById(Long noticeId, ViewerScope viewer);

    Page<Notice> findAdminList(NoticeAdminSearchCondition condition, Pageable pageable);
}
