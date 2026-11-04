import { daysUntilKst } from '@duing/hooks/datetime';

/**
 * 운영진 마지막 접속이 이 일수를 넘으면(KST 달력 일수) 오래 안 들어온 것으로 본다 — 서버 판정(ClubSignalPolicy.OPERATOR_INACTIVE_DAYS)과 같은 값.
 * 서버는 순간 기준(지금 − 30일)이라 '운영진 30일 넘게 미접속' 목록에 "30일 전"이 보일 수 있다(30일 0~23시간 전 — 스펙 §8-3 이 받아들인다).
 */
export const OPERATOR_INACTIVE_DAYS = 30;

/** 운영진 마지막 접속부터 오늘까지의 KST 달력 일수 — 0 이하면 '오늘'로 쓴다(기기 시계가 늦어 미래 시각이면 음수). */
// 단항 `-` 는 같은 날에 -0 을 내 Object.is 비교(toBe(0))에서 어긋난다 — 0 에서 빼서 +0 으로 둔다.
export const operatorInactiveDays = (lastActiveAt: string, now: Date): number => 0 - daysUntilKst(lastActiveAt, now);
