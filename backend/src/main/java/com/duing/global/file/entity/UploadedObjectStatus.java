package com.duing.global.file.entity;

/**
 * 업로드 객체 추적 상태(스펙 §2.1, #1153 으로 RELEASED 추가).
 * <ul>
 *   <li>PENDING — 업로드됐지만 아직 어떤 엔티티에도 연결되지 않음(파기 후보)</li>
 *   <li>ACTIVE — 엔티티에 연결됨</li>
 *   <li>RELEASED — 교체·비우기·삭제로 어떤 쓰기 경로가 참조를 놓음(파기 후보). 다시 연결되면 ACTIVE 로 돌아온다.
 *       비참조 보장이 아니다 — 최종 판정은 파기 잡의 참조 스캔</li>
 *   <li>PURGING — 파기 잡이 claim 함. 스토리지 삭제 미확정 상태로, 다음 실행이 재시도한다</li>
 *   <li>PURGED — 스토리지 삭제 확정(종단). 행은 보존한다</li>
 * </ul>
 */
public enum UploadedObjectStatus {
    PENDING,
    ACTIVE,
    RELEASED,
    PURGING,
    PURGED
}
