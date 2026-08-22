package com.duing.domain.user.service;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.AdminUserActionLog;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.SessionRevokeReason;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.exception.PhoneVerificationException;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.ChangePasswordCommand;
import com.duing.domain.user.service.dto.command.ChangePhoneCommand;
import com.duing.domain.user.service.dto.command.ForceLogoutCommand;
import com.duing.domain.user.service.dto.command.IssueSessionCommand;
import com.duing.domain.user.service.dto.command.LoginCommand;
import com.duing.domain.user.service.dto.command.LoginContext;
import com.duing.domain.user.service.dto.command.ResetPasswordCommand;
import com.duing.domain.user.service.dto.command.SignupCommand;
import com.duing.domain.user.service.dto.command.UpdateProfileCommand;
import com.duing.domain.user.service.dto.query.IssuedSession;
import com.duing.domain.user.service.dto.query.LoginResult;
import com.duing.domain.user.service.dto.query.UserQuery;
import com.duing.domain.user.service.dto.query.UserSearchResultQuery;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.exception.PostgresConstraintViolations;
import com.duing.global.persistence.LikeEscapes;
import com.duing.global.web.SortWhitelist;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@Slf4j
public class GeneralUserService implements UserService {

    // V18 partial unique. (student_id) WHERE deleted_at IS NULL.
    private static final String USERS_STUDENT_ID_UNIQUE_CONSTRAINT = "uk_users_student_id_active";
    // V19 partial unique. (phone) WHERE deleted_at IS NULL AND phone <> '010-0000-0000'(플레이스홀더).
    private static final String USERS_PHONE_UNIQUE_CONSTRAINT = "ux_users_phone";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final LoginAttemptRateLimiter loginAttemptRateLimiter;
    private final AuthSessionService authSessionService;
    private final ClubMemberRepository clubMemberRepository;
    private final AdminUserActionLogRepository adminUserActionLogRepository;
    private final PhoneVerificationSessionManager phoneVerificationSessionManager;
    private final Clock clock;
    private final ReservedNamePolicy reservedNamePolicy = new ReservedNamePolicy();

    private static final int MAX_FAILED_LOGIN_ATTEMPTS = 5;
    private static final Duration LOGIN_LOCK_DURATION = Duration.ofMinutes(15);

    // 존재하지 않는 학번 분기의 BCrypt 타이밍 평탄화용 더미 해시 (지연 초기화, 비밀 아님).
    private volatile String dummyPasswordHash;

    @Override
    @Transactional
    public Long signup(SignupCommand signupCommand, String clientIp, String userAgent) {
        // 금칙어(400)는 순수 입력 검증이므로 세션 검증(403)·중복(409)보다 먼저 거른다 — 노출되는 정보가 없다.
        reservedNamePolicy.validate(signupCommand.name());

        // 가입 한 건의 시각 필드(세션 판정·phoneVerifiedAt·termsAgreedAt)가 서로 다른 기준을 갖지 않도록
        // 단일 now 를 쓴다. 세션 만료·완료 창 판정은 발급(seoulClock) 과 같은 기준이어야 한다 (prod JVM 은 UTC).
        LocalDateTime now = LocalDateTime.now(clock);

        // 세션 검증(403)을 중복(409)보다 먼저 둔다 — 전화번호가 세션에서 나오므로 순서상 선행이 필수이고,
        // 유효한 인증 없이는 가입 여부(409)를 응답으로 노출하지 않는다 (spec §7.3). 행잠금은 같은 토큰의
        // 동시 가입(이중 소비)을 직렬화한다.
        PhoneVerification verifiedSession = phoneVerificationSessionManager
                .getVerifiedSessionForUpdate(signupCommand.verificationToken(), VerificationPurpose.SIGNUP, now);
        String verifiedPhone = verifiedSession.getPhone();

        // 발급 시점의 existsByPhone(409)은 UX 안내일 뿐 — 인증~가입 사이 창에서 생긴 중복은 여기서
        // 재검증한다(TOCTOU). 최종 방어는 uk_users_student_id_active·ux_users_phone 유니크 인덱스.
        if (userRepository.existsByStudentId(signupCommand.studentId())
                || userRepository.existsByPhone(verifiedPhone)) {
            throw new UserException.DuplicateAccountException();
        }
        // 위 재검증조차 함께 통과한 진짜 동시 가입은 아래 save 의 로컬 catch 가 같은 409 로 수렴시킨다.

        String passwordHash = passwordEncoder.encode(signupCommand.rawPassword());
        User user = User.create(
                signupCommand.studentId(),
                signupCommand.name(),
                passwordHash,
                UserRole.STUDENT,
                signupCommand.grade(),
                signupCommand.college(),
                signupCommand.major(),
                verifiedPhone,
                now
        );
        user.markPhoneVerified(now);
        Long userId;
        try {
            userId = userRepository.save(user).getId();
            userRepository.flush();
        } catch (DataIntegrityViolationException racedSignup) {
            if (!isDuplicateAccountViolation(racedSignup)) {
                throw racedSignup;
            }
            // 인증~가입 창의 TOCTOU 경합 — 사전 재검증과 같은 409 로 치환만 한다.
            // 23505 로 트랜잭션이 aborted 라 세션 소비 등 후속 작업은 불가능하다(#921).
            throw new UserException.DuplicateAccountException();
        }
        phoneVerificationSessionManager.consume(verifiedSession, userId, clientIp, userAgent);
        return userId;
    }

    // 비밀번호 불일치 시 실패 카운터 증가(엔티티 변경)를 커밋해야 하므로 InvalidCredentials 는
    // 롤백 대상에서 제외한다 — 기본 롤백이면 잠금 카운트가 매번 0으로 되돌아가 잠금이 동작하지 않는다.
    // 나머지 인증 예외는 엔티티 변경이 없지만, 향후 흐름 변경에 대비해 함께 롤백 제외로 둔다.
    @Override
    @Transactional(noRollbackFor = {
            UserException.InvalidCredentialsException.class,
            UserException.AccountLockedException.class,
            UserException.TooManyLoginAttemptsException.class,
            UserException.AccountSuspendedException.class
    })
    public LoginResult login(LoginCommand loginCommand, LoginContext loginContext) {
        LocalDateTime now = LocalDateTime.now();
        // IP 단위 실패 제한(credential stuffing/spraying) — 계정 조회 이전에, 이미 실패 한도를 넘긴 IP 를
        // 차단한다. 성공 로그인은 세지 않으므로 공유 IP(교내 NAT) 의 정상 사용자는 막히지 않는다.
        loginAttemptRateLimiter.assertWithinLimit(loginContext.clientIp(), now);

        // 같은 계정에 대한 동시 실패가 실패 카운터 증가를 덮어쓰지 않도록 행을 잠그고 조회한다.
        User user = userRepository.findByStudentIdForUpdate(loginCommand.studentId()).orElse(null);
        if (user == null) {
            // 존재하지 않는 학번도 BCrypt 비교 비용을 동일하게 소비해 타이밍 기반 학번 열거를 막는다.
            burnPasswordComparison(loginCommand.rawPassword());
            loginAttemptRateLimiter.recordFailureOrThrow(loginContext.clientIp(), now);
            throw new UserException.InvalidCredentialsException();
        }

        // 잠긴 계정에 대한 시도도 IP 실패로 센다. 세지 않으면 공격자가 계정 하나를 잠근 뒤 그 계정을
        // 무한히 두드려 IP 볼륨 제한을 완전히 우회할 수 있다(무료 프로브). 계정 카운터(recordFailedLogin)는
        // 이미 잠긴 계정을 다시 잠글 필요가 없어 건드리지 않고, IP 윈도우에만 실패로 기록한다.
        if (user.isLocked(now)) {
            loginAttemptRateLimiter.recordFailureOrThrow(loginContext.clientIp(), now);
            throw new UserException.AccountLockedException();
        }

        if (!passwordEncoder.matches(loginCommand.rawPassword(), user.getPasswordHash())) {
            user.recordFailedLogin(MAX_FAILED_LOGIN_ATTEMPTS, LOGIN_LOCK_DURATION, now);
            loginAttemptRateLimiter.recordFailureOrThrow(loginContext.clientIp(), now);
            throw new UserException.InvalidCredentialsException();
        }

        // 정지 검사는 반드시 비밀번호 검증 뒤에 둔다 — 앞에 두면 학번만 아는 제3자가 로그인 시도만으로
        // "이 계정은 정지 상태"를 알아낼 수 있다(계정 열거 + 상태 노출).
        if (!user.isActive()) {
            throw new UserException.AccountSuspendedException();
        }

        user.recordSuccessfulLogin(now);
        // 세션 발급은 이 트랜잭션의 user 행잠금 안 — LRU 상한 계산의 동시성 보호 전제 (spec §13)
        IssuedSession issuedSession = authSessionService.issue(new IssueSessionCommand(
                user.getId(), loginContext.platform(), loginContext.deviceLabel(),
                loginContext.userAgent(), loginContext.clientIp(), loginContext.rememberMe()));
        String accessToken = jwtTokenProvider.createToken(
                user.getId(), user.getRole().name(), user.getTokenVersion(), issuedSession.sessionId());
        return new LoginResult(accessToken, issuedSession.refreshToken(), UserQuery.from(user));
    }

    /** 존재하지 않는 학번 분기에서도 BCrypt 비교 비용을 소비해 타이밍 오라클을 제거한다. */
    private void burnPasswordComparison(String rawPassword) {
        String hash = dummyPasswordHash;
        if (hash == null) {
            hash = passwordEncoder.encode("login-timing-equalizer");
            dummyPasswordHash = hash;
        }
        passwordEncoder.matches(rawPassword, hash);
    }

    @Override
    @Transactional
    public void logout(Long userIdOrNull, String rawRefreshTokenOrNull, Long sessionIdOrNull) {
        boolean sessionRevoked =
                authSessionService.revokeCurrent(userIdOrNull, rawRefreshTokenOrNull, sessionIdOrNull);
        if (sessionRevoked) {
            return; // 현재 기기만 로그아웃 — tokenVersion 불변 (spec §13.2)
        }
        if (userIdOrNull == null) {
            return; // 식별 수단 없음(만료 쿠키 등) — 멱등 무시
        }
        // 전환기 폴백: 세션 없는 구 토큰 사용자는 기존 의미(전 기기 무효화)로 처리한다.
        // 동시 로그아웃의 token_version lost update 를 막기 위해 행을 잠그고 조회한다(changePassword/withdraw 와 동일).
        User user = userRepository.findByIdForUpdate(userIdOrNull)
                .orElseThrow(UserException.UserNotFoundException::new);
        user.bumpTokenVersion();
    }

    @Override
    @Transactional
    public void logoutAll(Long userId) {
        // 범프의 lost update 방지 — 행잠금 후 세션 일괄 폐기(기존 자격 변경 경로와 동일 순서)
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(UserException.UserNotFoundException::new);
        user.bumpTokenVersion();
        authSessionService.revokeAll(userId, SessionRevokeReason.LOGOUT_ALL);
    }

    @Override
    @Transactional
    public void forceLogout(ForceLogoutCommand forceLogoutCommand) {
        // 관리자가 대상 사용자의 모든 토큰을 즉시 무효화한다 — logout 과 동일하게 행을 잠가
        // token_version lost update 를 막는다. bump 즉시 인증 필터의 버전 비교에서 기존 토큰이 401 이 된다.
        User user = userRepository.findByIdForUpdate(forceLogoutCommand.targetUserId())
                .orElseThrow(UserException.UserNotFoundException::new);
        user.bumpTokenVersion();
        authSessionService.revokeAll(user.getId(), SessionRevokeReason.ADMIN_FORCE);
        // reason 은 null 이다 — 강제 로그아웃은 사유를 받지 않는다(정지와 달리 입력 칸이 없다).
        adminUserActionLogRepository.save(AdminUserActionLog.of(
                forceLogoutCommand.actorUserId(), user.getId(), AdminUserAction.FORCE_LOGOUT, null));
        log.info("Admin force logout. actorId={}, targetUserId={}",
                forceLogoutCommand.actorUserId(), forceLogoutCommand.targetUserId());
    }

    @Override
    @Transactional
    public void updateProfile(UpdateProfileCommand updateProfileCommand) {
        reservedNamePolicy.validate(updateProfileCommand.name());
        // 행잠금 — User 에는 @Version 도 @DynamicUpdate 도 없어 더티 플러시가 모든 컬럼을 쓰는 UPDATE 를 낸다.
        // 잠그지 않고 읽으면 읽은 뒤 커밋된 계정 조치(status·token_version)까지 옛 스냅샷 값으로 되돌려 써,
        // 계정은 멀쩡히 살아 있는데 감사 로그에는 "정지했다"만 남는다(관리자 메모 저장 경로와 동일한 결함).
        User user = userRepository.findByIdForUpdate(updateProfileCommand.userId())
                .orElseThrow(UserException.UserNotFoundException::new);
        user.updateProfile(updateProfileCommand.name(), updateProfileCommand.grade(),
                updateProfileCommand.college(), updateProfileCommand.major());
    }

    @Override
    @Transactional
    public void changePassword(ChangePasswordCommand changePasswordCommand) {
        // token_version lost update 를 막기 위해 행을 잠그고 조회한다(logout/withdraw 와 동일).
        User user = userRepository.findByIdForUpdate(changePasswordCommand.userId())
                .orElseThrow(UserException.UserNotFoundException::new);
        if (!passwordEncoder.matches(changePasswordCommand.currentPassword(), user.getPasswordHash())) {
            throw new UserException.InvalidCurrentPasswordException();
        }
        if (passwordEncoder.matches(changePasswordCommand.newPassword(), user.getPasswordHash())) {
            throw new UserException.SamePasswordException();
        }
        user.changePassword(passwordEncoder.encode(changePasswordCommand.newPassword()));
        // 변경 후 재로그인 강제 — 발급된 모든 토큰을 무효화한다(탈취된 세션 차단).
        user.bumpTokenVersion();
        authSessionService.revokeAll(user.getId(), SessionRevokeReason.CREDENTIAL_CHANGE);
    }

    @Override
    @Transactional
    public void changePhone(ChangePhoneCommand changePhoneCommand, String clientIp, String userAgent) {
        LocalDateTime now = LocalDateTime.now(clock);

        // 세션 검증(403)이 최우선 — 미존재·미인증·완료 창(10분) 초과·용도 불일치 전부 사유 미특정 403.
        PhoneVerification verifiedSession = phoneVerificationSessionManager.getVerifiedSessionForUpdate(
                changePhoneCommand.verificationToken(), VerificationPurpose.PHONE_CHANGE, now);
        // 세션 대상과 요청자가 다르면 동일하게 403 — 타인 세션 토큰 탈취로 내 계정 번호를 바꾸는 경로 차단.
        if (!changePhoneCommand.userId().equals(verifiedSession.getTargetUserId())) {
            throw new PhoneVerificationException.PhoneNotVerifiedException();
        }

        String verifiedPhone = verifiedSession.getPhone();
        // 발급 시 검사했더라도 인증~완료 사이 창의 선점을 재검증한다(TOCTOU) — 최종 방어는 ux_users_phone.
        if (userRepository.existsByPhoneAndIdNot(verifiedPhone, changePhoneCommand.userId())) {
            throw new UserException.DuplicateAccountException();
        }

        User user = userRepository.findByIdForUpdate(changePhoneCommand.userId())
                .orElseThrow(UserException.UserNotFoundException::new);
        // 복구 수단(전화번호) 교체는 비밀번호 변경과 동급 — 현재 비밀번호로 step-up 인증한다.
        // 세션 소비 전에 실패시키므로 비밀번호 오입력 시 인증 세션은 살아있어 재시도만 하면 된다.
        if (!passwordEncoder.matches(changePhoneCommand.currentPassword(), user.getPasswordHash())) {
            throw new UserException.InvalidCurrentPasswordException();
        }
        user.changePhone(verifiedPhone, now);
        // 복구 수단 변경 후 재로그인 강제 — 발급된 모든 토큰을 무효화한다(changePassword 와 동일).
        user.bumpTokenVersion();
        authSessionService.revokeAll(user.getId(), SessionRevokeReason.CREDENTIAL_CHANGE);
        phoneVerificationSessionManager.consume(verifiedSession, user.getId(), clientIp, userAgent);
        try {
            // UPDATE 를 지금 내보내 번호 선점 경합을 이 자리에서 분류한다 — 커밋 시점 flush 로 미루면
            // 이 catch 밖(커밋 예외 경유 500)으로 새어 나간다.
            userRepository.flush();
        } catch (DataIntegrityViolationException racedPhoneChange) {
            if (!PostgresConstraintViolations.isUniqueViolationOf(racedPhoneChange, USERS_PHONE_UNIQUE_CONSTRAINT)) {
                throw racedPhoneChange;
            }
            throw new UserException.DuplicateAccountException();
        }
    }

    /**
     * 동시 가입 경합으로 인한 학번·전화번호 unique 위반 only true.
     * 그 외 무결성 위반은 그대로 위로 전파한다 (club_member 23505 처리 전례).
     */
    private static boolean isDuplicateAccountViolation(DataIntegrityViolationException exception) {
        return PostgresConstraintViolations.isUniqueViolationOf(exception, USERS_STUDENT_ID_UNIQUE_CONSTRAINT)
                || PostgresConstraintViolations.isUniqueViolationOf(exception, USERS_PHONE_UNIQUE_CONSTRAINT);
    }

    @Override
    @Transactional
    public void resetPassword(ResetPasswordCommand resetPasswordCommand, String clientIp, String userAgent) {
        // 이용 정지 검사를 여기에 두지 않는 것은 의도다 — 비로그인 경로라 정지 여부를 확인해주는 순간
        // 학번·번호를 아는 제3자가 재설정 시도만으로 계정 상태를 알아낸다(로그인이 비밀번호 검증 뒤에
        // 검사하는 것과 같은 이유). 재설정에 성공해도 로그인 단계에서 막히므로 실익도 없다.
        LocalDateTime now = LocalDateTime.now(clock);

        // 잠금 순서는 세션 행 → 유저 행 — signup·changePhone 소비 경로와 같은 방향이라 순환 대기(데드락)가 없다.
        // 세션 검증(403)이 최우선: 미존재·미인증·완료 창(10분) 초과·용도 불일치 전부 사유 미특정 403.
        PhoneVerification verifiedSession = phoneVerificationSessionManager.getVerifiedSessionForUpdate(
                resetPasswordCommand.verificationToken(), VerificationPurpose.PASSWORD_RESET, now);

        Long targetUserId = verifiedSession.getTargetUserId();
        if (targetUserId == null) {
            throw new UserException.PasswordResetNotAllowedException();
        }
        // 인증~완료 사이에 탈퇴하면 @SQLRestriction 으로 조회되지 않는다 — 사유 미특정 400 으로 수렴.
        User user = userRepository.findByIdForUpdate(targetUserId)
                .orElseThrow(UserException.PasswordResetNotAllowedException::new);

        // 인증~완료 사이에 계정 번호가 바뀌면 세션 번호는 더 이상 "그 계정의 등록 번호"가 아니다 (spec §10.2
        // 성공 조건 = 등록 번호 실소유). 번호 변경으로 방어한 피해자의 계정을 구 세션으로 재설정하는 경로를 닫는다.
        if (!user.getPhone().equals(verifiedSession.getPhone())) {
            throw new UserException.PasswordResetNotAllowedException();
        }
        if (passwordEncoder.matches(resetPasswordCommand.newPassword(), user.getPasswordHash())) {
            throw new UserException.SamePasswordException();
        }

        user.changePassword(passwordEncoder.encode(resetPasswordCommand.newPassword()));
        // 재설정 = 계정 탈취 대응 경로일 수 있다 — 발급된 모든 토큰을 무효화한다(전 기기 로그아웃).
        user.bumpTokenVersion();
        authSessionService.revokeAll(user.getId(), SessionRevokeReason.CREDENTIAL_CHANGE);
        phoneVerificationSessionManager.consume(verifiedSession, user.getId(), clientIp, userAgent);
    }

    @Override
    @Transactional
    public void withdraw(Long userId) {
        // 동아리 회장이 탈퇴하면 회장직이 공석이 되어 운영이 막히고, 멤버십 cascade 없이 User 만
        // soft-delete 하므로 회장 행이 유령으로 남는다. 회장 인계(succession) 후 탈퇴하도록 막는다.
        if (clubMemberRepository.existsByUserIdAndRole(userId, ClubMemberRole.LEADER)) {
            throw new UserException.LeaderCannotWithdrawException();
        }
        // logout 과 동일하게 행을 잠가 token_version lost update 를 막고, @SQLDelete 로 soft-delete 한다.
        // bumpTokenVersion 으로 발급된 모든 토큰이 즉시 무효화되고, soft-delete 로 이후 인증이 차단된다.
        // 회원의 멤버십/지원서 등 잔여 데이터의 정리·PII 물리 파기는 보관기간 파기 잡(PIPA)에서 일괄 처리한다.
        // 비-회장 멤버십 행은 남지만 멤버 목록 쿼리가 JOIN FETCH cm.user(INNER)라 숨겨진 회원은 노출되지 않는다.
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(UserException.UserNotFoundException::new);
        user.bumpTokenVersion();
        // 탈퇴도 계정 자격 소멸 계열로 CREDENTIAL_CHANGE 로 묶는다(전용 사유 분리는 감사 수요 생기면 후속).
        authSessionService.revokeAll(user.getId(), SessionRevokeReason.CREDENTIAL_CHANGE);
        userRepository.delete(user);
    }

    @Override
    public UserQuery getById(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(UserException.UserNotFoundException::new);
        return UserQuery.from(user);
    }

    // 관리자 사용자 검색에서 정렬 가능한 필드. 클라이언트 sort 가 JPQL @Query 의 ORDER BY 로 그대로
    // 들어가므로, 허용 목록 밖 속성은 SortWhitelist 가 400 으로 거부한다(임의 필드 정렬·오류 쿼리 차단).
    private static final Set<String> ALLOWED_ADMIN_USER_SORT =
            Set.of("studentId", "name", "createdAt");

    private static final Sort DEFAULT_ADMIN_USER_SORT =
            Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));

    @Override
    public Page<UserSearchResultQuery> searchForAdmin(String queryOrNull, UserStatus statusOrNull,
                                                      Pageable pageable) {
        SortWhitelist.assertAllowed(pageable.getSort(), ALLOWED_ADMIN_USER_SORT);
        // 검색어는 선택이다 — 상태 필터만으로 목록을 훑는 경로(정지 회원 찾기)가 필요하다.
        // 리포지토리가 CONCAT 으로 LIKE 패턴을 조립하므로 여기서 와일드카드를 죽여 넘긴다(ESCAPE '!' 와 한 쌍).
        String normalizedQuery = StringUtils.hasText(queryOrNull)
                ? LikeEscapes.escape(queryOrNull.strip())
                : null;
        return userRepository.searchForAdmin(normalizedQuery, statusOrNull, withStableSort(pageable))
                .map(UserSearchResultQuery::from);
    }

    /**
     * 정렬이 지정되지 않으면 최근 가입순, 지정됐으면 그 뒤에 id DESC 를 덧붙인다.
     * tie-breaker 가 없으면 같은 createdAt 을 가진 행들의 순서가 매 쿼리마다 달라져 페이징이 새거나 겹친다.
     */
    private Pageable withStableSort(Pageable pageable) {
        Sort sort = pageable.getSort().isSorted()
                ? pageable.getSort().and(Sort.by(Sort.Order.desc("id")))
                : DEFAULT_ADMIN_USER_SORT;
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), sort);
    }
}
