package com.duing.domain.clubaudit.api;

import com.duing.domain.clubaudit.controller.dto.response.AdminClubActivityEventResponse;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "동아리 활동 이력(총동연)",
        description = "총동연 전용 동아리 활동 이력 — 상태 전이·폐쇄·가입 링크(모집 링크·부원 초대) 생성/재발급/폐기.")
@SecurityRequirement(name = "BearerAuth")
public interface AdminClubActivityApi {

    @Operation(summary = "동아리 활동 이력 (ADMIN)",
            description = "동아리의 상태 전이·폐쇄·가입 링크 이벤트를 최신순으로 반환한다. "
                    + "types 미지정이면 허용 5종(CLUB_STATUS_CHANGED, CLUB_CLOSED, JOIN_LINK_CREATED, "
                    + "JOIN_LINK_REGENERATED, JOIN_LINK_REVOKED) 전체, 지정하면 허용 집합과의 교집합만이며 "
                    + "전부 허용 밖이면 빈 결과다(회비·가입 요청 종류는 실리지 않는다). "
                    + "recruitmentId 가 null 인 가입 링크 이벤트가 부원 초대 링크다. actorName 은 탈퇴 회원이면 비어 나오고, "
                    + "detail 은 이벤트 종류마다 키가 다른 스냅샷 원본(JSON)이라 없을 수도 있다. "
                    + "폐쇄된 동아리의 이력도 조회된다. 이력은 계측 배포 시점 이후의 변경만 기록된다.")
    @GetMapping("/admin/clubs/{clubId}/activity-events")
    ResponseEntity<ApiResponse<PageResponse<AdminClubActivityEventResponse>>> searchActivityEvents(
            @Parameter(description = "조회 대상 동아리 ID", required = true)
            @PathVariable Long clubId,
            @Parameter(description = "이벤트 종류(복수). 생략 시 허용 5종 전체")
            @RequestParam(required = false) List<ClubAuditEventType> types,
            @Parameter(description = "페이지(0부터)·크기. 정렬은 최신순 고정")
            Pageable pageable
    );
}
