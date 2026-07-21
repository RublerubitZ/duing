package com.duing.domain.user.service;

import com.duing.domain.user.exception.UserException;
import java.util.Locale;
import java.util.Set;

/**
 * 회원 이름 금칙어 정책(가입·프로필 수정 공용) — 테스트 계정·장난 입력·운영자 사칭용 이름을 차단한다.
 * 대소문자 구분 없이(소문자 정규화) 정확히 일치하는 경우에만 거부한다.
 * 운영 중 금칙어 추가·삭제는 아래 목록만 수정하면 된다.
 * 영문 항목은 현재 한글 완성형 @Pattern 이 먼저 걸러 도달하지 않지만, 이름 형식 정책이
 * 완화(다국어 지원 등)돼도 금칙어가 유지되도록 의도적으로 남겨둔 백스톱이다.
 */
public class ReservedNamePolicy {

    private static final Set<String> RESERVED_NAMES = Set.of(
            "테스트", "테스터", "관리자", "운영자", "최고관리자", "아무개", "샘플", "예시",
            "example", "test", "admin", "qwer", "asdf"
    );

    public void validate(String name) {
        if (RESERVED_NAMES.contains(name.toLowerCase(Locale.ROOT))) {
            throw new UserException.ReservedNameException();
        }
    }
}
