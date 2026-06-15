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

    /** 회원 페이지용 — 본 클럽의 CLUB_SCOPED+ALL_MEMBERS 활성 공지를 pinned·createdAt 순으로 페이지 반환. */
    Page<Notice> findClubScopedForMember(Long clubId, Pageable pageable);
}
