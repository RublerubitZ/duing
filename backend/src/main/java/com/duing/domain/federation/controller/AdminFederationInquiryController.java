package com.duing.domain.federation.controller;

import com.duing.domain.federation.api.AdminFederationInquiryApi;
import com.duing.domain.federation.controller.dto.request.AnswerFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryAnswerRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryStatusRequest;
import com.duing.domain.federation.controller.dto.response.AdminFederationInquiryResponse;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.FederationInquiryService;
import com.duing.domain.federation.service.dto.query.FederationInquiryAdminSearchCondition;
import com.duing.domain.federation.service.dto.query.FederationInquiryDetailQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.constant.AdminLabels;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminFederationInquiryController implements AdminFederationInquiryApi {

    private final FederationInquiryService federationInquiryService;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminFederationInquiryResponse>>> getInquiries(
            @RequestParam(required = false) FederationInquiryStatus status,
            @RequestParam(required = false) String keyword,
            Pageable pageable) {
        Page<AdminFederationInquiryResponse> page = federationInquiryService
                .searchForAdmin(new FederationInquiryAdminSearchCondition(status, keyword), pageable)
                .map(AdminFederationInquiryResponse::fromQuery);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminFederationInquiryResponse>> getInquiry(@PathVariable Long inquiryId) {
        FederationInquiryDetailQuery detail = federationInquiryService.getForAdmin(inquiryId);
        // 탈퇴 회원은 @SQLRestriction 으로 조회에서 빠짐 → '(삭제됨)' 폴백
        User author = userRepository.findById(detail.inquiry().getAuthorId()).orElse(null);
        return ResponseEntity.ok(ApiResponse.success(AdminFederationInquiryResponse.fromDetail(
                detail,
                author != null ? author.getName() : AdminLabels.DELETED,
                author != null ? author.getStudentId() : AdminLabels.DELETED)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> changeStatus(
            @PathVariable Long inquiryId, @Valid @RequestBody UpdateFederationInquiryStatusRequest request) {
        federationInquiryService.changeStatus(request.toCommand(inquiryId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> registerAnswer(
            @PathVariable Long inquiryId,
            @Valid @RequestBody AnswerFederationInquiryRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        Long answerId = federationInquiryService.answer(request.toCommand(inquiryId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(answerId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateAnswer(
            @PathVariable Long inquiryId, @Valid @RequestBody UpdateFederationInquiryAnswerRequest request) {
        federationInquiryService.updateAnswer(request.toCommand(inquiryId));
        return ResponseEntity.noContent().build();
    }
}
