package com.duing.domain.globalevent.api;

import com.duing.domain.globalevent.controller.dto.response.GlobalEventCardResponse;
import com.duing.domain.globalevent.controller.dto.response.GlobalEventDetailResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "글로벌 이벤트 (공개)")
public interface PublicGlobalEventApi {

    @Operation(summary = "글로벌 이벤트 윈도우 조회 (공개)")
    @GetMapping("/global-events")
    ResponseEntity<ApiResponse<List<GlobalEventCardResponse>>> listWindow(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    );

    @Operation(summary = "글로벌 이벤트 상세 (공개)")
    @GetMapping("/global-events/{eventId}")
    ResponseEntity<ApiResponse<GlobalEventDetailResponse>> getDetail(@PathVariable Long eventId);
}
