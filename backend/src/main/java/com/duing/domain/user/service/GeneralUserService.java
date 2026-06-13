package com.duing.domain.user.service;

import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.EmailVerificationService;
import com.duing.domain.user.service.dto.command.LoginCommand;
import com.duing.domain.user.service.dto.command.SignupCommand;
import com.duing.domain.user.service.dto.query.LoginResult;
import com.duing.domain.user.service.dto.query.UserQuery;
import com.duing.domain.user.service.dto.query.UserSearchResultQuery;
import com.duing.global.auth.JwtTokenProvider;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralUserService implements UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final EmailVerificationService emailVerificationService;
    private final LoginAttemptRateLimiter loginAttemptRateLimiter;

    private static final int MAX_FAILED_LOGIN_ATTEMPTS = 5;
    private static final Duration LOGIN_LOCK_DURATION = Duration.ofMinutes(15);

    @Override
    @Transactional
    public Long signup(SignupCommand signupCommand) {
        // 중복(409) 검사를 인증 가드(403) 보다 먼저 둔다 — 이미 가입된 이메일은 인증 코드를
        // 받을 수 없으므로(발송 API 가 409), 가드를 앞에 두면 중복 이메일이 항상 403 으로
        // 가려져 기존 회원가입 계약(중복 409)이 회귀한다.
        if (userRepository.existsByEmail(signupCommand.email())) {
            throw new UserException.DuplicateEmailException();
        }
        if (userRepository.existsByStudentId(signupCommand.studentId())) {
            throw new UserException.DuplicateStudentIdException();
        }
        if (userRepository.existsByPhone(signupCommand.phone())) {
            throw new UserException.PhoneAlreadyExistsException();
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
    @Override
    @Transactional(noRollbackFor = UserException.InvalidCredentialsException.class)
    public LoginResult login(LoginCommand loginCommand, String clientIp) {
        LocalDateTime now = LocalDateTime.now();
        // IP 단위 시도 제한(credential stuffing/spraying) — 계정 조회 이전에 차단한다.
        loginAttemptRateLimiter.assertAndRecordAttempt(clientIp, now);

        User user = userRepository.findByEmail(loginCommand.email())
                .orElseThrow(UserException.InvalidCredentialsException::new);

        if (user.isLocked(now)) {
            throw new UserException.AccountLockedException();
        }

        if (!passwordEncoder.matches(loginCommand.rawPassword(), user.getPasswordHash())) {
            user.recordFailedLogin(MAX_FAILED_LOGIN_ATTEMPTS, LOGIN_LOCK_DURATION, now);
            throw new UserException.InvalidCredentialsException();
        }

        user.recordSuccessfulLogin();
        String accessToken = jwtTokenProvider.createToken(user.getId(), user.getRole().name());
        return new LoginResult(accessToken, UserQuery.from(user));
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
