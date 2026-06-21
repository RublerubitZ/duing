package com.duing.domain.user.service;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.EmailVerificationService;
import com.duing.domain.user.service.dto.command.ChangePasswordCommand;
import com.duing.domain.user.service.dto.command.ForceLogoutCommand;
import com.duing.domain.user.service.dto.command.LoginCommand;
import com.duing.domain.user.service.dto.command.SignupCommand;
import com.duing.domain.user.service.dto.command.UpdateProfileCommand;
import com.duing.domain.user.service.dto.query.LoginResult;
import com.duing.domain.user.service.dto.query.UserQuery;
import com.duing.domain.user.service.dto.query.UserSearchResultQuery;
import com.duing.global.auth.JwtTokenProvider;
import java.time.Duration;
import java.time.LocalDateTime;
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
    private final EmailVerificationService emailVerificationService;
    private final LoginAttemptRateLimiter loginAttemptRateLimiter;
    private final ClubMemberRepository clubMemberRepository;

    private static final int MAX_FAILED_LOGIN_ATTEMPTS = 5;
    private static final Duration LOGIN_LOCK_DURATION = Duration.ofMinutes(15);

    // 존재하지 않는 이메일 분기의 BCrypt 타이밍 평탄화용 더미 해시 (지연 초기화, 비밀 아님).
    private volatile String dummyPasswordHash;

    @Override
    @Transactional
    public Long signup(SignupCommand signupCommand) {
        // 중복(409) 검사를 인증 가드(403) 보다 먼저 둔다 — 이미 가입된 이메일에 "이미 가입됨"을 명확히
        // 안내(409)하는 것을 우선하는 의도된 선택이다. 이 순서는 signup 응답이 가입 여부(409-vs-403)를
        // 드러내는 계정 열거를 감수하는 대신, 명확한 중복 안내 UX 를 택한 것이다(발송 단계의 계정 열거는
        // GeneralEmailVerificationService 에서 별도로 차단한다).
        if (userRepository.existsByEmail(signupCommand.email())
                || userRepository.existsByStudentId(signupCommand.studentId())
                || userRepository.existsByPhone(signupCommand.phone())) {
            throw new UserException.DuplicateAccountException();
        }
        emailVerificationService.assertVerified(signupCommand.email());

        String passwordHash = passwordEncoder.encode(signupCommand.rawPassword());
        User user = User.create(
                signupCommand.studentId(),
                signupCommand.name(),
                signupCommand.email(),
                passwordHash,
                UserRole.STUDENT,
                signupCommand.grade(),
                signupCommand.college(),
                signupCommand.major(),
                signupCommand.phone(),
                java.time.LocalDateTime.now()
        );
        Long userId = userRepository.save(user).getId();
        emailVerificationService.consume(signupCommand.email());
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
        // IP 단위 시도 제한(credential stuffing/spraying) — 계정 조회 이전에 차단한다.
        loginAttemptRateLimiter.assertAndRecordAttempt(clientIp, now);

        // 같은 계정에 대한 동시 실패가 실패 카운터 증가를 덮어쓰지 않도록 행을 잠그고 조회한다.
        User user = userRepository.findByEmailForUpdate(loginCommand.email()).orElse(null);
        if (user == null) {
            // 존재하지 않는 이메일도 BCrypt 비교 비용을 동일하게 소비해 타이밍 기반 이메일 열거를 막는다.
            burnPasswordComparison(loginCommand.rawPassword());
            throw new UserException.InvalidCredentialsException();
        }

        if (user.isLocked(now)) {
            throw new UserException.AccountLockedException();
        }

        if (!passwordEncoder.matches(loginCommand.rawPassword(), user.getPasswordHash())) {
            user.recordFailedLogin(MAX_FAILED_LOGIN_ATTEMPTS, LOGIN_LOCK_DURATION, now);
            throw new UserException.InvalidCredentialsException();
        }

        user.recordSuccessfulLogin();
        String accessToken =
                jwtTokenProvider.createToken(user.getId(), user.getRole().name(), user.getTokenVersion());
        return new LoginResult(accessToken, UserQuery.from(user));
    }

    /** 존재하지 않는 이메일 분기에서도 BCrypt 비교 비용을 소비해 타이밍 오라클을 제거한다. */
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
        // 전화번호를 다른 회원이 이미 쓰고 있으면 막는다(가입과 동일 정책). DB 유니크 위반으로
        // 떨어지면 원인을 알 수 없는 generic 409 가 되므로 도메인에서 먼저 검증한다.
        // 어떤 필드가 중복인지는 계정 열거 방지를 위해 generic 예외로 가린다.
        if (!updateProfileCommand.phone().equals(user.getPhone())
                && userRepository.existsByPhone(updateProfileCommand.phone())) {
            throw new UserException.DuplicateAccountException();
        }
        user.updateProfile(updateProfileCommand.name(), updateProfileCommand.phone(), updateProfileCommand.grade());
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

    @Override
    public Page<UserSearchResultQuery> searchForAdmin(String query, Pageable pageable) {
        if (!StringUtils.hasText(query)) {
            throw new UserException.InvalidSearchQueryException();
        }
        return userRepository.searchForAdmin(query.trim(), pageable)
                .map(UserSearchResultQuery::from);
    }
}
