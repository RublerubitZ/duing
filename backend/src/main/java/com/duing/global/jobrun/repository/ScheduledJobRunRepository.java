package com.duing.global.jobrun.repository;

import com.duing.global.jobrun.entity.ScheduledJobRun;
import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ScheduledJobRunRepository extends JpaRepository<ScheduledJobRun, String> {

    /**
     * 작업의 최근 실행을 덮어쓴다. 조회 후 저장 대신 단일 문장 {@code ON CONFLICT DO UPDATE} 라 SELECT 가 없고 첫 삽입 경합도 없다
     * (AdminPendingSnapshotRepository#insertIfAbsent 전례). FAILED 는 마지막 성공 시각을 지우지 않고(COALESCE),
     * 연속 실패 수는 SUCCESS 면 0, 아니면 이전 값 + 1 이다. null 파라미터를 바인딩하지 않으려고 성공 시각·연속 수는 SQL 이 outcome 으로 정한다.
     */
    @Modifying
    @Query(value = """
            INSERT INTO scheduled_job_run (job_key, last_started_at, last_finished_at, last_outcome,
                    last_result_count, last_failed_count, last_succeeded_at, consecutive_unhealthy_runs)
            VALUES (:jobKey, :startedAt, :finishedAt, :outcome, :resultCount, :failedCount,
                    CASE WHEN :outcome = 'FAILED' THEN NULL ELSE CAST(:finishedAt AS timestamptz) END,
                    CASE WHEN :outcome = 'SUCCESS' THEN 0 ELSE 1 END)
            ON CONFLICT (job_key) DO UPDATE SET
                    last_started_at = EXCLUDED.last_started_at,
                    last_finished_at = EXCLUDED.last_finished_at,
                    last_outcome = EXCLUDED.last_outcome,
                    last_result_count = EXCLUDED.last_result_count,
                    last_failed_count = EXCLUDED.last_failed_count,
                    last_succeeded_at = COALESCE(EXCLUDED.last_succeeded_at, scheduled_job_run.last_succeeded_at),
                    consecutive_unhealthy_runs = CASE WHEN EXCLUDED.last_outcome = 'SUCCESS' THEN 0
                                                      ELSE scheduled_job_run.consecutive_unhealthy_runs + 1 END
            """, nativeQuery = true)
    int upsert(@Param("jobKey") String jobKey,
               @Param("startedAt") Instant startedAt,
               @Param("finishedAt") Instant finishedAt,
               @Param("outcome") String outcome,
               @Param("resultCount") int resultCount,
               @Param("failedCount") int failedCount);
}
