package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.ManagerInterviewConfigApi;
import com.duing.domain.interview.controller.dto.request.CreateInterviewConfigRequest;
import com.duing.domain.interview.controller.dto.request.UpdateInterviewConfigRequest;
import com.duing.domain.interview.controller.dto.response.CreateInterviewConfigResponse;
import com.duing.domain.interview.service.InterviewConfigService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ManagerInterviewConfigController implements ManagerInterviewConfigApi {

    private final InterviewConfigService interviewConfigService;

    @Override
    public ResponseEntity<ApiResponse<CreateInterviewConfigResponse>> create(
            Long recruitmentId,
            CreateInterviewConfigRequest request,
            UserPrincipal currentUser
    ) {
        Long configId = interviewConfigService.create(request.toCommand(recruitmentId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(new CreateInterviewConfigResponse(configId)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> update(
            Long recruitmentId,
            UpdateInterviewConfigRequest request,
            UserPrincipal currentUser
    ) {
        interviewConfigService.update(request.toCommand(recruitmentId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }
}
