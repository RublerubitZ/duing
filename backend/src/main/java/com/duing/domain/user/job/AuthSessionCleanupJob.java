package com.duing.domain.user.job;

import com.duing.domain.user.repository.AuthEventRepository;
import com.duing.domain.user.repository.AuthRefreshTokenRepository;
import com.duing.domain.user.repository.AuthSessionRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매일 04:50(Asia/Seoul) 만료/폐기 세션·감사 로그 물리 삭제 (spec §18.1).
 * 세션: 폐기/만료 후 30일 보존(재사용 포렌식) 뒤 토큰과 함께 삭제. 감사 이벤트: 90일 보존.
 * 백업(04:15)·PII 파기(04:30)와 시간 분산. {@code duing.auth.session.cleanup.enabled=true} 에서만 등록.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.auth.session.cleanup", name = "enabled", havingValue = "true")
public class AuthSessionCleanupJob {

    private static final int SESSION_RETENTION_DAYS = 30;
    private static final int EVENT_RETENTION_DAYS = 90;

    private final AuthSessionRepository authSessionRepository;
    private final AuthRefreshTokenRepository authRefreshTokenRepository;
    private final AuthEventRepository authEventRepository;
    private final Clock clock;

    @Scheduled(cron = "0 50 4 * * *", zone = "Asia/Seoul")
    @Transactional
    public void run() {
        LocalDateTime now = LocalDateTime.now(clock);
        List<Long> purgeableSessionIds =
                authSessionRepository.findPurgeableIds(now.minusDays(SESSION_RETENTION_DAYS));
        int deletedSessions = 0;
        if (!purgeableSessionIds.isEmpty()) {
            authRefreshTokenRepository.deleteBySessionIds(purgeableSessionIds);
            deletedSessions = authSessionRepository.deleteByIds(purgeableSessionIds);
        }
        int deletedEvents = authEventRepository.deleteOlderThan(now.minusDays(EVENT_RETENTION_DAYS));
        log.info("AuthSessionCleanupJob: 세션 {}건, 감사 이벤트 {}건 삭제", deletedSessions, deletedEvents);
    }
}
