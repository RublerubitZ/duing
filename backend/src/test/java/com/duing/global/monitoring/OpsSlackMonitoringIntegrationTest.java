package com.duing.global.monitoring;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubClosureService;
import com.duing.domain.club.service.ClubService;
import com.duing.domain.club.service.dto.command.CloseClubCommand;
import com.duing.domain.club.service.dto.command.CreateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.Bank;
import com.duing.domain.fee.service.FeeAccountService;
import com.duing.domain.fee.service.dto.command.UpsertFeeAccountCommand;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.AdminUserCommandService;
import com.duing.domain.user.service.UserService;
import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;
import com.duing.domain.user.service.dto.command.ForceLogoutCommand;
import com.duing.global.monitoring.event.UserRegisteredEvent;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 운영 Slack 알림의 end-to-end 계약 — 발행 지점 → AFTER_COMMIT → @Async 리스너 → 포매터 → SlackNotifier.
 * SlackNotifier 만 목으로 바꿔 "무엇이 전송되려 했는지" 와 "핵심 흐름이 Slack 실패와 무관한지" 를 고정한다.
 * 리스너는 별도 스레드라 verify(timeout)/after 로 기다린다. @MockitoBean 은 테스트마다 리셋되지만 executor 의
 * 진행 중 작업은 리셋되지 않으므로, 앞 테스트의 늦은 전송이 다음 테스트의 never()/times(1) 에 섞이지 않게
 * 각 테스트 시작 시 executor 를 드레인한 뒤 invocation 을 비운다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OpsSlackMonitoringIntegrationTest extends IntegrationTestBase {

    private static final long ASYNC_WAIT_MS = 3_000;
    private static final long QUIET_WAIT_MS = 700;

    @LocalServerPort int port;

    @MockitoBean SlackNotifier slackNotifier;

    @Autowired UserRepository userRepository;
    @Autowired PhoneVerificationRepository phoneVerificationRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;
    @Autowired ApplicationEventPublisher eventPublisher;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired UserService userService;
    @Autowired AdminUserCommandService adminUserCommandService;
    @Autowired ClubService clubService;
    @Autowired ClubClosureService clubClosureService;
    @Autowired FeeAccountService feeAccountService;
    @Autowired @Qualifier(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME) ThreadPoolTaskExecutor monitoringTaskExecutor;

    @BeforeEach
    void setUp() throws InterruptedException {
        RestAssured.port = port;
        drainMonitoringExecutor();
        clearInvocations(slackNotifier);
    }

    /** 앞 테스트가 남긴 비동기 전송이 끝날 때까지(활성 0·큐 비움) 최대 3초 기다린다. */
    private void drainMonitoringExecutor() throws InterruptedException {
        long deadline = System.currentTimeMillis() + ASYNC_WAIT_MS;
        while ((monitoringTaskExecutor.getActiveCount() > 0
                || !monitoringTaskExecutor.getThreadPoolExecutor().getQueue().isEmpty())
                && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
    }

    private String prepareVerifiedPhone(String phone) {
        LocalDateTime now = LocalDateTime.now(clock);
        PhoneVerification verification = PhoneVerification.issue(
                phone, UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null, now);
        verification.markVerified(now);
        return phoneVerificationRepository.save(verification).getToken();
    }

    private Map<String, Object> signupBody(String studentId, String verificationToken) {
        Map<String, Object> body = new HashMap<>();
        body.put("studentId", studentId);
        body.put("name", "홍길동");
        body.put("password", "Abcd1234!");
        body.put("grade", "JUNIOR");
        body.put("college", "IT_ENGINEERING");
        body.put("major", "컴퓨터정보공학부");
        body.put("verificationToken", verificationToken);
        body.put("termsOfServiceAgreed", true);
        body.put("privacyPolicyAgreed", true);
        return body;
    }

    @Test
    @DisplayName("회원가입이 커밋되면 이름·학번·UserId·환경·KST 시간·Octomo 자체 집계가 담긴 USER_REGISTERED 메시지가 Slack 으로 간다 — 전화번호·비밀번호는 없다")
    void signupSendsUserRegisteredMessage() {
        Long userId = given().contentType(ContentType.JSON).body(signupBody("20240001", prepareVerifiedPhone("010-1234-5678")))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        ArgumentCaptor<String> messageCaptor = ArgumentCaptor.forClass(String.class);
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(messageCaptor.capture());
        String message = messageCaptor.getValue();
        assertThat(message)
                .contains("🟢 신규 회원 가입", "이벤트: USER_REGISTERED", "이름: 홍길동", "학번: 20240001",
                        "UserId: " + userId, "환경: ", " KST", "Octomo 호출(자체 집계, 오늘): ")
                .doesNotContain("010-1234-5678", "01012345678", "Abcd1234!", "이메일", "Bearer ");
    }

    @Test
    @DisplayName("중복 학번 가입(409)은 롤백되므로 Slack 메시지가 추가로 가지 않는다 — 첫 가입 1건만")
    void duplicateSignupDoesNotNotify() {
        given().contentType(ContentType.JSON).body(signupBody("20240001", prepareVerifiedPhone("010-1234-5678")))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(anyString());

        given().contentType(ContentType.JSON).body(signupBody("20240001", prepareVerifiedPhone("010-9999-0000")))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CONFLICT.value());

        verify(slackNotifier, after(QUIET_WAIT_MS).times(1)).send(anyString());
    }

    @Test
    @DisplayName("이벤트를 발행한 트랜잭션이 롤백되면 리스너는 호출되지 않는다(AFTER_COMMIT)")
    void rolledBackTransactionDoesNotNotify() {
        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
        transactionTemplate.executeWithoutResult(status -> {
            eventPublisher.publishEvent(new UserRegisteredEvent(1L, "20240001", "홍길동", LocalDateTime.now(clock)));
            status.setRollbackOnly();
        });

        verify(slackNotifier, after(QUIET_WAIT_MS).never()).send(anyString());
    }

    @Test
    @DisplayName("Slack 전송기가 예외를 던져도 회원가입은 201 로 성공하고 사용자는 저장된다 — Slack 장애는 핵심 서비스와 격리된다")
    void slackFailureDoesNotAffectSignup() {
        doThrow(new IllegalStateException("slack down")).when(slackNotifier).send(anyString());

        Long userId = given().contentType(ContentType.JSON).body(signupBody("20240002", prepareVerifiedPhone("010-2222-3333")))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        assertThat(userRepository.findById(userId)).isPresent();
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(anyString());
    }

    @Test
    @DisplayName("동아리 생성·승인·폐쇄는 각각 CLUB_CREATED·CLUB_STATUS_CHANGED·CLUB_CLOSED 메시지를 낸다")
    void clubLifecycleNotifies() {
        User leader = userRepository.save(UserFixture.unique());
        User admin = userRepository.save(UserFixture.unique());

        Long clubId = clubService.create(new CreateClubCommand(
                "두잉운영동아리", ClubCategory.ACADEMIC, null, "설명", null,
                leader.getId(), false, null, null));
        ArgumentCaptor<String> createdCaptor = ArgumentCaptor.forClass(String.class);
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(createdCaptor.capture());
        assertThat(createdCaptor.getValue()).contains("이벤트: CLUB_CREATED", "동아리: 두잉운영동아리",
                "ClubId: " + clubId, "회장 UserId: " + leader.getId());

        clubService.updateStatus(new UpdateClubStatusCommand(clubId, ClubStatus.ACTIVE, null, admin.getId()));
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(contains("상태: PENDING_APPROVAL → ACTIVE"));

        clubService.updateStatus(new UpdateClubStatusCommand(clubId, ClubStatus.INACTIVE, null, admin.getId()));
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(contains("상태: ACTIVE → INACTIVE"));

        clubClosureService.close(new CloseClubCommand(clubId, admin.getId(), "해체"));
        ArgumentCaptor<String> closedCaptor = ArgumentCaptor.forClass(String.class);
        verify(slackNotifier, timeout(ASYNC_WAIT_MS).atLeast(4)).send(closedCaptor.capture());
        assertThat(closedCaptor.getAllValues()).anySatisfy(message ->
                assertThat(message).contains("이벤트: CLUB_CLOSED", "ClubId: " + clubId).doesNotContain("해체"));
    }

    @Test
    @DisplayName("회비 계좌는 최초 등록에만 FEE_ACCOUNT_CREATED 를 내고, 같은 값 재저장·갱신에는 내지 않으며 계좌번호·예금주는 싣지 않는다")
    void feeAccountCreatedNotifiesOnlyOnFirstRegistration() {
        Club club = clubRepository.save(ClubFixture.academic("회비동아리"));
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", club.getId());

        feeAccountService.upsert(new UpsertFeeAccountCommand(club.getId(), leader.getId(), Bank.KB, "111-222-333333", "홍예금주"));
        ArgumentCaptor<String> messageCaptor = ArgumentCaptor.forClass(String.class);
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(messageCaptor.capture());
        assertThat(messageCaptor.getValue())
                .contains("이벤트: FEE_ACCOUNT_CREATED", "ClubId: " + club.getId(), "은행: KB")
                .doesNotContain("111-222-333333", "홍예금주");

        feeAccountService.upsert(new UpsertFeeAccountCommand(club.getId(), leader.getId(), Bank.KB, "111-222-333333", "홍예금주"));
        feeAccountService.upsert(new UpsertFeeAccountCommand(club.getId(), leader.getId(), Bank.NH, "444-555-666666", "홍예금주"));
        verify(slackNotifier, after(QUIET_WAIT_MS).times(1)).send(anyString());
    }

    @Test
    @DisplayName("관리자 정지·해제·강제 로그아웃은 ADMIN_USER_ACTION 메시지를 내고 사유는 싣지 않는다")
    void adminUserActionsNotify() {
        User admin = userRepository.save(UserFixture.admin());
        User target = userRepository.save(UserFixture.unique());

        adminUserCommandService.changeStatus(new ChangeUserStatusCommand(target.getId(), admin.getId(), UserStatus.SUSPENDED, "욕설 신고 3건"));
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(contains("조치: ACCOUNT_SUSPENDED"));

        adminUserCommandService.changeStatus(new ChangeUserStatusCommand(target.getId(), admin.getId(), UserStatus.ACTIVE, "소명 완료"));
        verify(slackNotifier, timeout(ASYNC_WAIT_MS)).send(contains("조치: ACCOUNT_UNSUSPENDED"));

        userService.forceLogout(new ForceLogoutCommand(target.getId(), admin.getId()));
        // timeout + times(3): 세 번째 비동기 전송이 도착할 때까지 재검증한다(캡처는 3건이 모두 모인 뒤 읽는다).
        ArgumentCaptor<String> messageCaptor = ArgumentCaptor.forClass(String.class);
        verify(slackNotifier, timeout(ASYNC_WAIT_MS).times(3)).send(messageCaptor.capture());
        assertThat(messageCaptor.getAllValues())
                .anySatisfy(message -> assertThat(message).contains("조치: FORCE_LOGOUT", "대상 UserId: " + target.getId()))
                .allSatisfy(message -> assertThat(message).doesNotContain("욕설 신고", "소명 완료"));
    }
}
