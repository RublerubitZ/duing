package com.duing.domain.adminconsole.controller.dto.response;

import com.duing.domain.adminconsole.service.dto.query.AdminJobStatusQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "총동연 홈 자동 작업 상태")
public record AdminJobStatusesResponse(
        @Schema(description = "자동 작업 5개 — 기록이 없어도 작업마다 한 줄, 선언 순서")
        List<JobStatusResponse> jobs
) {
    public static AdminJobStatusesResponse from(AdminJobStatusQuery query) {
        return new AdminJobStatusesResponse(query.jobs().stream().map(JobStatusResponse::from).toList());
    }
}
