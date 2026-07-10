export const authQueryKeys = {
  all: ['auth'] as const,
  phoneVerification: (verificationToken: string) =>
    [...authQueryKeys.all, 'phoneVerification', verificationToken] as const,
};
