package com.duing.domain.notice.broadcast.repository;

import com.duing.domain.notice.broadcast.entity.NoticeBroadcastRead;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NoticeBroadcastReadRepository
        extends JpaRepository<NoticeBroadcastRead, NoticeBroadcastRead.NoticeBroadcastReadId> {

    boolean existsByIdBroadcastIdAndIdUserId(Long broadcastId, Long userId);

    /**
     * '모두 읽음'(#1765) — 그 사용자에게 지금 보이는 전체 알림의 읽음 행을 한 문장으로 만든다. 반환 = 실제 INSERT 된 행 수.
     *
     * <p>'보이는' 조건은 {@code NoticeBroadcastRepositoryImpl#broadcastableNotice()} + NoticeBroadcast 의 @SQLRestriction
     * + 노출 경계와 같아야 한다 — 네이티브라 자동으로 붙는 조건이 없어 모두 적는다. 한쪽을 바꾸면 함께 바꾼다
     * (NoticeBroadcastReadRepositoryTest 가 묶는다). 숨겨진 전체 알림은 읽음이 되지 않는다.
     *
     * <p>{@code visibilityFloor} 는 {@code NotificationRetention#visibilityFloor(clock)} 로 넘긴다(created_at 은 system regime).
     * read_at 은 생략해 DB 기본값(NOW())을 쓴다. ON CONFLICT 로 이미 읽은 행·동시 읽음을 건너뛰고, ORDER BY 로 같은 사용자의
     * 동시 '모두 읽음'끼리 잠금 순서를 맞춘다. 부른 트랜잭션에 참여한다 — 개인 알림 읽음과 함께 커밋·롤백된다.
     */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            INSERT INTO notice_broadcast_read (broadcast_id, user_id)
            SELECT nb.id, :userId
              FROM notice_broadcast nb
              JOIN notice n ON n.id = nb.notice_id
             WHERE nb.deleted_at IS NULL
               AND nb.created_at >= :visibilityFloor
               AND n.deleted_at IS NULL
               AND n.visibility = 'PUBLIC'
               AND n.notify_on_publish = TRUE
             ORDER BY nb.id
            ON CONFLICT (broadcast_id, user_id) DO NOTHING
            """, nativeQuery = true)
    int bulkInsertVisibleBroadcastReads(@Param("userId") Long userId,
                                        @Param("visibilityFloor") LocalDateTime visibilityFloor);
}
