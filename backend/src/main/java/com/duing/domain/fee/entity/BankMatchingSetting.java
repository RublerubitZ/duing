package com.duing.domain.fee.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "bank_matching_setting")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE bank_matching_setting SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class BankMatchingSetting extends BaseEntity {

    @Column(name = "club_id", nullable = false, unique = true)
    private Long clubId;

    @Column(nullable = false)
    private boolean active;

    // ponytail: 외부 계좌 등록 개념이 사라져 active 와 항상 같은 값이다. 기존 행도 그대로 유효해 급하지 않다.
    // 정리는 반드시 2단계로 — ① 이 필드와 isUsable() 참조를 제거한 릴리스를 먼저 배포하고
    // ② 다음 릴리스에서 컬럼을 drop 한다. nullable=false 매핑이라 컬럼만 먼저 지우면
    // 롤링 배포 중인 구 이미지와 롤백 이미지가 부팅/INSERT 에 실패한다.
    @Column(name = "api_registered", nullable = false)
    private boolean apiRegistered;

    /**
     * 은행 응답을 끝까지 읽고 적재까지 커밋한 마지막 동기화가 시작된 시각. 기록은
     * {@code BankMatchingSettingRepository#recordLastSyncedAt} 조건부 UPDATE 로만 하고, 자동매칭을 끄면 비운다.
     */
    @Column(name = "last_synced_at")
    private Instant lastSyncedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private BankMatchingSetting(Long clubId, boolean active, boolean apiRegistered) {
        this.clubId = clubId;
        this.active = active;
        this.apiRegistered = apiRegistered;
    }

    public static BankMatchingSetting of(Long clubId) {
        return BankMatchingSetting.builder()
                .clubId(clubId)
                .active(false)
                .apiRegistered(false)
                .build();
    }

    /** 자동매칭을 켠다. */
    public void activate() {
        this.active = true;
        this.apiRegistered = true;
    }

    /** 자동매칭을 끈다. 계좌를 바꾸려면 먼저 꺼야 하므로 동기화 기억도 함께 비워, 다음 동기화가 기억 없이 돈다. */
    public void deactivate() {
        this.active = false;
        this.apiRegistered = false;
        this.lastSyncedAt = null;
    }

    /** 자동매칭이 실제로 동작 가능한 상태인지 여부. */
    public boolean isUsable() {
        return active && apiRegistered;
    }
}
