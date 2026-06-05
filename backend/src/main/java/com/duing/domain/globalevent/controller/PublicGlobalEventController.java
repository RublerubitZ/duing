package com.duing.domain.globalevent.controller;

import com.duing.domain.globalevent.api.PublicGlobalEventApi;
import com.duing.domain.globalevent.controller.dto.response.GlobalEventCardResponse;
import com.duing.domain.globalevent.controller.dto.response.GlobalEventDetailResponse;
import com.duing.domain.globalevent.service.GlobalEventService;
import com.duing.global.response.ApiResponse;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class PublicGlobalEventController implements PublicGlobalEventApi {

    private final GlobalEventService eventService;

    @Override
    public ResponseEntity<ApiResponse<List<GlobalEventCardResponse>>> listWindow(LocalDate from, LocalDate to) {
        List<GlobalEventCardResponse> items = eventService.listPublicWindow(from, to)
                .stream()
                .map(GlobalEventCardResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(items));
    }

    @Override
    public ResponseEntity<ApiResponse<GlobalEventDetailResponse>> getDetail(Long eventId) {
        return ResponseEntity.ok(
                ApiResponse.success(GlobalEventDetailResponse.from(eventService.getPublic(eventId)))
        );
    }
}
