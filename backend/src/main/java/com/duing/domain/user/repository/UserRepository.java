package com.duing.domain.user.repository;

import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

    // 총동연 문의 접수 알림 수신자 조회 — ADMIN 은 극소수라 별도 페이징 없이 전체 조회.
    List<User> findAllByRole(UserRole role);

    /**
     * 로그인 실패 카운터 증가의 동시성 보호를 위해 사용자 행을 잠그고 조회한다.
     * 같은 계정에 대한 동시 로그인 시도가 실패 카운터를 덮어써 잠금을 무력화하는 것을 막는다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM User u WHERE u.studentId = :studentId")
    Optional<User> findByStudentIdForUpdate(@Param("studentId") String studentId);

    /**
     * token_version 증가(로그아웃·강제 폐기)의 동시성 보호를 위해 사용자 행을 잠그고 조회한다.
     * 동시 로그아웃이 같은 버전을 읽어 증가분을 덮어쓰는 lost update 를 막는다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM User u WHERE u.id = :id")
    Optional<User> findByIdForUpdate(@Param("id") Long id);

    boolean existsByStudentId(String studentId);

    boolean existsByPhone(String phone);

    /**
     * ADMIN 사용자 검색.
     * studentId 가 q 로 시작하거나, name 이 q 를 포함(대소문자 무시)할 때 매치.
     * 입력은 trim 된 비어있지 않은 문자열을 가정한다 (서비스 레벨에서 검증).
     */
    @Query("""
            SELECT u FROM User u
            WHERE u.studentId LIKE CONCAT(:q, '%')
               OR LOWER(u.name) LIKE LOWER(CONCAT('%', :q, '%'))
            """)
    Page<User> searchForAdmin(@Param("q") String q, Pageable pageable);

    /**
     * 보관기간(cutoff)을 넘겨 soft-delete 된 사용자의 PII 컬럼을 비식별화한다(이미 익명화된 행은 제외 — 멱등).
     * student_id 는 partial unique 보존을 위해 id 파생값으로, phone 은 CHECK 제약을 만족하는
     * placeholder('010-0000-0000')로 둔다. email 은 전환기 레거시 값 파기를 위해 NULL 로 지운다(컬럼 drop 은 PR5).
     * 대상이 soft-delete 행이라 @SQLRestriction 을 우회하려 nativeQuery.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = """
            UPDATE users SET
                student_id = LEFT(CONCAT('anon_', id), 20),
                name = '탈퇴회원',
                email = NULL,
                password_hash = '',
                major = '',
                phone = '010-0000-0000',
                anonymized_at = NOW()
            WHERE deleted_at < :cutoff AND anonymized_at IS NULL
            """, nativeQuery = true)
    int anonymizeExpiredUsers(@Param("cutoff") LocalDateTime cutoff);
}
