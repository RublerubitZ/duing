package com.duing.domain.user.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.service.dto.query.AdminUserDetailQuery;
import com.duing.global.time.TimeMapper;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

@Schema(description = "총동연 회원 상세 (ADMIN 전용)")
public record AdminUserDetailResponse(
        Long id,
        String name,
        String studentId,
        Grade grade,
        College college,
        String major,
        UserRole role,
        @Schema(description = "마스킹된 휴대폰. 원본은 /admin/users/{userId}/phone 으로 별도 조회한다.",
                example = "010-****-9983")
        String maskedPhone,
        @Schema(description = "MO 휴대폰 인증 완료 여부")
        boolean phoneVerified,
        Instant phoneVerifiedAt,
        UserStatus status,
        @Schema(description = "가입일") Instant createdAt,
        @Schema(description = "마지막 로그인. null 이면 기록 없음(백필하지 않았다).") Instant lastLoginAt,
        String adminNote,
        @Schema(description = "메모 최종 수정 시각. 저장 이력이 없으면 null") Instant adminNoteUpdatedAt,
        @Schema(description = "메모 최종 수정 작업자 이름. 저장 이력이 없으면 null") String adminNoteUpdatedBy,
        List<ClubItem> clubs,
        @Schema(description = "최근 관리자 조치 이력(개인정보 열람 제외, 최신순 최대 20건)")
        List<ActionItem> recentActions
) {

    @Schema(description = "가입 동아리 한 건")
    public record ClubItem(Long clubId, String clubName, ClubMemberRole role, Instant joinedAt) {
    }

    @Schema(description = "관리자 조치 이력 한 건")
    public record ActionItem(AdminUserAction action, String actorName, String reason, Instant at) {
    }

    /**
     * 한 응답 안에 두 벽시계 regime 이 섞여 있다 — 일부러 그렇다. 변환 존은 컬럼 타입이 아니라
     * "그 필드를 기록한 코드"가 정하기 때문이다 (/TIMEZONE.md).
     * <ul>
     *   <li>phoneVerifiedAt 만 <b>seoul</b> — 가입·번호 변경 양쪽이 seoulClock 으로 KST 벽시계를 남긴다.</li>
     *   <li>createdAt(BaseEntity 감사)·lastLoginAt(무클럭 now())·동아리 joinedAt(BaseEntity 감사)은 <b>system</b>.</li>
     * </ul>
     * 운영 JVM 은 UTC(Dockerfile TZ=UTC)라 phoneVerifiedAt 을 system 변환에 태우면 9시간 어긋난다.
     * 로컬·CI 는 JVM 존이 KST 라 두 변환 결과가 우연히 같아 테스트로는 드러나지 않는다 —
     * "일관성" 을 이유로 하나로 통일하지 말 것.
     */
    public static AdminUserDetailResponse from(AdminUserDetailQuery detail) {
        return new AdminUserDetailResponse(
                detail.id(),
                detail.name(),
                detail.studentId(),
                detail.grade(),
                detail.college(),
                detail.major(),
                detail.role(),
                detail.maskedPhone(),
                detail.phoneVerified(),
                TimeMapper.seoulWallClockToInstant(detail.phoneVerifiedAt()),
                detail.status(),
                TimeMapper.systemWallClockToInstant(detail.createdAt()),
                TimeMapper.systemWallClockToInstant(detail.lastLoginAt()),
                detail.adminNote(),
                // 감사 로그의 시각은 이미 Instant(timestamptz)다 — TimeMapper 를 태우면 이중 변환이 된다.
                detail.adminNoteUpdatedAt(),
                detail.adminNoteUpdatedBy(),
                detail.clubs().stream()
                        .map(club -> new ClubItem(club.clubId(), club.clubName(), club.role(),
                                TimeMapper.systemWallClockToInstant(club.joinedAt())))
                        .toList(),
                detail.recentActions().stream()
                        .map(action -> new ActionItem(action.action(), action.actorName(),
                                action.reason(), action.at()))
                        .toList()
        );
    }
}
