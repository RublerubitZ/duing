package com.duing.global.monitoring;

import java.time.LocalDateTime;

/**
 * api 트래픽 일간 요약 값 — {@code TrafficSurgeMonitor} 가 09:00 KST 경계에서 만들어 {@link OpsSlackMessageFormatter} 에
 * 넘긴다. 집계 수치만 담는다(IP·경로 없음). {@code peakPerIpReads} 는 어느 IP 든 한 분 창에서 보낸 조회의 최대 건수(한도를
 * 넘기면 한도 + 1 에서 멈춘다), {@code readLimitPerMinute} 는 그때의 조회 요청 제한 한도(0 이하 = 꺼짐)다.
 * {@code peakRequestsAt} 만 null 일 수 있다(최대 분당 요청이 0 일 때).
 */
public record TrafficDailySummary(LocalDateTime periodStart, LocalDateTime periodEnd, boolean startedAfterRestart,
                                  long totalRequests, long totalRejections, long peakRequestsPerMinute,
                                  LocalDateTime peakRequestsAt, long peakRejectionsPerMinute, int surgeAlerts,
                                  long requestThreshold, long rejectionThreshold,
                                  int peakPerIpReads, int readLimitPerMinute) {
}
