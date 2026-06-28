package com.duing.domain.notice.service.dto.query;

import com.duing.domain.notice.entity.NoticeCategory;
import java.util.List;

public record NoticeSearchCondition(
        NoticeCategory category,
        List<String> tags,
        String keyword,
        NoticeSource source
) {}
