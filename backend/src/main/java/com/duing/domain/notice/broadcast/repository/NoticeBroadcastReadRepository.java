package com.duing.domain.notice.broadcast.repository;

import com.duing.domain.notice.broadcast.entity.NoticeBroadcastRead;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NoticeBroadcastReadRepository
        extends JpaRepository<NoticeBroadcastRead, NoticeBroadcastRead.NoticeBroadcastReadId> {

    boolean existsByIdBroadcastIdAndIdUserId(Long broadcastId, Long userId);
}
