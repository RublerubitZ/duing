export type GlobalRole = "STUDENT" | "ADMIN";

export type JwtClaims = {
  sub: string;
  role: GlobalRole;
  exp: number;
  iat?: number;
};

export type AuthUser = {
  id: number;
  role: GlobalRole;
};