package com.duing.domain.club.service.dto.query;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 신호 판정 기준 — ClubSignalPolicy#cutoffs 가 한 순간(clock.instant() 한 번)에서 만든다.
 * 이름에 비교 방향(Before = 미포함, Since = 포함)을 담고, 각 값은 비교 대상 컬럼의 regime 벽시계다(TIMEZONE.md).
 *
 * @param resultEndedBefore        모집의 끝난 날(KST 날짜)이 이 날보다 앞이어야 결과 대기 신호다(미포함)
 * @param joinRequestedBefore      가입 신청 created_at(system regime)이 이보다 앞이어야 가입 대기 신호다(미포함)
 * @param operatorSessionUsedSince 운영진 세션 last_used_at(seoul regime)이 이 이후면 접속으로 본다(포함)
 * @param operatorLoggedInSince    운영진 users.last_login_at(system regime)이 이 이후면 접속으로 본다(포함)
 */
public record ClubSignalCutoffs(
        LocalDate resultEndedBefore,
        LocalDateTime joinRequestedBefore,
        LocalDateTime operatorSessionUsedSince,
        LocalDateTime operatorLoggedInSince
) {
}
