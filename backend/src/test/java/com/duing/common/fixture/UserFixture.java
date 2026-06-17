package com.duing.common.fixture;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;

public final class UserFixture {

    // studentId·email 이 호출마다 유일하도록 nanoTime 기반 시퀀스를 둔다(기존 인라인 saveUser 전례).
    private static final AtomicLong SEQUENCE = new AtomicLong(System.nanoTime());

    private UserFixture() {
    }

    /** 학번·이메일이 호출마다 유일한 학생 User 를 생성한다(저장은 호출 측 repository 책임). */
    public static User unique() {
        long seq = SEQUENCE.incrementAndGet();
        return User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now());
    }

    /** 이름을 지정한 학생 User 를 생성한다(학번·이메일은 유일). 동명이인·이름 매칭 검증용. */
    public static User withName(String name) {
        long seq = SEQUENCE.incrementAndGet();
        return User.create("20" + seq, name,
                "u" + seq + "@duing.ac.kr", "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now());
    }
}
