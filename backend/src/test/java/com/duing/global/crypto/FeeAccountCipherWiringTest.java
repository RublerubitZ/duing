package com.duing.global.crypto;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 부팅 단위 검증:
 * <ul>
 *   <li>{@code @Value("${security.fee-account.encryption-key}")} 가 실제로 빈에 주입돼 라운드트립이 동작한다.</li>
 *   <li>V61 마이그레이션이 적용돼 {@code fee_account} 테이블이 존재하고 RLS 가 켜져 있다.</li>
 * </ul>
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FeeAccountCipherWiringTest {

    @Autowired
    private FeeAccountCipher feeAccountCipher;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("@Value 로 주입된 키로 FeeAccountCipher 빈이 부팅되어 암복호화 라운드트립이 동작한다")
    void cipherBeanIsWiredWithInjectedKey() {
        assertThat(feeAccountCipher).isNotNull();

        String plaintext = "352-9999-1111-22";
        assertThat(feeAccountCipher.decrypt(feeAccountCipher.encrypt(plaintext))).isEqualTo(plaintext);
    }

    @Test
    @DisplayName("V61 적용으로 fee_account 테이블이 생성되고 RLS 가 켜져 있다")
    void feeAccountTableExistsWithRlsEnabled() {
        Boolean rlsEnabled = jdbcTemplate.queryForObject(
                "SELECT c.relrowsecurity FROM pg_class c "
                        + "JOIN pg_namespace n ON c.relnamespace = n.oid "
                        + "WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = 'fee_account'",
                Boolean.class);

        assertThat(rlsEnabled).isTrue();
    }
}
