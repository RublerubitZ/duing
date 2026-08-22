package com.duing.domain.user.repository;

import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.UserStatus;
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

    /** 번호 변경 발급·완료의 중복검사 — 본인 소유는 허용(소급 재인증), 타인 소유만 걸러낸다. */
    boolean existsByPhoneAndIdNot(String phone, Long id);

    Optional<User> findByStudentId(String studentId);

    /**
     * ADMIN 사용자 검색. q 가 null 이면 검색 조건 없이 전체를 대상으로 하고, status 가 null 이면 상태를 가리지 않는다.
     * studentId 가 q 로 시작하거나, name 이 q 를 포함(대소문자 무시)할 때 매치.
     *
     * <p>q 를 감싼 CAST 는 장식이 아니다 — 벗기면 Page 가 파생시키는 count 쿼리에서 null 바인딩의 타입이
     * 소실돼 Postgres 가 {@code operator does not exist: character varying ~~ bytea} 로 500 을 낸다.
     * 첫 페이지가 페이지 크기보다 짧으면 Spring Data 가 count 쿼리를 건너뛰므로 작은 데이터에서는 드러나지 않는다.
     *
     * <p>정렬은 Pageable 이 담당하되 서비스가 항상 id DESC tie-breaker 를 덧붙인다 — 정렬 키가 같은 행들의
     * 페이지 경계가 흔들리면 페이지 간 행 중복·누락이 생긴다.
     *
     * <p>패턴을 CONCAT 으로 직접 조립하므로 q 는 호출자(GeneralUserService)가 {@code LikeEscapes} 로
     * 이스케이프해 넘긴다 — 그래서 두 LIKE 에 {@code ESCAPE '!'} 절이 필요하다. 절을 지우면
     * 이스케이프된 '!' 가 리터럴로 남아 '!'·'%'·'_' 가 든 검색어가 아무것도 찾지 못한다.
     */
    @Query("""
            SELECT u FROM User u
            WHERE (CAST(:q AS String) IS NULL
                   OR u.studentId LIKE CONCAT(CAST(:q AS String), '%') ESCAPE '!'
                   OR LOWER(u.name) LIKE LOWER(CONCAT('%', CAST(:q AS String), '%')) ESCAPE '!')
              AND (:status IS NULL OR u.status = :status)
            """)
    Page<User> searchForAdmin(@Param("q") String q,
                              @Param("status") UserStatus status,
                              Pageable pageable);

    /**
     * 보관기간(cutoff)을 넘겨 soft-delete 된 사용자의 PII 컬럼을 비식별화한다(이미 익명화된 행은 제외 — 멱등).
     * student_id 는 partial unique 보존을 위해 id 파생값으로, phone 은 CHECK 제약을 만족하는
     * placeholder('010-0000-0000')로 둔다.
     * 관리자 메모(admin_note)는 자유서술이라 이름·번호·학번이 그대로 담길 수 있어 NULL 로 비운다.
     * 대상이 soft-delete 행이라 @SQLRestriction 을 우회하려 nativeQuery.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = """
            UPDATE users SET
                student_id = LEFT(CONCAT('anon_', id), 20),
                name = '탈퇴회원',
                password_hash = '',
                major = '',
                phone = '010-0000-0000',
                admin_note = NULL,
                anonymized_at = NOW()
            WHERE deleted_at < :cutoff AND anonymized_at IS NULL
            """, nativeQuery = true)
    int anonymizeExpiredUsers(@Param("cutoff") LocalDateTime cutoff);
}
