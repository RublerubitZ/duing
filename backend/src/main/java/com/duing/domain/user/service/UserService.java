package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.command.ChangePasswordCommand;
import com.duing.domain.user.service.dto.command.ChangePhoneCommand;
import com.duing.domain.user.service.dto.command.ForceLogoutCommand;
import com.duing.domain.user.service.dto.command.LoginCommand;
import com.duing.domain.user.service.dto.command.LoginContext;
import com.duing.domain.user.service.dto.command.ResetPasswordCommand;
import com.duing.domain.user.service.dto.command.SignupCommand;
import com.duing.domain.user.service.dto.command.UpdateProfileCommand;
import com.duing.domain.user.service.dto.query.LoginResult;
import com.duing.domain.user.service.dto.query.UserQuery;
import com.duing.domain.user.service.dto.query.UserSearchResultQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface UserService {

    Long signup(SignupCommand signupCommand, String clientIp, String userAgent);

    LoginResult login(LoginCommand loginCommand, LoginContext loginContext);

    void logout(Long userId);

    void forceLogout(ForceLogoutCommand forceLogoutCommand);

    void updateProfile(UpdateProfileCommand updateProfileCommand);

    void changePassword(ChangePasswordCommand changePasswordCommand);

    /** MO 재인증 세션(PHONE_CHANGE·본인 대상)으로 전화번호를 교체한다 — 세션은 소비된다 (spec §7.5). */
    void changePhone(ChangePhoneCommand changePhoneCommand, String clientIp, String userAgent);

    /**
     * 비로그인 비밀번호 재설정 완료 — PASSWORD_RESET 세션(인증 후 10분 내)의 대상 계정 비밀번호를
     * 교체하고 token_version 을 올려 전 기기에서 로그아웃시킨다. 세션은 소비된다 (spec §10.2).
     */
    void resetPassword(ResetPasswordCommand resetPasswordCommand, String clientIp, String userAgent);

    void withdraw(Long userId);

    UserQuery getById(Long userId);

    Page<UserSearchResultQuery> searchForAdmin(String query, Pageable pageable);
}