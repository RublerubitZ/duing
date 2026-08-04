package com.duing.domain.clubaudit;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubaudit.support.AuditDetailJson;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/**
 * 회비 이벤트 타입(V105)과 {@code club_audit_event.event_type} CHECK 제약의 정합 가드.
 *
 * <p>enum 에만 값을 추가하고 마이그레이션의 CHECK 갱신을 빠뜨리면 계측 시점에 INSERT 가 터진다 —
 * 감사 기록은 변이와 같은 트랜잭션이라 변이째 실패하므로, 값 추가 즉시 여기서 잡는다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubAuditEventFeeTypesTest extends IntegrationTestBase {

    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;

    @Test
    @DisplayName("회비 이벤트 15종 전부가 event_type CHECK 를 통과해 저장된다 — enum·DDL 정합 가드")
    void allFeeEventTypesPassCheckConstraint() {
        User actor = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(ClubFixture.academic("감사대상"));

        // 참조 id 는 FK 라 실존 행이 필요하므로 null 로 저장한다(컬럼 전부 nullable) —
        // 이 테스트의 목적은 CHECK 정합뿐이고 참조 채움은 Task 2·3 계측 테스트가 검증한다.
        for (ClubAuditEventType eventType : ClubAuditEventType.values()) {
            if (!eventType.name().startsWith("FEE_")) {
                continue;
            }
            clubAuditEventRepository.save(ClubAuditEvent.feeAccount(
                    eventType, club.getId(), actor.getId(),
                    AuditDetailJson.of(Map.of("probe", eventType.name()))));
        }

        long feeEventCount = clubAuditEventRepository.findAll().stream()
                .filter(event -> event.getEventType().name().startsWith("FEE_"))
                .count();
        assertThat(feeEventCount).isEqualTo(15);
    }
}
