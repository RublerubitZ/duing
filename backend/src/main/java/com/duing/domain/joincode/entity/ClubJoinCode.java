package com.duing.domain.joincode.entity;

import com.duing.domain.club.entity.Club;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

/**
 * 외부 폼(EXTERNAL) 모집 합격자 등록용 가입 코드 (V97).
 *
 * <p>동아리당 활성 코드는 1개이며, 부분 유니크 인덱스
 * {@code (club_id) WHERE revoked_at IS NULL AND deleted_at IS NULL} 가 이를 DB 레벨에서 보장한다.
 * 폐기(revoked_at)·만료 행도 감사 이력으로 보존하므로 코드 행은 실제로 soft-delete 하지 않는다 —
 * code 전역 unique 와 중복 검사(existsByCode)가 이 전제에 의존한다.
 *
 * <p>expiresAt 은 seoulClock 벽시계(KST)로 기록한다 — 응답 경계에서는
 * {@code TimeMapper.seoulWallClockToInstant} 로 변환한다(TIMEZONE.md).
 */
@Getter
@Entity
@Table(name = "club_join_code")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE club_join_code SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ClubJoinCode extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_id", nullable = false)
    private Club club;

    /** 코드가 귀속된 외부 폼(EXTERNAL) 모집. 이 모집이 마감되면 코드는 파생적으로 사용 불가가 된다. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recruitment_id", nullable = false)
    private Recruitment recruitment;

    @Column(nullable = false, length = 6)
    private String code;

    /** 코드로 가입하는 회원의 기수(선택). 미지정 시 null. */
    @Column(name = "generation")
    private Integer generation;

    @Column(name = "max_uses", nullable = false)
    private int maxUses;

    @Column(name = "used_count", nullable = false)
    private int usedCount;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /** 운영진 수동 폐기 시각. 모집 마감은 여기에 기록하지 않는다(파생 판정). */
    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubJoinCode(Club club, Recruitment recruitment, String code, Integer generation,
                         int maxUses, LocalDateTime expiresAt) {
        this.club = club;
        this.recruitment = recruitment;
        this.code = code;
        this.generation = generation;
        this.maxUses = maxUses;
        this.usedCount = 0;
        this.expiresAt = expiresAt;
    }

    public static ClubJoinCode issue(Club club, Recruitment recruitment, String code,
                                     Integer generation, int maxUses, LocalDateTime expiresAt) {
        return ClubJoinCode.builder()
                .club(club)
                .recruitment(recruitment)
                .code(code)
                .generation(generation)
                .maxUses(maxUses)
                .expiresAt(expiresAt)
                .build();
    }

    public void revoke(LocalDateTime now) {
        this.revokedAt = now;
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    public boolean isExpired(LocalDateTime now) {
        return now.isAfter(expiresAt);
    }

    public boolean isExhausted() {
        return usedCount >= maxUses;
    }

    /**
     * 신규 가입 요청을 받을 수 있는 코드인지 판정한다.
     *
     * <p>모집 마감(CLOSED)은 파생적으로 사용 불가 — 마감 경로(수동·자동)마다 폐기 훅을 심지 않는다(스펙 4.1).
     * recruitment 는 LAZY 이므로 트랜잭션 안에서 호출해야 한다.
     */
    public boolean isUsable(LocalDateTime now) {
        return !isRevoked() && !isExpired(now) && !isExhausted()
                && recruitment.getStatus() == RecruitmentStatus.OPEN;
    }

    /** 잠금 하에서 호출한다(findWithLockByCode). 잔여가 없으면 false. */
    public boolean tryConsume() {
        if (isExhausted()) {
            return false;
        }
        this.usedCount++;
        return true;
    }

    /**
     * 거절로 비워진 자리를 되돌린다(스펙 4.3 환급). 잠금 하에서 호출한다(findWithLockById).
     *
     * <p>0 하한을 두어 이미 환급된 요청이 다시 거절 경로를 타더라도 used_count 가 음수로
     * 내려가지 않게 한다(DB CHECK used_count >= 0 위반 방지).
     */
    public void releaseUse() {
        if (usedCount > 0) {
            this.usedCount--;
        }
    }
}
