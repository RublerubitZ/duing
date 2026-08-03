package com.duing.domain.joincode.entity;

import com.duing.domain.club.entity.Club;
import com.duing.domain.joincode.exception.JoinRequestException;
import com.duing.domain.user.entity.User;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

/**
 * 가입 코드로 접수된 동아리 가입 요청 (V98).
 *
 * <p>승인 시 ClubMember 가 생성되며, APPROVED 행 자체가 "누가·언제·어떤 코드로 가입했는지"의
 * 감사 이력이다(별도 사용 이력 테이블 없음 — 스펙 3).
 *
 * <p>사용자당 동아리별 PENDING 은 부분 유니크 인덱스
 * {@code (club_id, user_id) WHERE status = 'PENDING' AND deleted_at IS NULL} 가 DB 레벨에서 1개로 묶는다.
 * REJECTED 이력이 있어도 재요청이 가능한 이유가 이 부분 조건이다.
 */
@Getter
@Entity
@Table(name = "club_join_request")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
// @Version 도입 후 Hibernate 가 두 번째 바인드 파라미터로 version 을 전달하므로
// WHERE 절에 version 조건을 명시한다. soft delete 도 OptimisticLock 적용 대상이 된다.
@SQLDelete(sql = "UPDATE club_join_request SET deleted_at = NOW() WHERE id = ? AND version = ?")
@SQLRestriction("deleted_at IS NULL")
public class ClubJoinRequest extends BaseEntity {

    /** 승인 시점 이미 다른 경로로 가입된 회원이라 자동 거절된 요청의 사유 (스펙 4.3). */
    private static final String ALREADY_MEMBER_REJECT_REASON = "이미 가입된 회원";

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_id", nullable = false)
    private Club club;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "join_code_id", nullable = false)
    private ClubJoinCode joinCode;

    /**
     * 요청 생성 시점 코드의 기수 스냅샷. 코드가 재생성돼 기수가 바뀌어도 승인은 이 값으로 이뤄진다
     * (스펙 3). 기수를 지정하지 않은 코드면 null.
     */
    @Column(name = "generation")
    private Integer generation;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private JoinRequestStatus status;

    /** 자동 거절 사유 기록용. 운영진 수동 거절은 null 로 둔다(스펙 3). */
    @Column(name = "reject_reason", length = 100)
    private String rejectReason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by")
    private User reviewedBy;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

    // 두 운영진이 동시에 동일 요청을 처리하면 후행 UPDATE 가 0 row affected →
    // ObjectOptimisticLockingFailureException 으로 차단된다. Hibernate 가 직접 채운다.
    @Version
    @Column(nullable = false)
    private Long version;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubJoinRequest(Club club, User user, ClubJoinCode joinCode, Integer generation) {
        this.club = club;
        this.user = user;
        this.joinCode = joinCode;
        this.generation = generation;
        this.status = JoinRequestStatus.PENDING;
    }

    public static ClubJoinRequest pending(Club club, User user, ClubJoinCode joinCode) {
        return ClubJoinRequest.builder()
                .club(club)
                .user(user)
                .joinCode(joinCode)
                .generation(joinCode.getGeneration())
                .build();
    }

    public void approve(User reviewer, LocalDateTime now) {
        process(JoinRequestStatus.APPROVED, reviewer, now, null);
    }

    public void reject(User reviewer, LocalDateTime now) {
        process(JoinRequestStatus.REJECTED, reviewer, now, null);
    }

    /** 승인 시점 이미 활성 회원이라 인원 차감 없이 거절 처리한다 (스펙 4.3 — PENDING 방치 금지). */
    public void rejectAutomatically(User reviewer, LocalDateTime now) {
        process(JoinRequestStatus.REJECTED, reviewer, now, ALREADY_MEMBER_REJECT_REASON);
    }

    public boolean isPending() {
        return status == JoinRequestStatus.PENDING;
    }

    /**
     * PENDING 에서만 종결 상태로 전이한다. 이미 처리된 요청의 재처리는 낙관적 잠금이 잡기 전에
     * 도메인에서 먼저 막아 이중 차감·거절 덮어쓰기를 원천 차단한다.
     */
    private void process(JoinRequestStatus processedStatus, User reviewer, LocalDateTime now,
                         String reason) {
        if (!isPending()) {
            throw new JoinRequestException.AlreadyProcessedException();
        }
        this.status = processedStatus;
        this.reviewedBy = reviewer;
        this.reviewedAt = now;
        this.rejectReason = reason;
    }
}
