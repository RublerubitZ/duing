package com.duing.domain.publicactivity.controller;

import com.duing.domain.publicactivity.api.PublicActivityApi;
import com.duing.domain.publicactivity.controller.dto.response.PublicActivityResponse;
import com.duing.domain.publicactivity.service.PublicActivityService;
import com.duing.global.response.ApiResponse;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class PublicActivityController implements PublicActivityApi {

    private final PublicActivityService publicActivityService;

    @Override
    public ResponseEntity<ApiResponse<PublicActivityResponse>> listRecentActivities(Integer limit) {
        PublicActivityResponse publicActivityResponse =
                PublicActivityResponse.from(publicActivityService.getRecentActivities(limit));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60))
                        .cachePublic()
                        .staleWhileRevalidate(Duration.ofSeconds(30)))
                .body(ApiResponse.success(publicActivityResponse));
    }
}
