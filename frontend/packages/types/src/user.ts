// Global role (시스템 전역). Club-scoped role 은 ClubMemberRole 참조.
export type UserRole = 'STUDENT' | 'ADMIN';

export interface User {
  id: number;
  studentId: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface SignupPayload {
  studentId: string;
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  user: User;
}
