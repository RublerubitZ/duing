package com.duing.domain.notice.service;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.service.dto.command.CreateNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateNoticeCommand;
import com.duing.domain.notice.service.dto.query.NoticeAdminSearchCondition;
import com.duing.domain.notice.service.dto.query.NoticeAdminSummaryQuery;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface NoticeService {

    Long create(CreateNoticeCommand command);

    void update(UpdateNoticeCommand command);

    void delete(Long noticeId);

    Notice getVisible(Long noticeId, ViewerScope viewer);

    Page<Notice> searchFeed(NoticeSearchCondition condition, ViewerScope viewer, Pageable pageable);

    /** 어드민 공지 목록 — Notice 엔티티 노출 없이 평탄화된 Query DTO 페이지를 반환한다. */
    Page<NoticeAdminSummaryQuery> listForAdmin(NoticeAdminSearchCondition condition, Pageable pageable);
}
