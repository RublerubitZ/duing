package com.duing.global.monitoring;

import com.duing.domain.adminconsole.service.dto.query.JobStatusQuery;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 일간 요약 값 — {@code TrafficSurgeMonitor} 가 09:00 KST 경계에서 만들어 {@link OpsSlackMessageFormatter} 에 넘긴다.
 * 트래픽 쪽은 집계 수치만 담는다(IP·경로 없음). {@code peakPerIpReads} 는 어느 IP 든 한 분 창에서 보낸 조회의 최대 건수(한도를
 * 넘기면 한도 + 1 에서 멈춘다), {@code readLimitPerMinute} 는 그때의 조회 요청 제한 한도(0 이하 = 꺼짐)다. 트래픽 값 중에는
 * {@code peakRequestsAt} 만 null 일 수 있다(최대 분당 요청이 0 일 때).
 *
 * <p>{@code jobStatuses} 는 총동연 홈 '자동 작업' 카드와 같은 판정의 작업 상태(MonitoredJob 순서)이고, null 이면 조회 실패다.
 * {@code lastBackupSucceededAt} 은 백업 워크플로가 남긴 DB_BACKUP 실행 기록의 마지막 성공 시각이고, null 이면 기록 없음이다(조회
 * 실패 때도 null).
 */
public record TrafficDailySummary(LocalDateTime periodStart, LocalDateTime periodEnd, boolean startedAfterRestart,
                                  long totalRequests, long totalRejections, long peakRequestsPerMinute,
                                  LocalDateTime peakRequestsAt, long peakRejectionsPerMinute, int surgeAlerts,
                                  long requestThreshold, long rejectionThreshold,
                                  int peakPerIpReads, int readLimitPerMinute,
                                  List<JobStatusQuery> jobStatuses, Instant lastBackupSucceededAt) {
}
