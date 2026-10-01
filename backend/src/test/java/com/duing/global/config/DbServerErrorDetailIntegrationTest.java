package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.global.exception.PostgresConstraintViolations;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.UUID;
import org.hibernate.engine.jdbc.spi.SqlExceptionHelper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * pgjdbc 서버 오류 Detail 끄기(#1317)가 실제 드라이버 동작으로 이어지는지 고정한다. 제약 위반 메시지에 제약명은 남아
 * 409 매핑이 유지되고, 키·값 Detail 은 예외에도 Hibernate 가 남기는 SQL 오류 로그(ERROR = Sentry 이벤트)에도 없어야 한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class DbServerErrorDetailIntegrationTest extends IntegrationTestBase {

    private static final String PHONE = "010-1317-5678";
    private static final String PHONE_UNIQUE_CONSTRAINT = "uk_phone_verifications_phone";

    @Autowired
    private PhoneVerificationRepository phoneVerificationRepository;

    @Autowired
    private Clock clock;

    @Test
    @DisplayName("같은 번호를 두 번 넣으면 위반 메시지에는 제약명만 남고, 번호·서버 Detail 은 예외에도 SQL 오류 로그에도 없다")
    void duplicatePhoneViolationKeepsConstraintNameWithoutServerDetail() {
        phoneVerificationRepository.saveAndFlush(newSessionForSamePhone());

        Logger sqlExceptionLogger = (Logger) LoggerFactory.getLogger(SqlExceptionHelper.class);
        ListAppender<ILoggingEvent> logAppender = new ListAppender<>();
        logAppender.start();
        sqlExceptionLogger.addAppender(logAppender);
        try {
            assertThatThrownBy(() -> phoneVerificationRepository.saveAndFlush(newSessionForSamePhone()))
                    .isInstanceOfSatisfying(DataIntegrityViolationException.class, duplicatePhone -> {
                        // Detail 라벨은 pgjdbc 가 JVM 로케일로 번역한다 — 한국어 로케일이면 "세부 정보" 로 찍힌다.
                        assertThat(duplicatePhone.getMostSpecificCause().getMessage())
                                .contains(PHONE_UNIQUE_CONSTRAINT)
                                .doesNotContain(PHONE, "Detail", "세부 정보", "Key (");
                        assertThat(PostgresConstraintViolations.isUniqueViolationOf(
                                duplicatePhone, PHONE_UNIQUE_CONSTRAINT)).isTrue();
                    });

            // ERROR 줄이 실제로 잡혔는지 먼저 확인한다 — 못 잡았다면 아래 '번호 없음' 검증은 빈 목록이라 늘 통과한다.
            assertThat(logAppender.list)
                    .anyMatch(logEvent -> logEvent.getLevel() == Level.ERROR
                            && logEvent.getFormattedMessage().contains(PHONE_UNIQUE_CONSTRAINT))
                    .noneMatch(logEvent -> logEvent.getFormattedMessage().contains(PHONE));
        } finally {
            sqlExceptionLogger.detachAppender(logAppender);
        }
    }

    /** 번호만 같고 토큰은 매번 새로 만든다 — 토큰 unique 가 먼저 걸리지 않게 한다. */
    private PhoneVerification newSessionForSamePhone() {
        return PhoneVerification.issue(PHONE, UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null,
                LocalDateTime.now(clock));
    }
}
