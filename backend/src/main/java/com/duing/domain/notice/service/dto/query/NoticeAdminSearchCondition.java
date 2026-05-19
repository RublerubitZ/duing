package com.duing.domain.notice.service.dto.query;

import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeVisibility;

public record NoticeAdminSearchCondition(
        NoticeCategory category,
        NoticeVisibility visibility,
        String keyword,
        boolean includeExpired
) {}
