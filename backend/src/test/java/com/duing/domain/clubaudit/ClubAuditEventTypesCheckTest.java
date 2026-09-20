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
 * {@link ClubAuditEventType} 전 값과 {@code club_audit_event.event_type} CHECK 제약의 정합 가드.
 *
 * <p>enum 에만 값을 추가하고 마이그레이션의 CHECK 갱신을 빠뜨리면 계측 시점에 INSERT 가 터진다 —
 * 감사 기록은 변이와 같은 트랜잭션이라 변이째 실패하므로, 값 추가 즉시 여기서 잡는다.
 * 팩토리 종류는 무관하다(CHECK 정합만 본다) — 참조 컬럼이 전부 nullable 인 {@code feeAccount} 로 저장한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubAuditEventTypesCheckTest extends IntegrationTestBase {

    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;

    @Test
    @DisplayName("이벤트 타입 전부가 event_type CHECK 를 통과해 저장된다 — enum·DDL 정합 가드")
    void allEventTypesPassCheckConstraint() {
        User actor = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(ClubFixture.academic("감사대상"));

        for (ClubAuditEventType eventType : ClubAuditEventType.values()) {
            clubAuditEventRepository.save(ClubAuditEvent.feeAccount(
                    eventType, club.getId(), actor.getId(),
                    AuditDetailJson.of(Map.of("probe", eventType.name()))));
        }

        assertThat(clubAuditEventRepository.count()).isEqualTo(ClubAuditEventType.values().length);
    }
}
