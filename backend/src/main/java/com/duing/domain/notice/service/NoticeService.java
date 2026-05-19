package com.duing.domain.notice.service;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.service.dto.command.CreateNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateNoticeCommand;
import com.duing.domain.notice.service.dto.query.NoticeAdminSearchCondition;
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

    Page<Notice> searchForAdmin(NoticeAdminSearchCondition condition, Pageable pageable);
}
