package com.duing.domain.adminconsole.service.dto.query;

import java.util.List;

/** 총동연 홈 자동 작업 상태 — MonitoredJob 선언 순서, 기록이 없어도 작업마다 한 줄. */
public record AdminJobStatusQuery(List<JobStatusQuery> jobs) {
}
