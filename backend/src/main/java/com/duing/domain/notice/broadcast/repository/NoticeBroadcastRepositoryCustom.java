package com.duing.domain.notice.broadcast.repository;

import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import java.util.List;

public interface NoticeBroadcastRepositoryCustom {

    List<BroadcastSlice> findSliceForUser(Long userId, int limit);

    long countUnreadForUser(Long userId);

    record BroadcastSlice(NoticeBroadcast broadcast, boolean isRead) {}
}
