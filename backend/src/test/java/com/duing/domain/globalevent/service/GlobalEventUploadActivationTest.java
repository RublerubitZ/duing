package com.duing.domain.globalevent.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.dto.command.CreateGlobalEventCommand;
import com.duing.domain.globalevent.service.dto.command.UpdateGlobalEventCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/** 전체 행사 도메인의 업로드 활성화 지점(스펙 §3.4: GLOBAL_EVENT_COVER 생성·수정). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class GlobalEventUploadActivationTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @Autowired GlobalEventService globalEventService;
    @Autowired UserRepository userRepository;
    @Autowired UploadedObjectRepository uploadedObjectRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String seedPending() {
        String storageKey = FilePurpose.GLOBAL_EVENT_COVER.directory() + "/" + sequence.incrementAndGet() + ".jpg";
        uploadedObjectRepository.save(
                UploadedObject.pending(storageKey, FilePurpose.GLOBAL_EVENT_COVER, 1L, Instant.now()));
        return storageKey;
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    @Test
    @DisplayName("전체 행사를 만들면 커버 업로드가 ACTIVE 가 되고, 수정으로 커버를 바꾸면 새 커버 업로드가 ACTIVE 가 된다")
    void createAndUpdateActivateCover() {
        User admin = userRepository.save(UserFixture.admin());
        String createdKey = seedPending();
        String replacedKey = seedPending();
        LocalDateTime startAt = LocalDateTime.now().plusDays(7);

        Long eventId = globalEventService.create(new CreateGlobalEventCommand(admin.getId(), "행사", "설명",
                startAt, startAt.plusHours(2), "장소", null, STUB_PREFIX + createdKey, GlobalEventCategory.FESTIVAL));
        assertThat(statusOf(createdKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        globalEventService.update(new UpdateGlobalEventCommand(eventId, null, null, null, null, null, null, null,
                STUB_PREFIX + replacedKey, null));
        assertThat(statusOf(replacedKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }
}
