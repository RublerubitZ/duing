package com.duing.domain.user.repository;

import com.duing.domain.user.entity.User;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    /**
     * 로그인 실패 카운터 증가의 동시성 보호를 위해 사용자 행을 잠그고 조회한다.
     * 같은 계정에 대한 동시 로그인 시도가 실패 카운터를 덮어써 잠금을 무력화하는 것을 막는다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM User u WHERE u.email = :email")
    Optional<User> findByEmailForUpdate(@Param("email") String email);

    /**
     * token_version 증가(로그아웃·강제 폐기)의 동시성 보호를 위해 사용자 행을 잠그고 조회한다.
     * 동시 로그아웃이 같은 버전을 읽어 증가분을 덮어쓰는 lost update 를 막는다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM User u WHERE u.id = :id")
    Optional<User> findByIdForUpdate(@Param("id") Long id);

    boolean existsByEmail(String email);

    boolean existsByStudentId(String studentId);

    boolean existsByPhone(String phone);

    /**
     * ADMIN 사용자 검색.
     * studentId 가 q 로 시작하거나, name 또는 email 이 q 를 포함(대소문자 무시)할 때 매치.
     * 입력은 trim 된 비어있지 않은 문자열을 가정한다 (서비스 레벨에서 검증).
     */
    @Query("""
            SELECT u FROM User u
            WHERE u.studentId LIKE CONCAT(:q, '%')
               OR LOWER(u.name) LIKE LOWER(CONCAT('%', :q, '%'))
               OR LOWER(u.email) LIKE LOWER(CONCAT('%', :q, '%'))
            """)
    Page<User> searchForAdmin(@Param("q") String q, Pageable pageable);
}
