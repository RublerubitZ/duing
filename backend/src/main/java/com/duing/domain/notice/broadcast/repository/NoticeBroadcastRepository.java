package com.duing.domain.notice.broadcast.repository;

import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NoticeBroadcastRepository
        extends JpaRepository<NoticeBroadcast, Long>, NoticeBroadcastRepositoryCustom {
}
