package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.command.LoginCommand;
import com.duing.domain.user.service.dto.command.SignupCommand;
import com.duing.domain.user.service.dto.query.LoginResult;
import com.duing.domain.user.service.dto.query.UserQuery;
import com.duing.domain.user.service.dto.query.UserSearchResultQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface UserService {

    Long signup(SignupCommand signupCommand);

    LoginResult login(LoginCommand loginCommand, String clientIp);

    void logout(Long userId);

    void withdraw(Long userId);

    UserQuery getById(Long userId);

    Page<UserSearchResultQuery> searchForAdmin(String query, Pageable pageable);
}