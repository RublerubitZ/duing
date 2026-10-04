package com.duing.global.frontend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.photo.service.ClubPhotoService;
import com.duing.domain.club.photo.service.dto.command.CreateClubPhotoCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand.PhotoOrder;
import com.duing.domain.club.photo.service.dto.command.UpdateClubPhotoCommand;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubClosureService;
import com.duing.domain.club.service.ClubService;
import com.duing.domain.club.service.dto.command.CloseClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCentralClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.frontend.event.ClubPublicPageChangedEvent;
import com.duing.global.monitoring.event.ClubClosedEvent;
import com.duing.global.monitoring.event.ClubStatusChangedEvent;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 동아리 상세 재생성(#1356)의 end-to-end 계약 — 발행 지점 → AFTER_COMMIT → 전용 실행기 @Async 리스너 → 요청기.
 * 요청기만 목으로 바꿔 "어느 경로를 어떤 메서드로 요청했는지" 를 고정한다. 리스너는 별도 스레드라 verify(timeout)/after 로
 * 기다리고, 앞 테스트의 늦은 호출이 섞이지 않게 각 테스트 시작 때 실행기를 비운 뒤 호출 기록을 지운다
 * (OpsSlackMonitoringIntegrationTest 전례).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubPublicPageRevalidationIntegrationTest extends IntegrationTestBase {

    private static final long ASYNC_WAIT_MS = 3_000;
    private static final long QUIET_WAIT_MS = 700;

    @MockitoBean FrontendRevalidator frontendRevalidator;

    @Autowired ApplicationEventPublisher eventPublisher;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubService clubService;
    @Autowired ClubClosureService clubClosureService;
    @Autowired ClubPhotoService clubPhotoService;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired @Qualifier(FrontendRevalidationAsyncConfig.EXECUTOR_BEAN_NAME)
    ThreadPoolTaskExecutor frontendRevalidationTaskExecutor;

    @BeforeEach
    void setUp() throws InterruptedException {
        drainRevalidationExecutor();
        clearInvocations(frontendRevalidator);
    }

    /** 앞 테스트가 남긴 비동기 요청이 끝날 때까지(활성 0·큐 비움) 최대 3초 기다린다. */
    private void drainRevalidationExecutor() throws InterruptedException {
        long deadline = System.currentTimeMillis() + ASYNC_WAIT_MS;
        while ((frontendRevalidationTaskExecutor.getActiveCount() > 0
                || frontendRevalidationTaskExecutor.getQueueSize() > 0)
                && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
    }

    private static String detailPathOf(Club club) {
        return "/clubs/" + club.getId();
    }

    /**
     * 리더가 있는 공개(ACTIVE) 동아리 — 상태는 멤버십 저장 뒤 JDBC 로 바꾸고(OpsSlackMonitoringIntegrationTest 전례),
     * 바뀐 상태로 다시 읽어 돌려준다.
     */
    private Club saveActiveClubLedBy(User leader, String clubName) {
        Club club = clubRepository.save(ClubFixture.academic(clubName));
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", club.getId());
        return clubRepository.findById(club.getId()).orElseThrow();
    }

    /** 한 줄 소개(tagline)만 바꾸는 수정 커맨드 — 나머지 필드는 null(변경 없음)이다. */
    private static UpdateClubCommand taglineUpdate(Long clubId, Long requesterId, String tagline) {
        return new UpdateClubCommand(
                clubId, requesterId, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                tagline, null, null, null, null, null, null, null,
                null, null, null, null, null);
    }

    @Test
    @DisplayName("상세 변경 이벤트가 커밋되면 전용 실행기 스레드에서 그 동아리 상세 재생성을 집계 없이 요청한다")
    void committedChangeRequestsDetailRevalidationOnDedicatedThread() throws Exception {
        CompletableFuture<String> callingThreadName = new CompletableFuture<>();
        doAnswer(invocation -> callingThreadName.complete(Thread.currentThread().getName()))
                .when(frontendRevalidator).revalidateWithoutAlert(anyString());

        transactionTemplate.executeWithoutResult(transactionStatus ->
                eventPublisher.publishEvent(new ClubPublicPageChangedEvent(7L)));

        assertThat(callingThreadName.get(ASYNC_WAIT_MS, TimeUnit.MILLISECONDS)).startsWith("frontend-revalidate-");
        // 리스너가 끝날 때까지 기다린 뒤 "상세 한 번, 그 밖의 호출 없음" 을 고정한다 — 목록(/clubs)·집계 경로 동반 호출을 잡는다.
        drainRevalidationExecutor();
        verify(frontendRevalidator).revalidateWithoutAlert("/clubs/7");
        verifyNoMoreInteractions(frontendRevalidator);
    }

    @Test
    @DisplayName("이벤트를 발행한 트랜잭션이 롤백되면 재생성을 요청하지 않는다(AFTER_COMMIT)")
    void rolledBackChangeDoesNotRequest() {
        transactionTemplate.executeWithoutResult(transactionStatus -> {
            eventPublisher.publishEvent(new ClubPublicPageChangedEvent(7L));
            transactionStatus.setRollbackOnly();
        });

        verify(frontendRevalidator, after(QUIET_WAIT_MS).never()).revalidateWithoutAlert(anyString());
    }

    /** 리스너가 구독하는 세 이벤트 — 핸들러마다 phase 를 따로 고정한다. 운영 이벤트 record 는 그대로 쓴다. */
    static Stream<Object> detailRevalidationEvents() {
        return Stream.of(
                new ClubPublicPageChangedEvent(7L),
                new ClubStatusChangedEvent(7L, "상세재생성동아리", ClubStatus.PENDING_APPROVAL, ClubStatus.ACTIVE, 1L),
                new ClubClosedEvent(7L, "상세재생성동아리", 1L));
    }

    // setRollbackOnly() 롤백은 beforeCommit 을 아예 부르지 않아 BEFORE_COMMIT 리스너도 안 불린다 — phase 를 고정하려면
    // 커밋 직전 단계에서 실패시킨다. 리스너 동기화가 먼저 등록되므로 BEFORE_COMMIT 이었다면 요청이 이미 나간다.
    // 롤백으로 끝나므로 AFTER_COMPLETION·AFTER_ROLLBACK 이었어도 요청이 나가 실패한다.
    @ParameterizedTest
    @MethodSource("detailRevalidationEvents")
    @DisplayName("커밋 직전 단계에서 실패해 롤백되면 세 이벤트 모두 재생성을 요청하지 않는다 — 커밋 전 발행이었다면 이미 나갔다")
    void failureBeforeCommitDoesNotRequest(Object detailRevalidationEvent) {
        assertThatThrownBy(() -> transactionTemplate.executeWithoutResult(transactionStatus -> {
            eventPublisher.publishEvent(detailRevalidationEvent);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void beforeCommit(boolean readOnly) {
                    throw new IllegalStateException("커밋 직전 실패");
                }
            });
        })).isInstanceOf(IllegalStateException.class);

        verify(frontendRevalidator, after(QUIET_WAIT_MS).never()).revalidateWithoutAlert(anyString());
    }

    @Test
    @DisplayName("상태 전이(승인·운영중단)와 폐쇄는 기존 운영 이벤트로 그 동아리 상세 재생성을 각각 요청하고, 목록(/clubs)은 부르지 않는다")
    void statusChangesAndClosureRequestDetailRevalidation() throws InterruptedException {
        ConcurrentLinkedQueue<String> callingThreadNames = new ConcurrentLinkedQueue<>();
        doAnswer(invocation -> callingThreadNames.add(Thread.currentThread().getName()))
                .when(frontendRevalidator).revalidateWithoutAlert(anyString());
        User admin = userRepository.save(UserFixture.admin());
        User leader = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(ClubFixture.academic("상세재생성상태동아리"));
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        clubService.updateStatus(new UpdateClubStatusCommand(club.getId(), ClubStatus.ACTIVE, null, admin.getId()));
        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS)).revalidateWithoutAlert(detailPathOf(club));

        clubService.updateStatus(new UpdateClubStatusCommand(club.getId(), ClubStatus.INACTIVE, null, admin.getId()));
        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS).times(2)).revalidateWithoutAlert(detailPathOf(club));

        clubClosureService.close(new CloseClubCommand(club.getId(), admin.getId(), "해체"));
        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS).times(3)).revalidateWithoutAlert(detailPathOf(club));
        drainRevalidationExecutor();
        verifyNoMoreInteractions(frontendRevalidator);
        // 상태 전이·폐쇄 핸들러도 전용 실행기에서 돈다 — @Async 가 빠지면 총동연 요청 스레드가 HTTP 대기를 떠안는다.
        assertThat(callingThreadNames).hasSize(3)
                .allSatisfy(threadName -> assertThat(threadName).startsWith("frontend-revalidate-"));
    }

    @Test
    @DisplayName("동아리 정보 수정은 리더 수정·총동연 수정 모두 그 동아리 상세 재생성을 요청한다")
    void profileUpdatesByLeaderAndAdminRequestDetailRevalidation() throws InterruptedException {
        User admin = userRepository.save(UserFixture.admin());
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveActiveClubLedBy(leader, "상세재생성수정동아리");

        clubService.update(taglineUpdate(club.getId(), leader.getId(), "리더가 고친 소개"));
        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS)).revalidateWithoutAlert(detailPathOf(club));

        clubService.updateAsAdmin(taglineUpdate(club.getId(), admin.getId(), "총동연이 고친 소개"));
        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS).times(2)).revalidateWithoutAlert(detailPathOf(club));
        drainRevalidationExecutor();
        verifyNoMoreInteractions(frontendRevalidator);
    }

    @Test
    @DisplayName("승인 대기 동아리의 정보 수정도 상세 재생성을 요청한다 — 페이지는 같은 셸을 다시 그릴 뿐이지만 거르지 않는다")
    void pendingClubProfileUpdateStillRequestsDetailRevalidation() throws InterruptedException {
        User leader = userRepository.save(UserFixture.unique());
        Club pendingClub = clubRepository.save(ClubFixture.academic("상세재생성대기동아리"));
        clubMemberRepository.save(ClubMember.asLeader(pendingClub, leader));

        clubService.update(taglineUpdate(pendingClub.getId(), leader.getId(), "보완한 소개"));

        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS)).revalidateWithoutAlert(detailPathOf(pendingClub));
        drainRevalidationExecutor();
        verifyNoMoreInteractions(frontendRevalidator);
    }

    @Test
    @DisplayName("중앙·학과 전환은 그 동아리 상세 재생성을 요청한다")
    void centralClubChangeRequestsDetailRevalidation() throws InterruptedException {
        Club club = clubRepository.save(ClubFixture.academic("상세재생성중앙동아리"));

        clubService.updateCentralClub(new UpdateClubCentralClubCommand(club.getId(), true));

        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS)).revalidateWithoutAlert(detailPathOf(club));
        drainRevalidationExecutor();
        verifyNoMoreInteractions(frontendRevalidator);
    }

    @Test
    @DisplayName("사진 등록·순서 변경·삭제·캡션 수정은 같은 동아리라도 하나씩 상세 재생성을 요청한다")
    void photoChangesIncludingCaptionRequestEach() throws InterruptedException {
        User leader = userRepository.save(UserFixture.unique());
        // 동아리 id 를 회장·사진 id 와 떼어 놓는다 — 테스트마다 id 가 1 부터라, 동아리 대신 요청자·사진 id 로 발행하는 변이가
        // 같은 경로(/clubs/1)로 가려진다.
        clubRepository.save(ClubFixture.academic("상세재생성미끼동아리1"));
        clubRepository.save(ClubFixture.academic("상세재생성미끼동아리2"));
        Club club = saveActiveClubLedBy(leader, "상세재생성사진동아리");

        Long firstPhotoId = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "first.jpg", "첫 사진", 100, 100)).id();
        Long secondPhotoId = clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), "second.jpg", "둘째 사진", 100, 100)).id();
        assertThat(club.getId()).isNotIn(leader.getId(), firstPhotoId, secondPhotoId);
        clubPhotoService.reorder(new ReorderClubPhotosCommand(club.getId(), leader.getId(), List.of(
                new PhotoOrder(secondPhotoId, 0), new PhotoOrder(firstPhotoId, 1))));
        clubPhotoService.delete(club.getId(), leader.getId(), firstPhotoId);
        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS).times(4)).revalidateWithoutAlert(detailPathOf(club));

        clubPhotoService.updateCaption(new UpdateClubPhotoCommand(
                club.getId(), leader.getId(), secondPhotoId, "고친 캡션"));
        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS).times(5)).revalidateWithoutAlert(detailPathOf(club));
        drainRevalidationExecutor();
        verifyNoMoreInteractions(frontendRevalidator);
    }
}
