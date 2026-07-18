package com.duing.domain.user.repository;

import com.duing.domain.user.entity.AuthEvent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthEventRepository extends JpaRepository<AuthEvent, Long> {

    List<AuthEvent> findByUserIdOrderByIdAsc(Long userId);
}
