import type { ClubProject } from '@duing/types';

import { PROJECT_ICON_COMPONENTS, projectCardTone } from '../../../_lib/projectIcons';

type Props = {
  projects: ClubProject[];
};

/** "이런 활동을 해요" 랜딩 섹션 — KPI 가 아닌 활동 소개 카드. 0개면 미렌더. */
export function ClubDetailActivityIntro({ projects }: Props) {
  if (projects.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-[20px] font-bold text-ink-deep">이런 활동을 해요</h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {projects.map((project, index) => {
          const IconComponent = PROJECT_ICON_COMPONENTS[project.icon];
          return (
            <li
              key={`${project.title}-${index}`}
              className="rounded-[18px] border border-line bg-white p-5 shadow-1"
            >
              <span
                className={`mb-3 grid h-11 w-11 place-items-center rounded-[12px] ${projectCardTone(index)}`}
              >
                <IconComponent aria-hidden className="h-5 w-5 text-ink-deep" />
              </span>
              <p className="text-[15px] font-semibold text-ink-deep">{project.title}</p>
              {project.subtitle !== null && (
                <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-charcoal-2">
                  {project.subtitle}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
