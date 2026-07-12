package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.QuestionType;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.RecruitmentService;
import com.duing.domain.recruitment.service.dto.command.QuestionItemCommand;
import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 지원 제출(FOR SHARE)과 질문 변경(FOR UPDATE)의 폼 행 잠금 직렬화를 검증한다.
 *
 * <p>경합 창을 확률에 맡기지 않고 정확히 재현하기 위해, 제출 스레드는 서비스 호출을
 * 테스트가 소유한 트랜잭션 안에서 실행한다({@code submit()} 의 REQUIRED 전파가 합류한다).
 * 그러면 "지원서 INSERT 는 이미 실행됐지만 아직 커밋되지 않은" 상태에서 스레드를 멈춰 세울 수 있고,
 * 그 순간 질문 변경 스레드를 출발시키면 운영 코드가 실제로 겪는 순서
 * (제출이 질문을 읽음 → 질문 변경이 지원자 수를 셈 → 제출이 커밋됨) 를 그대로 만들 수 있다.
 * 잠금이 없으면 질문 변경은 지원자 0명을 보고 질문을 새 UUID 로 교체하며, 뒤이어 커밋되는
 * 지원서의 답변은 사라진 질문 id 를 가리키게 된다.
 *
 * <p>@DirtiesContext 는 두지 않는다 — IntegrationTestBase.cleanDatabase() 가 매 실행 전 DB 를
 * 초기화하고, 동시성 테스트는 별도 트랜잭션에서 동작하므로 truncate 전략을 쓴다
 * (ApplicationSubmitConcurrencyTest 와 동일 전제).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ApplicationSubmitQuestionChangeConcurrencyTest extends IntegrationTestBase {

    /**
     * 제출 트랜잭션이 커밋을 미루는 시간. 질문 변경 스레드가 (잠금 없이는) 지원자 수를 세고 질문을
     * 교체·커밋하기에 충분하고, (잠금이 있으면) 배타 잠금 대기로 소진되는 시간이다.
     */
    private static final Duration COMMIT_DELAY_AFTER_QUESTION_CHANGE_STARTED = Duration.ofMillis(500);
    private static final long LATCH_TIMEOUT_SECONDS = 15;
    private static final long TASK_TIMEOUT_SECONDS = 30;
    private static final String ORIGINAL_QUESTION_TEXT = "지원 동기는 무엇인가요?";

    @Autowired ApplicationService applicationService;
    @Autowired RecruitmentService recruitmentService;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired TransactionTemplate transactionTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());
    private ExecutorService executor;

    @AfterEach
    void tearDown() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    @Test
    @DisplayName("지원 제출과 질문 변경이 동시에 일어나도 저장된 답변은 항상 현재 질문을 가리킨다")
    void concurrentSubmitAndQuestionChangeNeverLeaveAnswersPointingAtRemovedQuestions() throws Exception {
        Club club = saveActiveClub("질문변경경합동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        User applicant = saveUser("지원자");
        Recruitment recruitment = saveSelfRecruitmentWithSingleTextQuestion(club, ORIGINAL_QUESTION_TEXT);

        SubmitApplicationCommand submitCommand = new SubmitApplicationCommand(
                recruitment.getId(), applicant.getId(), List.of("동아리 활동에 참여하고 싶습니다."), null);
        UpdateRecruitmentCommand questionChangeCommand = new UpdateRecruitmentCommand(
                recruitment.getId(), leader.getId(), null, null, null, null, null, null,
                List.of("가장 자신 있는 활동은 무엇인가요?"), null, null, null, null);

        CountDownLatch submitInserted = new CountDownLatch(1);
        CountDownLatch questionChangeStarted = new CountDownLatch(1);
        executor = Executors.newFixedThreadPool(2);

        Future<Throwable> submitOutcome = executor.submit(
                () -> runSubmitDelayingCommit(submitCommand, submitInserted, questionChangeStarted));
        Future<Throwable> questionChangeOutcome = executor.submit(
                () -> runQuestionChangeOnceSubmitInserted(questionChangeCommand, submitInserted, questionChangeStarted));

        Throwable submitFailure = submitOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        Throwable questionChangeFailure = questionChangeOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS);

        // 핵심 불변식: 저장된 답변은 언제나 현재 폼 질문 중 하나를 가리킨다. 이 단언이 깨지면
        // 운영진 화면에서 답변이 전부 빈 문자열로 보이고, 지원자가 쓴 내용이 사라진 것처럼 나타난다.
        List<String> currentQuestionIds = readCurrentQuestionIds(recruitment.getId());
        List<ApplicationAnswer> storedAnswers = readStoredAnswers(recruitment.getId());
        assertThat(storedAnswers).allSatisfy(storedAnswer ->
                assertThat(currentQuestionIds)
                        .as("저장된 답변이 사라진 질문 id 를 가리켜서는 안 된다")
                        .contains(storedAnswer.questionId()));

        // 위 불변식을 깨는 유일한 조합 — 제출이 커밋되기 전에 지원자 수를 센 질문 변경이 함께 성공하는 것 —
        // 이 애초에 일어나지 않아야 한다. 두 작업 중 한쪽은 반드시 진다.
        assertThat(submitFailure == null && questionChangeFailure == null)
                .as("제출 커밋 전에 시작된 질문 변경이 제출과 함께 성공해서는 안 된다")
                .isFalse();

        // 관찰된 결말: 제출이 공유 잠금을 먼저 잡으므로 제출이 이기고, 질문 변경은 배타 잠금을 기다렸다가
        // 지원자 수를 다시 읽어 409 로 거절된다.
        assertThat(submitFailure).as("공유 잠금을 먼저 잡은 제출은 성공한다").isNull();
        assertThat(questionChangeFailure)
                .as("질문 변경은 제출 커밋을 기다린 뒤 지원자 수를 다시 읽어 거절된다")
                .isInstanceOf(RecruitmentException.QuestionsNotEditableWithApplicationsException.class);
        assertThat(applicationRepository.countByRecruitmentId(recruitment.getId()))
                .as("지원서는 1건 저장된다").isEqualTo(1);
        assertThat(storedAnswers).as("저장된 답변은 질문 1개 분량").hasSize(1);
    }

    @Test
    @DisplayName("서로 다른 지원자의 동시 제출은 공유 잠금이라 서로를 막지 않고 둘 다 저장된다")
    void concurrentSubmissionsFromDifferentApplicantsDoNotBlockEachOther() throws Exception {
        Club club = saveActiveClub("동시제출공유잠금동아리");
        User firstApplicant = saveUser("지원자1");
        User secondApplicant = saveUser("지원자2");
        Recruitment recruitment = saveSelfRecruitmentWithSingleTextQuestion(club, ORIGINAL_QUESTION_TEXT);

        // 두 스레드 모두 "제출 완료(잠금 획득 + INSERT) → 상대가 같은 지점에 도달할 때까지 대기 → 커밋" 순으로 움직인다.
        // 폼 잠금이 배타적이었다면 뒤늦은 스레드가 submit() 안에서 막혀 래치를 내리지 못하고,
        // 먼저 도착한 스레드가 대기 타임아웃으로 터진다. 공유 잠금이라야 둘 다 이 지점을 통과한다.
        CountDownLatch bothSubmitted = new CountDownLatch(2);
        executor = Executors.newFixedThreadPool(2);

        Future<Throwable> firstOutcome = executor.submit(() -> runSubmitAwaitingPeer(
                new SubmitApplicationCommand(recruitment.getId(), firstApplicant.getId(), List.of("첫 번째 답변"), null),
                bothSubmitted));
        Future<Throwable> secondOutcome = executor.submit(() -> runSubmitAwaitingPeer(
                new SubmitApplicationCommand(recruitment.getId(), secondApplicant.getId(), List.of("두 번째 답변"), null),
                bothSubmitted));

        assertThat(firstOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS))
                .as("첫 번째 제출은 두 번째 제출에 막히지 않는다").isNull();
        assertThat(secondOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS))
                .as("두 번째 제출은 첫 번째 제출에 막히지 않는다").isNull();
        assertThat(applicationRepository.countByRecruitmentId(recruitment.getId()))
                .as("두 지원서가 모두 저장된다").isEqualTo(2);
    }

    @Test
    @DisplayName("다른 운영진이 질문을 교체한 뒤 들어온 지원서는 옛 질문 목록을 든 운영진의 수정 시도에도 답변이 고아가 되지 않는다")
    void staleQuestionSnapshotFromAnotherManagerNeverOrphansCommittedAnswers() throws Exception {
        StaleSnapshotFixture fixture = prepareStaleSnapshotFixture("옛질문복원동아리");
        AtomicReference<Throwable> staleUpdateFailure = new AtomicReference<>();

        transactionTemplate.executeWithoutResult(staleManagerTransaction -> {
            // 옛 질문 목록을 이 트랜잭션의 1차 캐시에 올린다. 뒤이은 update() 의 findById 는 이 인스턴스를
            // 재사용하므로, 운영진이 낡은 화면을 열어둔 채 수정 버튼을 누른 상황과 같아진다.
            recruitmentRepository.findById(fixture.recruitmentId()).orElseThrow();
            replaceQuestionsAndSubmitInSeparateTransactions(fixture);

            // 이미 사라진 질문 id 를 되살리는 수정 — 질문이 실제로 바뀌므로 잠금 획득 뒤의 지원자 수 확인이 실행된다.
            try {
                recruitmentService.update(new UpdateRecruitmentCommand(
                        fixture.recruitmentId(), fixture.secondManagerId(), null, null, null, null, null, null,
                        null,
                        List.of(new QuestionItemCommand(fixture.originalQuestionId(),
                                "지원 동기를 더 자세히 적어주세요.", QuestionType.TEXT, true, List.of())),
                        null, null, null));
            } catch (RuntimeException blockedByApplicants) {
                staleUpdateFailure.set(blockedByApplicants);
                staleManagerTransaction.setRollbackOnly();
            }
        });

        assertThat(staleUpdateFailure.get())
                .as("잠금 획득 뒤 다시 읽은 지원자 수가 옛 질문 목록 기반의 질문 교체를 막는다")
                .isInstanceOf(RecruitmentException.QuestionsNotEditableWithApplicationsException.class);
        assertStoredAnswersPointAtCurrentQuestions(fixture);
    }

    @Test
    @DisplayName("옛 질문 목록을 그대로 재전송하는 수정은 질문을 되돌리지 않아 이미 제출된 답변이 살아남는다")
    void resendingStaleQuestionsUnchangedNeverRewritesReplacedQuestions() throws Exception {
        StaleSnapshotFixture fixture = prepareStaleSnapshotFixture("옛질문재전송동아리");

        transactionTemplate.executeWithoutResult(staleManagerTransaction -> {
            recruitmentRepository.findById(fixture.recruitmentId()).orElseThrow();
            replaceQuestionsAndSubmitInSeparateTransactions(fixture);

            // 옛 질문 목록을 문구까지 똑같이 재전송한다. "변경 없음" 으로 판정되어 지원자 수 확인을 건너뛰지만,
            // 재대입되는 값이 이 트랜잭션이 적재한 값과 동일해 Hibernate 가 UPDATE 자체를 내지 않는다.
            // 이 성질이 깨지면(예: 질문 컬럼이 항상 dirty 로 판정되면) 교체된 질문이 되살아나
            // 이미 제출된 답변이 사라진 질문 id 를 가리키게 된다.
            recruitmentService.update(new UpdateRecruitmentCommand(
                    fixture.recruitmentId(), fixture.secondManagerId(), null, null, null, null, null, null,
                    List.of(ORIGINAL_QUESTION_TEXT), null, null, null, null));
        });

        assertThat(readCurrentQuestionIds(fixture.recruitmentId()))
                .as("교체된 질문이 옛 질문으로 되돌아가지 않는다")
                .doesNotContain(fixture.originalQuestionId());
        assertStoredAnswersPointAtCurrentQuestions(fixture);
    }

    /** 옛 질문 목록 경합의 공통 준비 — 운영진 2명, 지원자 1명, 질문 1개짜리 SELF·OPEN 모집. */
    private StaleSnapshotFixture prepareStaleSnapshotFixture(String clubName) throws Exception {
        Club club = saveActiveClub(clubName);
        User firstManager = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, firstManager));
        User secondManager = saveUser("운영진");
        clubMemberRepository.save(ClubMember.of(club, secondManager, ClubMemberRole.OFFICER));
        User applicant = saveUser("지원자");
        Recruitment recruitment = saveSelfRecruitmentWithSingleTextQuestion(club, ORIGINAL_QUESTION_TEXT);
        Long recruitmentId = recruitment.getId();
        return new StaleSnapshotFixture(recruitmentId, readCurrentQuestionIds(recruitmentId).get(0),
                firstManager.getId(), secondManager.getId(), applicant.getId());
    }

    /**
     * 옛 질문 목록을 든 트랜잭션이 열려 있는 동안, 다른 운영진이 질문을 새 id 로 교체하고
     * 지원자가 그 새 질문 기준으로 답변을 제출한다. 둘 다 별도 스레드·트랜잭션에서 커밋된다.
     */
    private void replaceQuestionsAndSubmitInSeparateTransactions(StaleSnapshotFixture fixture) {
        runInSeparateTransaction(() -> recruitmentService.update(new UpdateRecruitmentCommand(
                fixture.recruitmentId(), fixture.firstManagerId(), null, null, null, null, null, null,
                List.of("가장 자신 있는 활동은 무엇인가요?"), null, null, null, null)));
        runInSeparateTransaction(() -> applicationService.submit(new SubmitApplicationCommand(
                fixture.recruitmentId(), fixture.applicantId(), List.of("동아리 활동에 참여하고 싶습니다."), null)));
    }

    private void assertStoredAnswersPointAtCurrentQuestions(StaleSnapshotFixture fixture) {
        List<String> currentQuestionIds = readCurrentQuestionIds(fixture.recruitmentId());
        assertThat(readStoredAnswers(fixture.recruitmentId())).isNotEmpty().allSatisfy(storedAnswer ->
                assertThat(currentQuestionIds)
                        .as("저장된 답변이 사라진 질문 id 를 가리켜서는 안 된다")
                        .contains(storedAnswer.questionId()));
    }

    /** 호출 스레드의 트랜잭션과 겹치지 않도록 별도 스레드에서 실행하고 커밋을 기다린다. */
    private void runInSeparateTransaction(Runnable action) {
        try {
            Executors.newSingleThreadExecutor().submit(action).get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("보조 트랜잭션 대기가 중단되었습니다.", interrupted);
        } catch (Exception failure) {
            throw new IllegalStateException("보조 트랜잭션이 실패했습니다.", failure);
        }
    }

    private record StaleSnapshotFixture(Long recruitmentId, String originalQuestionId,
                                        Long firstManagerId, Long secondManagerId, Long applicantId) {}

    /** 제출을 마친 뒤 상대 스레드도 제출을 마칠 때까지 공유 잠금을 쥔 채 대기하다가 커밋한다. */
    private Throwable runSubmitAwaitingPeer(SubmitApplicationCommand submitCommand, CountDownLatch bothSubmitted) {
        try {
            transactionTemplate.executeWithoutResult(transactionStatus -> {
                applicationService.submit(submitCommand);
                bothSubmitted.countDown();
                awaitOrThrow(bothSubmitted);
            });
            return null;
        } catch (Throwable submitFailure) {
            return submitFailure;
        }
    }

    /**
     * 제출을 테스트 소유 트랜잭션 안에서 실행해, INSERT 이후·커밋 이전 지점에서 멈춘다.
     * 질문 변경 스레드가 출발한 뒤에야 커밋하므로, 운영 코드의 경합 창이 매번 동일하게 열린다.
     */
    private Throwable runSubmitDelayingCommit(SubmitApplicationCommand submitCommand,
                                              CountDownLatch submitInserted,
                                              CountDownLatch questionChangeStarted) {
        try {
            transactionTemplate.executeWithoutResult(transactionStatus -> {
                applicationService.submit(submitCommand);
                submitInserted.countDown();
                awaitOrThrow(questionChangeStarted);
                sleepQuietly(COMMIT_DELAY_AFTER_QUESTION_CHANGE_STARTED);
            });
            return null;
        } catch (Throwable submitFailure) {
            return submitFailure;
        }
    }

    private Throwable runQuestionChangeOnceSubmitInserted(UpdateRecruitmentCommand questionChangeCommand,
                                                          CountDownLatch submitInserted,
                                                          CountDownLatch questionChangeStarted) {
        try {
            awaitOrThrow(submitInserted);
            questionChangeStarted.countDown();
            recruitmentService.update(questionChangeCommand);
            return null;
        } catch (Throwable questionChangeFailure) {
            return questionChangeFailure;
        }
    }

    private List<String> readCurrentQuestionIds(Long recruitmentId) {
        return transactionTemplate.execute(transactionStatus ->
                recruitmentRepository.findById(recruitmentId).orElseThrow()
                        .getForm().getQuestions().stream()
                        .map(RecruitmentQuestion::id)
                        .toList());
    }

    private List<ApplicationAnswer> readStoredAnswers(Long recruitmentId) {
        return transactionTemplate.execute(transactionStatus ->
                applicationRepository.findByRecruitmentIdOrderByCreatedAtAsc(recruitmentId).stream()
                        .map(Application::getAnswers)
                        .flatMap(List::stream)
                        .toList());
    }

    private static void awaitOrThrow(CountDownLatch latch) {
        try {
            if (!latch.await(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                throw new IllegalStateException("동시성 테스트 래치가 시간 내에 열리지 않았습니다.");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("동시성 테스트 래치 대기가 중단되었습니다.", interrupted);
        }
    }

    private static void sleepQuietly(Duration duration) {
        try {
            Thread.sleep(duration.toMillis());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("동시성 테스트 커밋 지연이 중단되었습니다.", interrupted);
        }
    }

    private Recruitment saveSelfRecruitmentWithSingleTextQuestion(Club club, String questionText) {
        Recruitment recruitment = Recruitment.create(club, "질문변경경합모집", null,
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10);
        recruitment.attachForm(RecruitmentForm.create(
                recruitment, List.of(RecruitmentQuestion.createText(questionText))));
        return recruitmentRepository.save(recruitment);
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
