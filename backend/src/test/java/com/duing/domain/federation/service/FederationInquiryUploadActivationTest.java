package com.duing.domain.federation.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.federation.service.dto.command.CreateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationInquiryCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/** 총동연 문의 첨부의 업로드 활성화 지점(스펙 §3.4: FEDERATION_INQUIRY 생성·수정 교체). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FederationInquiryUploadActivationTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @Autowired FederationInquiryService federationInquiryService;
    @Autowired UserRepository userRepository;
    @Autowired UploadedObjectRepository uploadedObjectRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String seedPending() {
        String storageKey = FilePurpose.FEDERATION_INQUIRY.directory() + "/" + sequence.incrementAndGet() + ".jpg";
        uploadedObjectRepository.save(
                UploadedObject.pending(storageKey, FilePurpose.FEDERATION_INQUIRY, 1L, Instant.now()));
        return storageKey;
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    @Test
    @DisplayName("문의를 첨부와 함께 만들면 첨부 업로드가 전부 ACTIVE 가 되고, 수정으로 교체하면 새 첨부 업로드가 ACTIVE 가 된다")
    void createAndReplaceActivateAttachments() {
        User author = userRepository.save(UserFixture.unique());
        String firstKey = seedPending();
        String secondKey = seedPending();
        String replacementKey = seedPending();

        Long inquiryId = federationInquiryService.create(new CreateFederationInquiryCommand(author.getId(),
                "제목", "내용", List.of(STUB_PREFIX + secondKey, STUB_PREFIX + firstKey)));
        assertThat(statusOf(firstKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(secondKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        federationInquiryService.update(new UpdateFederationInquiryCommand(inquiryId, author.getId(),
                "제목", "내용", List.of(STUB_PREFIX + replacementKey)));
        assertThat(statusOf(replacementKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }
}
