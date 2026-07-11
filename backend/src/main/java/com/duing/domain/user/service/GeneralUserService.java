package com.duing.domain.user.service;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.exception.PhoneVerificationException;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.ChangePasswordCommand;
import com.duing.domain.user.service.dto.command.ChangePhoneCommand;
import com.duing.domain.user.service.dto.command.ForceLogoutCommand;
import com.duing.domain.user.service.dto.command.LoginCommand;
import com.duing.domain.user.service.dto.command.SignupCommand;
import com.duing.domain.user.service.dto.command.UpdateProfileCommand;
import com.duing.domain.user.service.dto.query.LoginResult;
import com.duing.domain.user.service.dto.query.UserQuery;
import com.duing.domain.user.service.dto.query.UserSearchResultQuery;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.web.SortWhitelist;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@Slf4j
public class GeneralUserService implements UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final LoginAttemptRateLimiter loginAttemptRateLimiter;
    private final ClubMemberRepository clubMemberRepository;
    private final PhoneVerificationSessionManager phoneVerificationSessionManager;
    private final Clock clock;

    private static final int MAX_FAILED_LOGIN_ATTEMPTS = 5;
    private static final Duration LOGIN_LOCK_DURATION = Duration.ofMinutes(15);

    // 존재하지 않는 학번 분기의 BCrypt 타이밍 평탄화용 더미 해시 (지연 초기화, 비밀 아님).
    private volatile String dummyPasswordHash;

    @Override
    @Transactional
    public Long signup(SignupCommand signupCommand, String clientIp, String userAgent) {
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
        Long userId = userRepository.save(user).getId();
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
            UserException.TooManyLoginAttemptsException.class
    })
    public LoginResult login(LoginCommand loginCommand, String clientIp) {
        LocalDateTime now = LocalDateTime.now();
        // IP 단위 실패 제한(credential stuffing/spraying) — 계정 조회 이전에, 이미 실패 한도를 넘긴 IP 를
        // 차단한다. 성공 로그인은 세지 않으므로 공유 IP(교내 NAT) 의 정상 사용자는 막히지 않는다.
        loginAttemptRateLimiter.assertWithinLimit(clientIp, now);

        // 같은 계정에 대한 동시 실패가 실패 카운터 증가를 덮어쓰지 않도록 행을 잠그고 조회한다.
        User user = userRepository.findByStudentIdForUpdate(loginCommand.studentId()).orElse(null);
        if (user == null) {
            // 존재하지 않는 학번도 BCrypt 비교 비용을 동일하게 소비해 타이밍 기반 학번 열거를 막는다.
            burnPasswordComparison(loginCommand.rawPassword());
            loginAttemptRateLimiter.recordFailureOrThrow(clientIp, now);
            throw new UserException.InvalidCredentialsException();
        }

        // 잠긴 계정에 대한 시도도 IP 실패로 센다. 세지 않으면 공격자가 계정 하나를 잠근 뒤 그 계정을
        // 무한히 두드려 IP 볼륨 제한을 완전히 우회할 수 있다(무료 프로브). 계정 카운터(recordFailedLogin)는
        // 이미 잠긴 계정을 다시 잠글 필요가 없어 건드리지 않고, IP 윈도우에만 실패로 기록한다.
        if (user.isLocked(now)) {
            loginAttemptRateLimiter.recordFailureOrThrow(clientIp, now);
            throw new UserException.AccountLockedException();
        }

        if (!passwordEncoder.matches(loginCommand.rawPassword(), user.getPasswordHash())) {
            user.recordFailedLogin(MAX_FAILED_LOGIN_ATTEMPTS, LOGIN_LOCK_DURATION, now);
            loginAttemptRateLimiter.recordFailureOrThrow(clientIp, now);
            throw new UserException.InvalidCredentialsException();
        }

        user.recordSuccessfulLogin();
        String accessToken =
                jwtTokenProvider.createToken(user.getId(), user.getRole().name(), user.getTokenVersion());
        return new LoginResult(accessToken, UserQuery.from(user));
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
    public void logout(Long userId) {
        // 동시 로그아웃의 token_version lost update 를 막기 위해 행을 잠그고 조회한다.
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(UserException.UserNotFoundException::new);
        user.bumpTokenVersion();
    }

    @Override
    @Transactional
    public void forceLogout(ForceLogoutCommand forceLogoutCommand) {
        // 관리자가 대상 사용자의 모든 토큰을 즉시 무효화한다 — logout 과 동일하게 행을 잠가
        // token_version lost update 를 막는다. bump 즉시 인증 필터의 버전 비교에서 기존 토큰이 401 이 된다.
        User user = userRepository.findByIdForUpdate(forceLogoutCommand.targetUserId())
                .orElseThrow(UserException.UserNotFoundException::new);
        user.bumpTokenVersion();
        log.info("Admin force logout. actorId={}, targetUserId={}",
                forceLogoutCommand.actorUserId(), forceLogoutCommand.targetUserId());
    }

    @Override
    @Transactional
    public void updateProfile(UpdateProfileCommand updateProfileCommand) {
        User user = userRepository.findById(updateProfileCommand.userId())
                .orElseThrow(UserException.UserNotFoundException::new);
        user.updateProfile(updateProfileCommand.name(), updateProfileCommand.grade());
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
        user.changePhone(verifiedPhone, now);
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

    @Override
    public Page<UserSearchResultQuery> searchForAdmin(String query, Pageable pageable) {
        if (!StringUtils.hasText(query)) {
            throw new UserException.InvalidSearchQueryException();
        }
        SortWhitelist.assertAllowed(pageable.getSort(), ALLOWED_ADMIN_USER_SORT);
        return userRepository.searchForAdmin(query.trim(), pageable)
                .map(UserSearchResultQuery::from);
    }
}
