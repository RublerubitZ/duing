package com.duing.domain.notice.broadcast.repository;

import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import java.util.List;

public interface NoticeBroadcastRepositoryCustom {

    List<BroadcastSlice> findSliceForUser(Long userId, int limit);

    long countUnreadForUser(Long userId);

    /** 보존정책 노출 기간 이내(now - RETENTION_DAYS 이후 생성)의 공지 개수. 목록 total 계산용. */
    long countWithinRetention();

    record BroadcastSlice(NoticeBroadcast broadcast, boolean isRead) {}
}
