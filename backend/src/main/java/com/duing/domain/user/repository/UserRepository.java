package com.duing.domain.user.repository;

import com.duing.domain.user.entity.User;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

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
