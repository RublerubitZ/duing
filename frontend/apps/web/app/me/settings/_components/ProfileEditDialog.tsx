'use client';

import { useEffect, useState } from 'react';

import { ApiError } from '@duing/api';
import { useUpdateProfileMutation } from '@duing/hooks';
import { majorSchema, userNameSchema } from '@duing/schemas';
import { isCollege, type College, type Grade, type UpdateProfilePayload } from '@duing/types';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { CollegeSelect } from '@/app/_components/CollegeSelect';
import { GradeSelect } from '@/app/_components/GradeSelect';
import { useToast } from '@/app/_components/toast/ToastProvider';

type Props = {
  open: boolean;
  onClose: () => void;
  currentName: string;
  currentGrade: Grade;
  currentCollege?: College;
  currentMajor?: string;
};

export function ProfileEditDialog({
  open,
  onClose,
  currentName,
  currentGrade,
  currentCollege,
  currentMajor,
}: Props) {
  const { addToast } = useToast();
  const updateMutation = useUpdateProfileMutation();
  const [name, setName] = useState(currentName);
  const [grade, setGrade] = useState<Grade>(currentGrade);
  const [college, setCollege] = useState<College | ''>(currentCollege ?? '');
  const [major, setMajor] = useState(currentMajor ?? '');
  const [error, setError] = useState<string | null>(null);

  // 열릴 때마다 현재 값으로 초기화한다. college 부재 시 '' 로 시드한다.
  useEffect(() => {
    if (open) {
      setName(currentName);
      setGrade(currentGrade);
      setCollege(currentCollege ?? '');
      setMajor(currentMajor ?? '');
      setError(null);
    }
  }, [open, currentName, currentGrade, currentCollege, currentMajor]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsedName = userNameSchema.safeParse(name);
    if (!parsedName.success) {
      setError(parsedName.error.issues[0]?.message ?? '이름을 확인해 주세요.');
      return;
    }
    // 전환기 fail-open: college/major API 미배포 시 currentCollege/currentMajor 가
    // undefined 라 셀렉트·입력이 비어 있다. 이 경우 이름·학년만 수정하려는 사용자를
    // 막지 않도록 하드 게이트하지 않고, 비어 있으면 payload 에서 생략한다
    // (시드된 뒤에는 CollegeSelect placeholder 가 disabled 라 college 를 다시 비울 수 없다).
    const trimmedMajor = major.trim();
    if (trimmedMajor !== '') {
      // 값이 있으면 정책 검증(길이 등). payload 와 동일하게 trim 값으로 일원화한다.
      const parsedMajor = majorSchema.safeParse(trimmedMajor);
      if (!parsedMajor.success) {
        setError(parsedMajor.error.issues[0]?.message ?? '전공 학과를 확인해 주세요.');
        return;
      }
    } else if (currentMajor?.trim()) {
      // 시드된 필수 필드를 비워 저장하는 것은 명시적 에러(침묵 복원 금지).
      setError('전공 학과는 필수 입력값입니다.');
      return;
    }
    // trimmedMajor 가 비었고 currentMajor 도 없으면(전환기) 에러 없이 진행 — major 생략.
    setError(null);

    // college 는 유효한 College 값일 때만, major 는 trim 후 비어있지 않을 때만 담는다
    // — 시드 부재 시 서버 값을 빈 값으로 덮어쓰지 않기 위함(BE null=기존 값 유지).
    const payload: UpdateProfilePayload = { name: parsedName.data, grade };
    if (isCollege(college)) {
      payload.college = college;
    }
    if (trimmedMajor !== '') {
      payload.major = trimmedMajor;
    }

    updateMutation.mutate(
      payload,
      {
        onSuccess: () => {
          addToast('프로필을 수정했어요.');
          onClose();
        },
        onError: (mutationError) => {
          setError(
            mutationError instanceof ApiError
              ? mutationError.message
              : '수정에 실패했어요. 잠시 후 다시 시도해 주세요.',
          );
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/* 별도 설명 문구가 없는 폼 다이얼로그 — Description 연결을 명시적으로 해제한다(Radix a11y 경고 억제). */}
      <DialogContent busy={updateMutation.isPending} aria-describedby={undefined}>
        <DialogTitle>프로필 수정</DialogTitle>
        {/* 검증은 JS(userNameSchema/majorSchema)로 친절한 한글 메시지를 노출한다.
            CollegeSelect 의 native required 가 빈 값일 때 submit 을 막지 않도록 noValidate. */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-charcoal-2">이름</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={7}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="profile-grade" className="text-[13px] font-semibold text-charcoal-2">학년</label>
            <GradeSelect id="profile-grade" value={grade} onChange={setGrade} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="profile-college" className="text-[13px] font-semibold text-charcoal-2">단과대학</label>
            <CollegeSelect id="profile-college" value={college} onChange={setCollege} />
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-charcoal-2">전공</span>
            <input
              value={major}
              onChange={(event) => setMajor(event.target.value)}
              maxLength={50}
              placeholder="학과명 입력 (예: 컴퓨터정보공학부)"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
            />
          </label>
          {error && <p className="text-[12.5px] text-coral">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={updateMutation.isPending}
              className="btn btn-ghost btn-sm"
            >
              취소
            </button>
            <button type="submit" disabled={updateMutation.isPending} className="btn btn-primary btn-sm">
              {updateMutation.isPending && <ButtonSpinner />}저장
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
