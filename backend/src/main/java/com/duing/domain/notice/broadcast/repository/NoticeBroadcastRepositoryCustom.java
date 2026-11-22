package com.duing.domain.notice.broadcast.repository;

import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import java.util.List;

/** 모든 조회는 공지가 삭제 안 됨·PUBLIC·알림 발송일 때만 그 전체 알림을 본다(#1750) — 새 조회도 같은 조건을 쓴다. 읽음 처리의 {@code existsById}(JPA 상속)는 일부러 거르지 않는다(내용이 새지 않음). */
public interface NoticeBroadcastRepositoryCustom {

    List<BroadcastSlice> findSliceForUser(Long userId, int limit);

    long countUnreadForUser(Long userId);

    /** 보존정책 노출 기간 이내(now - RETENTION_DAYS 이후 생성)이고 공지가 삭제 안 됨·PUBLIC·알림 발송인 전체 알림 개수. 목록 total 계산용. */
    long countWithinRetention();

    record BroadcastSlice(NoticeBroadcast broadcast, boolean isRead) {}
}
