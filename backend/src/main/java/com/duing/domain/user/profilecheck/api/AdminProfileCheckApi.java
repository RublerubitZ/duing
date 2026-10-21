package com.duing.domain.user.profilecheck.api;

import com.duing.domain.user.profilecheck.controller.dto.request.UpdateProfileCheckSettingRequest;
import com.duing.domain.user.profilecheck.controller.dto.response.AdminProfileCheckResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "학기별 정보 확인 팝업(총동연)", description = "총동연 전용 학기별 사용자 정보 확인 팝업 설정·현황")
@SecurityRequirement(name = "BearerAuth")
public interface AdminProfileCheckApi {

    @Operation(summary = "정보 확인 팝업 설정·현황 조회",
            description = "노출 여부(켜져 있고 켤 때 기록된 학기가 오늘 학기와 같을 때만 true), 통계 기준 학기·오늘 학기, "
                    + "제목·문구, 대상·확인 완료·미확인 인원을 반환한다. 저장한 적이 없으면 기본 문구와 꺼짐 상태다.")
    @GetMapping("/admin/profile-check")
    ResponseEntity<ApiResponse<AdminProfileCheckResponse>> getProfileCheck();

    @Operation(summary = "정보 확인 팝업 설정 저장",
            description = "제목·문구·노출 여부를 저장한다. 켜면 오늘 학기가 대상 학기로 기록되고, 학기가 바뀌면 노출이 자동으로 멈춘다. "
                    + "끄더라도 사용자 확인 기록은 지우지 않는다. "
                    + "화면이 GET 에서 받은 오늘 학기(currentSemesterYear·currentSemesterTerm)를 보내면, 켜는 저장에서 서버의 오늘 학기와 "
                    + "다를 때 409(PROFILE_CHECK_SEMESTER_CHANGED)로 저장하지 않는다 — 학기 경계를 넘겨 열어 둔 화면이 새 학기 팝업을 "
                    + "시작하지 않게. 보내지 않으면 대조하지 않는다.")
    @PutMapping("/admin/profile-check")
    ResponseEntity<Void> updateProfileCheck(
            @Valid @RequestBody UpdateProfileCheckSettingRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}
