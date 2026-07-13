package com.duing.global.auth;

public enum AuthTransport {
    BEARER,
    COOKIE,
    NONE;

    public static final String REQUEST_ATTRIBUTE = AuthTransport.class.getName();
}
