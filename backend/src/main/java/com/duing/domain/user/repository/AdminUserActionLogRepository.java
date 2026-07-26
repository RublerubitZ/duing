package com.duing.domain.user.repository;

import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.AdminUserActionLog;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AdminUserActionLogRepository extends JpaRepository<AdminUserActionLog, Long> {

    /**
     * 회원 상세의 "최근 운영 기록". append-only 라 id 가 단조 증가하므로 created_at 이 아니라 id 로 정렬한다.
     * PHONE_VIEW(개인정보 열람)는 감사 대상이지 운영 조치가 아니라서 제외한다 — 섞으면 정지·해제가 묻힌다.
     */
    @Query("""
            SELECT log FROM AdminUserActionLog log
            WHERE log.targetUserId = :targetUserId AND log.action <> :excluded
            ORDER BY log.id DESC
            """)
    List<AdminUserActionLog> findRecentByTargetUserId(@Param("targetUserId") Long targetUserId,
                                                      @Param("excluded") AdminUserAction excluded,
                                                      Pageable pageable);

    /** 관리자 메모의 최종 수정 시각·작업자를 파생하기 위한 최신 1건. 기록이 없으면 empty(= 아직 저장한 적 없음). */
    Optional<AdminUserActionLog> findTopByTargetUserIdAndActionOrderByIdDesc(Long targetUserId,
                                                                            AdminUserAction action);
}
