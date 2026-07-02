package com.duing.domain.facility.service.dto.query;

import com.duing.domain.facility.entity.FetchStatus;
import java.time.Duration;
import java.util.List;

/** 크롤 1사이클 결과(구조화 로그·온디맨드 판정용). failedRooms 는 어느 월이든 실패한 room_seq 목록. */
public record CrawlSummary(FetchStatus status, int totalRooms, int succeededRooms, int reservations,
                           List<Integer> failedRooms, Duration duration) {}
