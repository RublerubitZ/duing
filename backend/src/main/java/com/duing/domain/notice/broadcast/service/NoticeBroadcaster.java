package com.duing.domain.notice.broadcast.service;

import com.duing.domain.notice.entity.Notice;
import java.util.List;

public interface NoticeBroadcaster {

    /**
     * 발행된 공지에 대해 visibility 별 fan-out 을 수행한다.
     * 발행 트랜잭션 내에서 호출되어야 하며 2000명 상한 초과 시 예외로 트랜잭션을 롤백한다.
     */
    void publish(Notice notice, List<Long> targetClubIds);

    /**
     * 지운 공지가 발송 때 만든 개인 알림(NOTICE_TARGETED)을 받은 사람 모두에게서 지운다(읽음 여부 무관).
     * 삭제 트랜잭션 내에서 호출되어야 한다. 전체 알림(notice_broadcast) 행은 남긴다 — 조회 조건이 지운 공지를 숨긴다(#1750).
     */
    void retract(Long noticeId);
}
