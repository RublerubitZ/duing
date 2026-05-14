package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.command.LoginCommand;
import com.duing.domain.user.service.dto.command.SignupCommand;
import com.duing.domain.user.service.dto.query.LoginResult;
import com.duing.domain.user.service.dto.query.UserQuery;

public interface UserService {

    Long signup(SignupCommand signupCommand);

    LoginResult login(LoginCommand loginCommand);

    UserQuery getById(Long userId);
}