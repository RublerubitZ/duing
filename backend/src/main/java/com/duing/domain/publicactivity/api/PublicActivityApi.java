package com.duing.domain.publicactivity.api;

import com.duing.domain.publicactivity.controller.dto.response.PublicActivityResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "공개 활동 피드", description = "최근 동아리 활동 피드 (비로그인 포함)")
public interface PublicActivityApi {

    @Operation(summary = "최근 동아리 활동 목록 (비로그인)")
    @GetMapping("/api/v1/public-activities")
    ResponseEntity<ApiResponse<PublicActivityResponse>> listRecentActivities(
            @RequestParam(required = false) Integer limit
    );
}
