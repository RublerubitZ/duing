package com.duing.domain.clubaudit.controller;

import com.duing.domain.clubaudit.api.AdminClubActivityApi;
import com.duing.domain.clubaudit.controller.dto.response.AdminClubActivityEventResponse;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.service.AdminClubActivityQueryService;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminClubActivityController implements AdminClubActivityApi {

    private final AdminClubActivityQueryService adminClubActivityQueryService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminClubActivityEventResponse>>> searchActivityEvents(
            @PathVariable Long clubId,
            @RequestParam(required = false) List<ClubAuditEventType> types,
            Pageable pageable
    ) {
        Page<AdminClubActivityEventResponse> page = adminClubActivityQueryService
                .getActivityEvents(clubId, types, pageable)
                .map(AdminClubActivityEventResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }
}
