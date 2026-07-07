package com.duing.domain.federation.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryAnswer;
import com.duing.domain.federation.entity.FederationInquiryAttachment;
import com.duing.domain.federation.repository.FederationInquiryAnswerRepository;
import com.duing.domain.federation.repository.FederationInquiryAttachmentRepository;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.file.FileStorageService;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.Period;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * {@link FederationInquiryPurgeJob} 통합 테스트 (PiiRetentionJobTest 패턴 미러) — JdbcTemplate 로
 * 백데이트하고 raw SQL 로 검증해 @SQLRestriction 을 우회한다. FileStorageService 는 외부 경계라
 * {@link MockitoBean} 으로 대체해 호출 인자·실패 시나리오를 직접 통제한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "duing.federation-inquiry.purge.enabled=true",
        "duing.federation-inquiry.purge.window=P45D"
})
class FederationInquiryPurgeJobTest extends IntegrationTestBase {

    @Autowired FederationInquiryPurgeJob job;
    @Autowired FederationInquiryRepository inquiryRepository;
    @Autowired FederationInquiryAnswerRepository answerRepository;
    @Autowired FederationInquiryAttachmentRepository attachmentRepository;
    @Autowired UserRepository userRepository;
    @Autowired Clock clock;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired PlatformTransactionManager platformTransactionManager;
    @MockitoBean FileStorageService fileStorageService;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("46일 전 삭제된 문의는 본문·답변이 placeholder 로 파기되고 첨부는 스토리지·행이 함께 파기되며, "
            + "10일 전 삭제된 문의는 무변경이다 (경계 쌍)")
    void scrubsExpiredDeletedInquiryAndKeepsRecentlyDeletedInquiry() {
        stubFileStorage();
        User author = saveUser();
        User admin = saveUser();

        FederationInquiry expiredInquiry = saveInquiry(author.getId(), "만료 문의 제목", "만료 문의 본문");
        expiredInquiry.close("총동연 처리 완료");
        // closed_reason 이 실제로 NULL 처리되는지 검증하기 위한 사전 세팅 — save 가 반환한(버전 갱신된)
        // 인스턴스로 반드시 교체해야 뒤이은 delete 가 낙관락 충돌 없이 최신 version 을 사용한다.
        expiredInquiry = inquiryRepository.save(expiredInquiry);
        answerRepository.save(FederationInquiryAnswer.create(expiredInquiry.getId(), "만료 답변 본문", admin.getId()));
        attachmentRepository.save(FederationInquiryAttachment.create(
                expiredInquiry, "federation/inquiry/expired.jpg", "expired.jpg", "image/jpeg", 1024L, 0));
        softDeleteInquiry(expiredInquiry, 46);

        FederationInquiry recentInquiry = saveInquiry(author.getId(), "최근 문의 제목", "최근 문의 본문");
        answerRepository.save(FederationInquiryAnswer.create(recentInquiry.getId(), "최근 답변 본문", admin.getId()));
        attachmentRepository.save(FederationInquiryAttachment.create(
                recentInquiry, "federation/inquiry/recent.jpg", "recent.jpg", "image/jpeg", 1024L, 0));
        softDeleteInquiry(recentInquiry, 10);

        job.run();

        Map<String, Object> expiredRow = inquiryRow(expiredInquiry.getId());
        assertThat(expiredRow.get("title")).isEqualTo("(파기된 문의)");
        assertThat(expiredRow.get("content")).isEqualTo("(보관기간 경과로 파기되었습니다)");
        assertThat(expiredRow.get("closed_reason")).isNull();
        assertThat(answerContent(expiredInquiry.getId())).isEqualTo("(보관기간 경과로 파기되었습니다)");
        assertThat(attachmentCountByStorageKey("federation/inquiry/expired.jpg")).isZero();
        verify(fileStorageService).delete(fileStorageService.toFileUrl("federation/inquiry/expired.jpg"));

        Map<String, Object> recentRow = inquiryRow(recentInquiry.getId());
        assertThat(recentRow.get("title")).isEqualTo("최근 문의 제목");
        assertThat(recentRow.get("content")).isEqualTo("최근 문의 본문");
        assertThat(answerContent(recentInquiry.getId())).isEqualTo("최근 답변 본문");
        assertThat(attachmentCountByStorageKey("federation/inquiry/recent.jpg")).isEqualTo(1);
    }

    @Test
    @DisplayName("삭제되지 않은 문의는 아무리 오래돼도 파기되지 않는다 (Out of Scope 계약 잠금)")
    void neverTouchesUndeletedInquiryRegardlessOfAge() {
        stubFileStorage();
        User author = saveUser();
        FederationInquiry inquiry = saveInquiry(author.getId(), "안 지워진 문의", "안 지워진 본문");
        // soft delete 하지 않음(deleted_at IS NULL) — created_at 만 오래된 것으로 backdate 해도
        // 파기 조건(deleted_at < cutoff)에는 애초에 해당하지 않는다.
        jdbcTemplate.update(
                "UPDATE federation_inquiry SET created_at = NOW() - INTERVAL '400 day' WHERE id = ?",
                inquiry.getId());

        job.run();

        Map<String, Object> row = inquiryRow(inquiry.getId());
        assertThat(row.get("title")).isEqualTo("안 지워진 문의");
        assertThat(row.get("content")).isEqualTo("안 지워진 본문");
    }

    @Test
    @DisplayName("2회 실행해도 두 번째 실행은 이미 파기된 행을 다시 건드리지 않는다 (멱등)")
    void isIdempotentAcrossRuns() {
        stubFileStorage();
        User author = saveUser();
        User admin = saveUser();
        FederationInquiry inquiry = saveInquiry(author.getId(), "멱등 문의", "멱등 본문");
        answerRepository.save(FederationInquiryAnswer.create(inquiry.getId(), "멱등 답변", admin.getId()));
        attachmentRepository.save(FederationInquiryAttachment.create(
                inquiry, "federation/inquiry/idem.jpg", "idem.jpg", "image/jpeg", 1024L, 0));
        softDeleteInquiry(inquiry, 46);

        job.run();
        Map<String, Object> firstRun = inquiryRow(inquiry.getId());
        String firstAnswer = answerContent(inquiry.getId());

        job.run();
        Map<String, Object> secondRun = inquiryRow(inquiry.getId());
        String secondAnswer = answerContent(inquiry.getId());

        assertThat(secondRun).isEqualTo(firstRun);
        assertThat(secondAnswer).isEqualTo(firstAnswer);
        // 첨부는 첫 실행에서 이미 물리 삭제됐으므로 두 번째 실행에서는 대상이 없어 delete 가 재호출되지 않는다.
        verify(fileStorageService, times(1)).delete(anyString());
    }

    @Test
    @DisplayName("교체로 고아가 된 첨부(문의는 live)는 스토리지·행이 파기되고 문의 본문은 무변경이다")
    void purgesOrphanedAttachmentWithoutTouchingLiveInquiry() {
        stubFileStorage();
        User author = saveUser();
        FederationInquiry inquiry = saveInquiry(author.getId(), "첨부 교체 문의", "첨부 교체 본문");
        FederationInquiryAttachment orphanAttachment = attachmentRepository.save(FederationInquiryAttachment.create(
                inquiry, "federation/inquiry/orphan.jpg", "orphan.jpg", "image/jpeg", 1024L, 0));
        softDeleteAttachment(orphanAttachment, 46);

        job.run();

        assertThat(attachmentCountByStorageKey("federation/inquiry/orphan.jpg")).isZero();
        verify(fileStorageService).delete(fileStorageService.toFileUrl("federation/inquiry/orphan.jpg"));
        Map<String, Object> row = inquiryRow(inquiry.getId());
        assertThat(row.get("title")).isEqualTo("첨부 교체 문의");
        assertThat(row.get("content")).isEqualTo("첨부 교체 본문");
    }

    @Test
    @DisplayName("스토리지 삭제가 실패한 첨부는 행이 보존되고, 나머지 첨부는 계속 파기된다")
    void keepsRowWhenStorageDeleteFailsButContinuesOtherAttachments() {
        when(fileStorageService.toFileUrl(anyString()))
                .thenAnswer(invocation -> "resolved:" + invocation.getArgument(0, String.class));
        doThrow(new RuntimeException("스토리지 장애")).when(fileStorageService).delete("resolved:federation/inquiry/fails.jpg");

        User author = saveUser();
        FederationInquiry inquiry = saveInquiry(author.getId(), "실패 시나리오 문의", "실패 시나리오 본문");
        FederationInquiryAttachment failingAttachment = attachmentRepository.save(FederationInquiryAttachment.create(
                inquiry, "federation/inquiry/fails.jpg", "fails.jpg", "image/jpeg", 1024L, 0));
        FederationInquiryAttachment okAttachment = attachmentRepository.save(FederationInquiryAttachment.create(
                inquiry, "federation/inquiry/ok.jpg", "ok.jpg", "image/jpeg", 1024L, 1));
        softDeleteAttachment(failingAttachment, 46);
        softDeleteAttachment(okAttachment, 46);

        job.run();

        assertThat(attachmentCountByStorageKey("federation/inquiry/fails.jpg")).isEqualTo(1); // 행 보존 → 다음 실행 재시도
        assertThat(attachmentCountByStorageKey("federation/inquiry/ok.jpg")).isZero(); // 계속 처리되어 파기됨
    }

    @Test
    @DisplayName("비활성(enabled=false) 잡은 보관기간 초과 삭제 문의도 건드리지 않는다")
    void noopWhenDisabled() {
        stubFileStorage();
        User author = saveUser();
        FederationInquiry inquiry = saveInquiry(author.getId(), "비활성 잡 문의", "비활성 잡 본문");
        softDeleteInquiry(inquiry, 46);

        FederationInquiryPurgeJob disabledJob = new FederationInquiryPurgeJob(
                new FederationInquiryPurgeProperties(false, Period.ofDays(45)),
                clock, inquiryRepository, answerRepository, attachmentRepository,
                fileStorageService, platformTransactionManager);
        disabledJob.run();

        Map<String, Object> row = inquiryRow(inquiry.getId());
        assertThat(row.get("title")).isEqualTo("비활성 잡 문의");
    }

    @Test
    @DisplayName("보관기간이 0으로 잘못 설정되면 활성 상태여도 만료 삭제 문의를 건드리지 않는다 (오설정 안전장치)")
    void noopWhenWindowIsZero() {
        stubFileStorage();
        User author = saveUser();
        FederationInquiry inquiry = saveInquiry(author.getId(), "오설정 문의", "오설정 본문");
        softDeleteInquiry(inquiry, 46);

        FederationInquiryPurgeJob zeroWindowJob = new FederationInquiryPurgeJob(
                new FederationInquiryPurgeProperties(true, Period.ZERO),
                clock, inquiryRepository, answerRepository, attachmentRepository,
                fileStorageService, platformTransactionManager);
        zeroWindowJob.run();

        Map<String, Object> row = inquiryRow(inquiry.getId());
        assertThat(row.get("title")).isEqualTo("오설정 문의");
    }

    private void stubFileStorage() {
        when(fileStorageService.toFileUrl(anyString()))
                .thenAnswer(invocation -> "resolved:" + invocation.getArgument(0, String.class));
    }

    private FederationInquiry saveInquiry(Long authorId, String title, String content) {
        return inquiryRepository.save(FederationInquiry.create(authorId, title, content));
    }

    // 실제 soft delete 경로(repository.delete → @SQLDelete UPDATE)를 태운 뒤, 보관기간 경과를
    // 흉내내기 위해 deleted_at 만 jdbcTemplate 으로 과거로 되돌린다.
    private void softDeleteInquiry(FederationInquiry inquiry, int daysAgo) {
        inquiryRepository.delete(inquiry);
        inquiryRepository.flush();
        backdateDeletedAt("federation_inquiry", inquiry.getId(), daysAgo);
    }

    private void softDeleteAttachment(FederationInquiryAttachment attachment, int daysAgo) {
        attachmentRepository.delete(attachment);
        attachmentRepository.flush();
        backdateDeletedAt("federation_inquiry_attachment", attachment.getId(), daysAgo);
    }

    private void backdateDeletedAt(String table, Long id, int daysAgo) {
        jdbcTemplate.update(
                "UPDATE " + table + " SET deleted_at = NOW() - (? * INTERVAL '1 day') WHERE id = ?", daysAgo, id);
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", seq % 10_000_000_000L),
                "파기테스터", "purge" + seq + "@daegu.ac.kr", "hashed", UserRole.STUDENT,
                Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터정보공학부",
                "010-" + String.format("%04d", seq % 10000) + "-0000", LocalDateTime.now()));
    }

    private Map<String, Object> inquiryRow(Long id) {
        return jdbcTemplate.queryForMap(
                "SELECT title, content, closed_reason FROM federation_inquiry WHERE id = ?", id);
    }

    private String answerContent(Long inquiryId) {
        return jdbcTemplate.queryForObject(
                "SELECT content FROM federation_inquiry_answer WHERE inquiry_id = ?", String.class, inquiryId);
    }

    private Integer attachmentCountByStorageKey(String storageKey) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM federation_inquiry_attachment WHERE storage_key = ?",
                Integer.class, storageKey);
    }
}
