package com.duing.common.fixture;

import java.util.stream.Stream;

/**
 * BCrypt 한도(UTF-8 72바이트) 경계의 비밀번호. 모두 20자에 영문·숫자를 담아 DTO 규칙(8~20자, 2종 이상)을 통과한다.
 * U+1F600(😀)은 UTF-8 4바이트라, 20자 안에서 72바이트를 넘기는 수단이다.
 */
public final class PasswordFixture {

    private static final String FOUR_BYTE_CHAR = Character.toString(0x1F600);

    public static final String PASSWORD_72_BYTES = FOUR_BYTE_CHAR.repeat(16) + "한한a1";
    public static final String PASSWORD_73_BYTES = FOUR_BYTE_CHAR.repeat(17) + "한a1";
    public static final String PASSWORD_74_BYTES = FOUR_BYTE_CHAR.repeat(18) + "a1";

    private PasswordFixture() {
    }

    /** 한도를 넘는 경계값 — {@code @MethodSource} 공급용. */
    public static Stream<String> overLimit() {
        return Stream.of(PASSWORD_73_BYTES, PASSWORD_74_BYTES);
    }
}
