package com.duing.global;

import static org.junit.jupiter.api.Assertions.assertFalse;

import com.duing.common.TestcontainersConfiguration;
import io.sentry.Sentry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SentryIntegrationTest {

    @Test
    @DisplayName("SENTRY_DSN 이 없는 환경(local/test)에서는 Sentry 가 비활성으로 부팅되어 이벤트를 전송하지 않는다")
    void sentryDisabledWithoutDsn() {
        assertFalse(Sentry.isEnabled());
    }
}
