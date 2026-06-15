package com.duing.domain.clubevent.api;

import com.duing.domain.clubevent.controller.dto.response.ClubEventCardResponse;
import com.duing.domain.clubevent.controller.dto.response.ClubEventDetailResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "동아리 일정 (조회)")
@SecurityRequirement(name = "BearerAuth")
public interface ClubEventReadApi {

    @Operation(summary = "동아리 일정 윈도우 조회 (MEMBER+)")
    @GetMapping("/clubs/{clubId}/events")
    ResponseEntity<ApiResponse<List<ClubEventCardResponse>>> listWindow(
            @PathVariable Long clubId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 일정 상세 (MEMBER+)")
    @GetMapping("/clubs/{clubId}/events/{eventId}")
    ResponseEntity<ApiResponse<ClubEventDetailResponse>> getDetail(
            @PathVariable Long clubId,
            @PathVariable Long eventId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
