package com.duing.domain.clubevent.api;

import com.duing.domain.clubevent.controller.dto.response.AdminClubEventCardResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "동아리 일정(총동연)", description = "총동연 캘린더용 전 동아리 행사 일정 조회")
@SecurityRequirement(name = "BearerAuth")
public interface AdminClubEventApi {

    @Operation(summary = "전 동아리 일정 윈도우 조회(ADMIN)",
            description = "ACTIVE 동아리의 행사 일정을 동아리명과 함께 한 번에 반환한다. "
                    + "시작일 오름차순. from·to 생략 시 오늘 기준 과거 30일 ~ 미래 180일, 창은 최대 400일. "
                    + "동아리 소속 여부와 무관하게 조회 가능하며 카드 정보만 노출한다.")
    @GetMapping("/admin/club-events")
    ResponseEntity<ApiResponse<List<AdminClubEventCardResponse>>> listWindowForAdmin(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    );
}
