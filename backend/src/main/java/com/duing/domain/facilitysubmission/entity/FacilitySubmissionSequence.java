package com.duing.domain.facilitysubmission.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 일자별 제출번호 채번 행(§3) — 자연키(날짜) PK 라 BaseEntity 를 상속하지 않는다. */
@Getter
@Entity
@Table(name = "facility_submission_seq")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilitySubmissionSequence {

    @Id
    @Column(name = "seq_date")
    private LocalDate seqDate;

    @Column(name = "next_value", nullable = false)
    private int nextValue;

    /** 행잠금 하에서만 호출된다 — 현재 번호를 반환하고 다음 번호로 증가시킨다. */
    public int currentAndIncrement() {
        int currentValue = this.nextValue;
        this.nextValue = currentValue + 1;
        return currentValue;
    }
}
