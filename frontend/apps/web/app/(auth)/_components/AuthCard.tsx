import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export function AuthCard({ children }: Props) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <header className="mb-6 text-center">
          <p className="text-xl font-bold tracking-tight text-slate-900">Du-ing</p>
          <p className="mt-1 text-xs text-slate-500">대구대학교 동아리 통합 플랫폼</p>
        </header>
        {children}
      </section>
    </main>
  );
}
