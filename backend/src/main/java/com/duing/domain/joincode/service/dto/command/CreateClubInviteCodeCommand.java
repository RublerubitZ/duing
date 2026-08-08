package com.duing.domain.joincode.service.dto.command;

import com.duing.domain.joincode.exception.JoinCodeException;
import java.util.Set;

/**
 * 부원 초대 링크 생성 명령. 유효기간은 24/72시간 2택 프리셋만 허용한다(스펙 §3 — 직접 입력 없음,
 * 72시간 초과 불가로 장기 링크 방치를 막는다). 열거 검증을 Bean Validation 이 아닌 compact
 * constructor 에 두는 이유는 허용 집합이 도메인 정책이기 때문이다({@link CreateJoinCodeCommand} 전례).
 */
public record CreateClubInviteCodeCommand(
        Long clubId,
        Long requesterId,
        Integer maxUses,
        Integer expiresInHours,
        Boolean autoApprove,
        Integer generation
) {
    /** 미지정 시 기본 프리셋 — 요청 경계에서 채운다. */
    public static final int DEFAULT_EXPIRES_IN_HOURS = 24;

    private static final Set<Integer> ALLOWED_EXPIRES_IN_HOURS = Set.of(24, 72);

    public CreateClubInviteCodeCommand {
        // null 을 Set.contains 에 그대로 넘기면 NPE(500) 가 되므로 먼저 걸러 400 으로 흡수한다 —
        // 요청 경계가 기본값을 채우지만 다른 호출자(내부 오케스트레이션)까지 그 전제에 기대지 않는다.
        if (expiresInHours == null || !ALLOWED_EXPIRES_IN_HOURS.contains(expiresInHours)) {
            throw new JoinCodeException.InvalidInviteExpiresInHoursException();
        }
        // 자동 승인은 미지정 = 끔이 기본이다. 여기서 정규화하지 않으면 서비스의 언박싱에서 NPE(500) 가 된다.
        autoApprove = Boolean.TRUE.equals(autoApprove);
    }
}
