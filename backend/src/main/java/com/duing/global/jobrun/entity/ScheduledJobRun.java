package com.duing.global.jobrun.entity;

import com.duing.global.jobrun.JobRunOutcome;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 스케줄 잡의 최근 실행 한 줄 — 작업 키(MonitoredJob 이름)당 1행.
 *
 * <p>자연키 PK 라 BaseEntity 를 상속하지 않는다(AdminPendingSnapshot 전례). 키를 enum 이 아니라 문자열로 매핑해,
 * 나중 이미지가 남긴 모르는 키 줄이 있어도 읽기가 깨지지 않는다(조회는 아는 키만 findAllById 로 읽는다).
 * 저장은 {@code ScheduledJobRunRepository#upsert} 네이티브 한 문장으로만 한다 — 이 엔티티는 조회 전용이다.
 */
@Getter
@Entity
@Table(name = "scheduled_job_run")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ScheduledJobRun {

    @Id
    @Column(name = "job_key", length = 40)
    private String jobKey;

    @Column(name = "last_started_at", nullable = false)
    private Instant lastStartedAt;

    @Column(name = "last_finished_at", nullable = false)
    private Instant lastFinishedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "last_outcome", nullable = false, length = 20)
    private JobRunOutcome lastOutcome;

    @Column(name = "last_result_count", nullable = false)
    private int lastResultCount;

    @Column(name = "last_failed_count", nullable = false)
    private int lastFailedCount;

    /** 결과가 FAILED 가 아니었던 마지막 종료 시각(일부 실패도 "돌긴 돌았다"). 한 번도 없으면 null. */
    @Column(name = "last_succeeded_at")
    private Instant lastSucceededAt;

    /** 일부 실패·실패가 이어진 횟수 — 성공이면 0. */
    @Column(name = "consecutive_unhealthy_runs", nullable = false)
    private int consecutiveUnhealthyRuns;
}
