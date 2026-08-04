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
 * 외부 폼(EXTERNAL) 모집 합격자 등록용 가입 링크 (V97, 귀속 전환 V99, 가입 가능 기간 V101).
 *
 * <p>모집당 활성 코드는 1개이며, 부분 유니크 인덱스
 * {@code (recruitment_id) WHERE revoked_at IS NULL AND deleted_at IS NULL} 가 이를 DB 레벨에서 보장한다.
 * 폐기(revoked_at)·기간 만료 행도 감사 이력으로 보존하므로 코드 행은 실제로 soft-delete 하지 않는다 —
 * code 전역 unique 와 중복 검사(existsByCode)가 이 전제에 의존한다.
 *
 * <p>사용 가능 기간은 절대 만료일이 아니라 모집 종료 시각({@code recruitment.closedAt}) + 프리셋으로
 * 파생한다(스펙 v2 4.3). 종료 시각은 seoulClock 벽시계(KST)라 응답 경계에서
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

    /** 코드가 귀속된 외부 폼(EXTERNAL) 모집. 활성 코드 1개 제약의 단위이며 코드의 소유 주체다. */
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

    /**
     * 가입 가능 기간 프리셋 — 모집 종료 시각 기준 0(종료일까지)/7/14일 (스펙 v2 4.3).
     * 절대 만료일이 아니라 모집 종료로부터의 상대 기간이라, 조기 종료·기간 연장·상시모집을 한 규칙으로 덮는다.
     */
    @Column(name = "join_window_days", nullable = false)
    private short joinWindowDays;

    /** 폐기 시각 — 운영진 수동 폐기와 귀속 모집 삭제(스펙 v2 4.2) 두 경로가 기록한다. */
    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    /**
     * 발급 주체(V100). 재생성은 폐기 + 신규 행이므로 행마다 발급자가 남는다.
     * 감사 조회 UI 는 후속이라 연관관계 대신 사용자 id 만 들고 있는다(FacilityBooking.decidedById 전례).
     */
    @Column(name = "created_by")
    private Long createdById;

    /** 폐기 주체(V100) — 수동 폐기·재생성의 자동 폐기·모집 삭제(삭제 수행자) 세 경로가 기록한다. */
    @Column(name = "revoked_by")
    private Long revokedById;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubJoinCode(Club club, Recruitment recruitment, String code, Integer generation,
                         int maxUses, int joinWindowDays, Long createdById) {
        this.club = club;
        this.recruitment = recruitment;
        this.code = code;
        this.generation = generation;
        this.maxUses = maxUses;
        this.usedCount = 0;
        // 프리셋(0/7/14)만 들어오므로 SMALLINT 컬럼 폭으로 좁혀도 손실이 없다. 허용값 검증은 커맨드가 한다.
        this.joinWindowDays = (short) joinWindowDays;
        this.createdById = createdById;
    }

    public static ClubJoinCode issue(Club club, Recruitment recruitment, String code,
                                     Integer generation, int maxUses, int joinWindowDays,
                                     Long createdById) {
        return ClubJoinCode.builder()
                .club(club)
                .recruitment(recruitment)
                .code(code)
                .generation(generation)
                .maxUses(maxUses)
                .joinWindowDays(joinWindowDays)
                .createdById(createdById)
                .build();
    }

    public void revoke(LocalDateTime now, Long revokedById) {
        this.revokedAt = now;
        this.revokedById = revokedById;
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    public boolean isExhausted() {
        return usedCount >= maxUses;
    }

    /**
     * 가입 가능 기한 = 실제 종료 시각 + 프리셋(스펙 v2 4.3). 모집이 진행 중이거나 종료 스탬프가 없으면
     * 기한이 정해지지 않아 null 이다 — 운영 화면은 이 값이 없을 때 "모집 종료 후 N일까지"로 안내한다.
     */
    public LocalDateTime getJoinExpiresAt() {
        if (recruitment.getStatus() == RecruitmentStatus.OPEN || recruitment.getClosedAt() == null) {
            return null;
        }
        return recruitment.getClosedAt().plusDays(joinWindowDays);
    }

    /**
     * 신규 가입 요청을 받을 수 있는 코드인지 판정한다 — 미폐기·미소진 + 가입 가능 기간 안(스펙 v2 4.3).
     *
     * <p>기간은 모집 상태에서 파생된다: OPEN 이면 계속 유효하고(상시모집·기간 연장도 자연히 커버),
     * 종료 뒤에는 실제 종료 시각 + 프리셋까지만 유효하다. 설정 마감일(endDate)이 지나도 운영진이
     * 마감하지 않았다면 링크는 계속 유효하다 — 상시 운영과 실질이 같고, 신규 <b>발급</b>만
     * {@code isEffectivelyOpen} 으로 따로 막는다(의도된 비대칭).
     *
     * <p>CLOSED 인데 종료 스탬프가 없는 비정상 데이터는 사용 불가로 본다(fail-closed).
     * 이미 접수된 요청의 승인·거절은 이 판정을 쓰지 않으므로 기간이 지나도 계속 처리할 수 있다.
     *
     * <p>모집 조건을 뒤에 두는 이유: recruitment 는 LAZY 이고 삭제된 모집은 조회되지 않으므로,
     * 삭제와 함께 폐기된 코드는 앞의 {@code isRevoked()} 에서 단축 평가돼 프록시 초기화를 피한다.
     * 트랜잭션 안에서 호출해야 한다.
     */
    public boolean isUsable(LocalDateTime now) {
        if (isRevoked() || isExhausted()) {
            return false;
        }
        if (recruitment.getStatus() == RecruitmentStatus.OPEN) {
            return true;
        }
        LocalDateTime joinExpiresAt = getJoinExpiresAt();
        return joinExpiresAt != null && !now.isAfter(joinExpiresAt);
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
