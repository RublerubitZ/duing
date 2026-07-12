package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationInquiryAnswer;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FederationInquiryAnswerRepository extends JpaRepository<FederationInquiryAnswer, Long> {

    Optional<FederationInquiryAnswer> findByInquiryId(Long inquiryId);

    /**
     * 파기 대상 문의(federation_inquiry.deleted_at < cutoff)에 딸린 답변의 content 를 placeholder 로
     * 비운다. 답변 자체의 deleted_at 은 조건에 넣지 않는다 — 답변만 별도로 soft-delete 되는 경로가
     * 없어(문의당 1:1) 문의가 파기 대상이면 그 답변도 함께 파기 대상이다. PostgreSQL UPDATE ... FROM
     * 문법으로 두 테이블을 조인한다. content <> :placeholder 로 멱등을 보장한다.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = "UPDATE federation_inquiry_answer a SET content = :placeholder "
            + "FROM federation_inquiry i WHERE a.inquiry_id = i.id AND i.deleted_at < :cutoff "
            + "AND a.content <> :placeholder",
            nativeQuery = true)
    int scrubAnswersOfExpiredInquiries(@Param("cutoff") LocalDateTime cutoff, @Param("placeholder") String placeholder);
}
