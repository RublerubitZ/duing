package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Schema(description = "계정 상태 변경 요청")
public record ChangeUserStatusRequest(
        @Schema(description = "변경할 상태", example = "SUSPENDED")
        @NotNull(message = "변경할 상태는 필수입니다.")
        UserStatus status,

        @Schema(description = "정지·해제 사유(감사 로그에 기록된다)", example = "커뮤니티 신고 3건 누적")
        @NotBlank(message = "사유는 필수입니다.")
        // @NotBlank 의 trim() 은 U+0020 이하만 공백으로 보므로 전각 공백(U+3000)만 담긴 사유가 통과한다.
        // (?U) 로 유니코드 문자 클래스를 켜야 \S 가 전각 공백을 비공백으로 세지 않는다.
        @Pattern(regexp = "(?Us).*\\S.*", message = "사유는 공백만으로 입력할 수 없습니다.")
        @Size(max = 200, message = "사유는 200자 이하로 입력해주세요.")
        String reason
) {
    public ChangeUserStatusCommand toCommand(Long targetUserId, Long actorUserId) {
        // trim() 이 아니라 strip() — 앞뒤에 붙은 전각 공백까지 감사 로그에 남지 않게 한다.
        return new ChangeUserStatusCommand(targetUserId, actorUserId, status, reason.strip());
    }
}
