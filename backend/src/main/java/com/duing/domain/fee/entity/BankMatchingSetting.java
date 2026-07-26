package com.duing.domain.fee.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
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

    // ponytail: 외부 계좌 등록 개념이 사라져 active 와 항상 같은 값이다. 컬럼 drop 은 마이그레이션이
    // 필요하고 기존 행(active=api_registered=true)도 그대로 유효해 급하지 않다 — 정리 시 V+1 로 drop.
    @Column(name = "api_registered", nullable = false)
    private boolean apiRegistered;

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

    /** 자동매칭을 끈다. */
    public void deactivate() {
        this.active = false;
        this.apiRegistered = false;
    }

    /** 자동매칭이 실제로 동작 가능한 상태인지 여부. */
    public boolean isUsable() {
        return active && apiRegistered;
    }
}
