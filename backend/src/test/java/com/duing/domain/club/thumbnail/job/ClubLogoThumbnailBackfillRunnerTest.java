package com.duing.domain.club.thumbnail.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ImageFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.thumbnail.config.ClubLogoThumbnailAsyncConfig;
import com.duing.domain.club.thumbnail.service.ClubLogoThumbnailService;
import com.duing.global.file.FilePurpose;
import com.duing.global.file.FileStorageService;
import com.duing.global.frontend.FrontendRevalidationAsyncConfig;
import com.duing.global.frontend.FrontendRevalidator;
import com.duing.global.frontend.event.ClubPublicPageChangedEvent;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

/**
 * 로고 썸네일 백필(스펙 §4.5)의 통합 계약. 러너는 테스트가 직접 만들고 run() 을 호출 스레드에서 돌린다 — 기동 리스너·실행기·
 * 프로퍼티에 기대지 않는다(컨텍스트 빈은 토글이 꺼져 있어 등록되지 않는다). 생성 서비스·스토리지(스텁)는 실제 빈이다.
 *
 * <p>상세 재생성 요청기는 컨텍스트의 {@code @MockitoBean} 하나를 러너에도 그대로 넘긴다 — 러너의 직접 요청과, 백필이 잘못 내는
 * ClubPublicPageChangedEvent 가 리스너를 거쳐 보내는 요청이 같은 목에 쌓여 {@code verifyNoMoreInteractions} 가 둘을 함께 본다
 * (재생성 실행기를 비운 뒤). 백필 경로는 그 이벤트를 내지 않아야 한다(공개 동아리 이중 렌더·비공개 동아리 렌더·재생성 큐 넘침 방지).
 * {@code @RecordApplicationEvents} 의 0건 단언은 보조다 — ApplicationEventsHolder 는 평범한 ThreadLocal 이라 run() 이 다른 스레드로
 * 옮겨가면 빈 스트림으로 공허하게 통과한다. 그래서 run() 은 반드시 테스트 스레드에서 돌리고, 스레드가 바뀌어도 잡히는 쪽은 목 검증이다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ExtendWith(OutputCaptureExtension.class)
@RecordApplicationEvents
class ClubLogoThumbnailBackfillRunnerTest extends IntegrationTestBase {

    private static final long ASYNC_WAIT_MS = 5_000;
    private static final String STUB_PREFIX = "/files/stub/";
    private static final String PNG_THUMBNAIL_URL_PATTERN = "/files/stub/club/logo/[0-9a-f-]{36}-thumb\\.png";

    @MockitoBean FrontendRevalidator frontendRevalidator;

    @Autowired ClubRepository clubRepository;
    @Autowired ClubLogoThumbnailService clubLogoThumbnailService;
    @Autowired FileStorageService fileStorageService;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired ApplicationEvents applicationEvents;
    @Autowired @Qualifier(ClubLogoThumbnailAsyncConfig.EXECUTOR_BEAN_NAME) ThreadPoolTaskExecutor thumbnailExecutor;
    @Autowired @Qualifier(FrontendRevalidationAsyncConfig.EXECUTOR_BEAN_NAME) ThreadPoolTaskExecutor revalidationExecutor;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    /** 같은 컨텍스트를 쓰는 다른 클래스가 남긴 비동기 호출이 이 클래스의 목 검증에 섞이지 않게 비우고 기록을 지운다. */
    @BeforeEach
    void drainAndReset() throws InterruptedException {
        drain(thumbnailExecutor);
        drain(revalidationExecutor);
        clearInvocations(frontendRevalidator);
    }

    @AfterEach
    void drainAfter() throws InterruptedException {
        drain(thumbnailExecutor);
        drain(revalidationExecutor);
    }

    private static void drain(ThreadPoolTaskExecutor executor) throws InterruptedException {
        long deadline = System.currentTimeMillis() + ASYNC_WAIT_MS;
        while ((executor.getActiveCount() > 0 || executor.getQueueSize() > 0) && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
    }

    /** 실행기 없이 호출 스레드에서 바로 돈다 — 테스트는 run() 을 직접 부른다(이벤트 기록 단언의 전제). */
    private ClubLogoThumbnailBackfillRunner runner() {
        return new ClubLogoThumbnailBackfillRunner(clubRepository, clubLogoThumbnailService, frontendRevalidator, Runnable::run);
    }

    private String seedLogo(byte[] content) {
        String storageKey = FilePurpose.LOGO.directory() + "/" + sequence.incrementAndGet() + ".png";
        return fileStorageService.uploadBytes(storageKey, content, "image/png");
    }

    private String failingLogoUrl() {
        return STUB_PREFIX + "club/logo/__fail__-" + sequence.incrementAndGet() + ".png";
    }

    private Club saveClub(ClubStatus status, String logoUrl) throws Exception {
        Club club = Club.create("백필-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, "분과", "설명", logoUrl);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, status);
        return clubRepository.save(club);
    }

    private String thumbnailUrlOf(Long clubId) {
        return jdbcTemplate.queryForObject("SELECT logo_thumbnail_url FROM club WHERE id = ?", String.class, clubId);
    }

    @Test
    @DisplayName("썸네일 없는 로고 동아리를 id 순으로 처리해 큰 원본은 썸네일을, 작은 원본은 원본 URL 을 넣고, 공개 동아리만 상세 재생성을 직접 요청하며(상세 변경 이벤트 0건) 시작·완료 로그를 남긴다")
    void backfillsTargetsAndRevalidatesPublicOnes(CapturedOutput output) throws Exception {
        Club largePublic = saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));
        Club smallPublic = saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(200, 100, false)));
        Club unreadablePublic = saveClub(ClubStatus.ACTIVE, seedLogo("not an image".getBytes(StandardCharsets.UTF_8)));
        Club largePending = saveClub(ClubStatus.PENDING_APPROVAL, seedLogo(ImageFixture.png(800, 600, true)));
        Club alreadyDone = saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));
        clubRepository.setLogoThumbnailUrlIfLogoUnchanged(alreadyDone.getId(), alreadyDone.getLogoUrl(), alreadyDone.getLogoUrl());
        Club noLogo = saveClub(ClubStatus.ACTIVE, null);

        runner().run();

        assertThat(thumbnailUrlOf(largePublic.getId())).matches(PNG_THUMBNAIL_URL_PATTERN);
        assertThat(thumbnailUrlOf(smallPublic.getId())).isEqualTo(smallPublic.getLogoUrl());
        assertThat(thumbnailUrlOf(unreadablePublic.getId())).isNull();
        assertThat(thumbnailUrlOf(largePending.getId())).matches(PNG_THUMBNAIL_URL_PATTERN);
        assertThat(thumbnailUrlOf(alreadyDone.getId())).isEqualTo(alreadyDone.getLogoUrl());
        assertThat(thumbnailUrlOf(noLogo.getId())).isNull();
        InOrder revalidationOrder = inOrder(frontendRevalidator);
        revalidationOrder.verify(frontendRevalidator).revalidateWithoutAlert("/clubs/" + largePublic.getId());
        revalidationOrder.verify(frontendRevalidator).revalidateWithoutAlert("/clubs/" + smallPublic.getId());
        // 백필은 직접 요청만 한다 — 이벤트로도 보내면 리스너가 같은 목에 공개 동아리 2곳을 한 번 더, 승인 대기 동아리까지 보낸다.
        // 리스너는 비동기라 재생성 실행기를 비운 뒤 "그 밖의 호출 없음" 을 고정한다(run() 이 다른 스레드로 가도 잡힌다).
        drain(revalidationExecutor);
        verifyNoMoreInteractions(frontendRevalidator);
        // 보조 단언 — run() 이 테스트 스레드에서 돌았다는 전제에서만 의미가 있다(ApplicationEventsHolder 는 ThreadLocal).
        assertThat(applicationEvents.stream(ClubPublicPageChangedEvent.class)).isEmpty();
        assertThat(output).contains("[로고 썸네일 백필] 시작 — 대상 4")
                .contains("[로고 썸네일 백필] 완료 — 생성 3 · 건너뜀 1 · 실패 0 · 재생성 2");
    }

    @Test
    @DisplayName("다시 실행하면 이미 만든 동아리는 대상이 아니고 형식 때문에 건너뛴 동아리만 다시 본다(멱등)")
    void secondRunOnlyRevisitsSkippedClubs(CapturedOutput output) throws Exception {
        saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));
        saveClub(ClubStatus.ACTIVE, seedLogo("not an image".getBytes(StandardCharsets.UTF_8)));
        runner().run();
        clearInvocations(frontendRevalidator);

        runner().run();

        assertThat(output).contains("[로고 썸네일 백필] 시작 — 대상 1")
                .contains("[로고 썸네일 백필] 완료 — 생성 0 · 건너뜀 1 · 실패 0 · 재생성 0");
        verifyNoInteractions(frontendRevalidator);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM uploaded_object WHERE storage_key LIKE '%-thumb.%'", Long.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("한 동아리의 스토리지 장애는 실패로 세고 나머지 동아리는 계속 처리한다")
    void storageFailureIsIsolatedPerClub(CapturedOutput output) throws Exception {
        Club failing = saveClub(ClubStatus.ACTIVE, failingLogoUrl());
        Club healthy = saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));

        runner().run();

        assertThat(thumbnailUrlOf(failing.getId())).isNull();
        assertThat(thumbnailUrlOf(healthy.getId())).matches(PNG_THUMBNAIL_URL_PATTERN);
        verify(frontendRevalidator).revalidateWithoutAlert("/clubs/" + healthy.getId());
        verifyNoMoreInteractions(frontendRevalidator);
        assertThat(output).contains("[로고 썸네일 백필] 실패 — clubId=" + failing.getId() + ", reason=IllegalStateException")
                .contains("[로고 썸네일 백필] 완료 — 생성 1 · 건너뜀 0 · 실패 1 · 재생성 1");
    }

    @Test
    @DisplayName("연속 3회 실패하면 저장소 장애로 보고 멈춰 남은 동아리를 다음 기동에 맡기고, 상세 재생성도 하지 않는다")
    void consecutiveFailuresStopTheRun(CapturedOutput output) throws Exception {
        saveClub(ClubStatus.ACTIVE, failingLogoUrl());
        saveClub(ClubStatus.ACTIVE, failingLogoUrl());
        saveClub(ClubStatus.ACTIVE, failingLogoUrl());
        Club neverReached = saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));

        runner().run();

        assertThat(thumbnailUrlOf(neverReached.getId())).isNull();
        verifyNoInteractions(frontendRevalidator);
        assertThat(output).contains("[로고 썸네일 백필] 연속 3회 실패 — 중단(남은 1곳은 다음 기동에서)")
                .contains("[로고 썸네일 백필] 완료 — 생성 0 · 건너뜀 0 · 실패 3 · 재생성 0");
    }

    @Test
    @DisplayName("실패 사이에 성공이 끼면 연속 횟수가 다시 세어져 멈추지 않는다")
    void successResetsConsecutiveFailureCount(CapturedOutput output) throws Exception {
        saveClub(ClubStatus.ACTIVE, failingLogoUrl());
        saveClub(ClubStatus.ACTIVE, failingLogoUrl());
        saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));
        saveClub(ClubStatus.ACTIVE, failingLogoUrl());
        saveClub(ClubStatus.ACTIVE, failingLogoUrl());
        Club lastHealthy = saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));

        runner().run();

        assertThat(thumbnailUrlOf(lastHealthy.getId())).matches(PNG_THUMBNAIL_URL_PATTERN);
        assertThat(output).doesNotContain("연속 3회 실패")
                .contains("[로고 썸네일 백필] 완료 — 생성 2 · 건너뜀 0 · 실패 4 · 재생성 2");
    }

    @Test
    @DisplayName("썸네일을 반영한 공개 동아리마다 다음 동아리를 만들기 전에 그 동아리의 상세 재생성을 요청하고, 비공개 동아리는 요청하지 않는다")
    void revalidatesEachPublicClubRightAfterItsThumbnail(CapturedOutput output) throws Exception {
        Club first = saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));
        Club pending = saveClub(ClubStatus.PENDING_APPROVAL, seedLogo(ImageFixture.png(800, 600, true)));
        Club last = saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));
        List<Club> clubs = List.of(first, pending, last);
        List<String> requests = new ArrayList<>();
        // 요청마다 그 순간 썸네일이 생긴 동아리 수를 함께 적는다 — 생성 1 → 재생성 1 → 생성 2·3 → 재생성 3 순서가 여기서 드러난다.
        doAnswer(invocation -> {
            long storedSoFar = clubs.stream().filter(club -> thumbnailUrlOf(club.getId()) != null).count();
            requests.add(invocation.getArgument(0) + " — 썸네일 " + storedSoFar + "곳");
            return null;
        }).when(frontendRevalidator).revalidateWithoutAlert(anyString());

        runner().run();

        assertThat(requests).containsExactly(
                "/clubs/" + first.getId() + " — 썸네일 1곳",
                "/clubs/" + last.getId() + " — 썸네일 3곳");
        assertThat(output).contains("[로고 썸네일 백필] 완료 — 생성 3 · 건너뜀 0 · 실패 0 · 재생성 2");
    }

    @Test
    @DisplayName("동아리 2곳의 썸네일을 반영한 직후 컨텍스트 종료가 시작되면 그 2곳은 상세 재생성까지 마치고, 남은 동아리는 생성·재생성 모두 하지 않는다")
    void contextCloseAfterGenerationStillRevalidatesGeneratedClubs(CapturedOutput output) throws Exception {
        Club first = saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));
        Club second = saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));
        Club third = saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));
        ClubLogoThumbnailService observedService = spy(clubLogoThumbnailService);
        ClubLogoThumbnailBackfillRunner runner = new ClubLogoThumbnailBackfillRunner(
                clubRepository, observedService, frontendRevalidator, Runnable::run);
        // 둘째 동아리 썸네일을 반영한 직후(그 상세 재생성 전) 컨텍스트 종료가 시작된다 — 리스너가 세우는 플래그를 그대로 세운다.
        doAnswer(invocation -> {
            Object outcome = invocation.callRealMethod();
            runner.stopOnContextClose();
            return outcome;
        }).when(observedService).generateForBackfill(eq(second.getId()), anyString());

        runner.run();

        InOrder revalidationOrder = inOrder(frontendRevalidator);
        revalidationOrder.verify(frontendRevalidator).revalidateWithoutAlert("/clubs/" + first.getId());
        revalidationOrder.verify(frontendRevalidator).revalidateWithoutAlert("/clubs/" + second.getId());
        verifyNoMoreInteractions(frontendRevalidator);
        assertThat(thumbnailUrlOf(first.getId())).matches(PNG_THUMBNAIL_URL_PATTERN);
        assertThat(thumbnailUrlOf(second.getId())).matches(PNG_THUMBNAIL_URL_PATTERN);
        assertThat(thumbnailUrlOf(third.getId())).isNull();
        assertThat(output).contains("[로고 썸네일 백필] 종료 중 — 남은 1곳 건너뜀")
                .contains("[로고 썸네일 백필] 완료 — 생성 2 · 건너뜀 0 · 실패 0 · 재생성 2");
    }

    @Test
    @DisplayName("상세 재생성 요청이 예외를 던져도 생성은 성공으로 세고 연속 실패로 멈추지 않으며, 재생성 수에서만 빠진다")
    void revalidationFailureIsNotCountedAsGenerationFailure(CapturedOutput output) throws Exception {
        // 연속 실패 임계(3)보다 하나 많다 — 재생성 예외를 생성 실패로 셌다면 넷째 동아리 앞에서 멈춘다.
        List<Club> clubs = new ArrayList<>();
        for (int count = 0; count < 4; count++) {
            clubs.add(saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true))));
        }
        // 요청기는 던지지 않는 계약이다 — 어긴 경우를 흉내 낸다.
        doThrow(new IllegalStateException("계약 위반")).when(frontendRevalidator).revalidateWithoutAlert(anyString());

        runner().run();

        for (Club club : clubs) {
            assertThat(thumbnailUrlOf(club.getId())).matches(PNG_THUMBNAIL_URL_PATTERN);
            verify(frontendRevalidator).revalidateWithoutAlert("/clubs/" + club.getId());
        }
        assertThat(output).doesNotContain("연속 3회 실패")
                .contains("[로고 썸네일 백필] 상세 재생성 실패 — clubId=" + clubs.get(0).getId() + ", reason=IllegalStateException")
                .contains("[로고 썸네일 백필] 완료 — 생성 4 · 건너뜀 0 · 실패 0 · 재생성 0");
    }

    @Test
    @DisplayName("생성 도중 컨텍스트 종료가 시작되면 남은 동아리를 건너뛰고 끝낸다")
    void contextCloseStopsRemainingGeneration(CapturedOutput output) throws Exception {
        Club target = saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));
        ClubLogoThumbnailBackfillRunner runner = runner();
        runner.stopOnContextClose();

        runner.run();

        assertThat(thumbnailUrlOf(target.getId())).isNull();
        verifyNoInteractions(frontendRevalidator);
        assertThat(output).contains("[로고 썸네일 백필] 시작 — 대상 1")
                .contains("[로고 썸네일 백필] 종료 중 — 남은 1곳 건너뜀")
                .contains("[로고 썸네일 백필] 완료 — 생성 0 · 건너뜀 0 · 실패 0 · 재생성 0");
    }

    @Test
    @DisplayName("기동 완료 리스너는 백필을 실행기에 넘기기만 하고 호출 스레드에서 돌리지 않는다")
    void startHandsOffToExecutor() throws Exception {
        Club target = saveClub(ClubStatus.ACTIVE, seedLogo(ImageFixture.png(800, 600, true)));
        List<Runnable> handedOff = new ArrayList<>();
        ClubLogoThumbnailBackfillRunner runner = new ClubLogoThumbnailBackfillRunner(
                clubRepository, clubLogoThumbnailService, frontendRevalidator, handedOff::add);

        runner.startInBackground();

        assertThat(handedOff).hasSize(1);
        assertThat(thumbnailUrlOf(target.getId())).isNull();
        handedOff.get(0).run();
        assertThat(thumbnailUrlOf(target.getId())).matches(PNG_THUMBNAIL_URL_PATTERN);
    }
}
