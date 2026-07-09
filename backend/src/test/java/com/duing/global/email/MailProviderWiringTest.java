package com.duing.global.email;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.mail.MailHealthIndicator;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;

/**
 * 실발송 모드(email.provider=resend)의 메일 Provider 체인 배선 회귀 테스트.
 *
 * <p>테스트 리소스 application.yml 이 메인 yml 을 섀도잉하므로, 운영에서 주입되는 핵심 설정
 * (spring.mail.*, brevo.from, mail 헬스체크 비활성)을 properties 로 재현해 빈 그래프를 검증한다.
 * 메인 application.yml 의 {@code management.health.mail.enabled: false} 는 배포 헬스 게이트
 * 보호용 운영 소스-오브-트루스이므로 삭제 금지 (삭제 시 헬스 조회마다 Brevo SMTP 접속 시도).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "email.provider=resend",
        "resend.api-key=test-resend-api-key",
        "spring.mail.host=smtp-relay.brevo.com",
        "spring.mail.port=587",
        "brevo.from=두잉 <noreply@duings.com>",
        "management.health.mail.enabled=false"
})
class MailProviderWiringTest extends IntegrationTestBase {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    @DisplayName("실발송 모드에서는 Resend→Brevo 폴백 체인이 유일한 EmailSender 로 등록된다")
    void registersFallbackChainAsTheOnlyEmailSender() {
        Map<String, EmailSender> emailSenders = applicationContext.getBeansOfType(EmailSender.class);

        assertThat(emailSenders).hasSize(1);
        assertThat(emailSenders.values().iterator().next()).isInstanceOf(FallbackEmailSender.class);
        assertThat(applicationContext.getBeanNamesForType(ResendMailProvider.class)).isNotEmpty();
        assertThat(applicationContext.getBeanNamesForType(BrevoMailProvider.class)).isNotEmpty();
    }

    @Test
    @DisplayName("메일 헬스체크는 등록되지 않는다 — 헬스 조회가 Brevo SMTP 접속을 유발하지 않는다")
    void doesNotRegisterMailHealthIndicator() {
        assertThat(applicationContext.getBeanNamesForType(MailHealthIndicator.class)).isEmpty();
    }
}
