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

    @Override
    public LoginResult login(LoginCommand loginCommand) {
        User user = userRepository.findByEmail(loginCommand.email())
                .orElseThrow(UserException.InvalidCredentialsException::new);

        if (!passwordEncoder.matches(loginCommand.rawPassword(), user.getPasswordHash())) {
            throw new UserException.InvalidCredentialsException();
        }

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
