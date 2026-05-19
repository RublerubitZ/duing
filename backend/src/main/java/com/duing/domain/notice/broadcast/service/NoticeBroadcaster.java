package com.duing.domain.notice.broadcast.service;

import com.duing.domain.notice.entity.Notice;
import java.util.List;

public interface NoticeBroadcaster {

    /**
     * 발행된 공지에 대해 visibility 별 fan-out 을 수행한다.
     * 발행 트랜잭션 내에서 호출되어야 하며 2000명 상한 초과 시 예외로 트랜잭션을 롤백한다.
     */
    void publish(Notice notice, List<Long> targetClubIds);
}
