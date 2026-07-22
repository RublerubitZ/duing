import type { ClubProject } from '@duing/types';
import { PROJECT_ICON_COMPONENTS, projectCardTone } from '../../../_lib/projectIcons';

type Props = {
  description: string | null;
  highlights: string[];
  projects: ClubProject[];
};

// 한줄 소개는 탐색 카드 전용, 해시태그는 상세 히어로(이름 아래) 담당 — 여기는 소개 본문·프로젝트만 다룬다.
export function ClubDetailAbout({ description, highlights, projects }: Props) {
  const hasAny = description !== null || highlights.length > 0 || projects.length > 0;
  if (!hasAny) return null;

  return (
    <article className="max-w-[700px] text-[15.5px] leading-relaxed text-charcoal">
      {description && <p className="mb-6 whitespace-pre-wrap">{description}</p>}

      {highlights.length > 0 && (
        <>
          <h3 className="mt-6 mb-3 font-bold text-ink-deep">이런 사람이 좋아할 거예요</h3>
          <ul className="mb-6 space-y-2">
            {highlights.map((item, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="text-ink">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {projects.length > 0 && (
        <>
          <h3 className="mt-6 mb-3 font-bold text-ink-deep">주요 프로젝트</h3>
          <ul className="space-y-2">
            {projects.map((project, idx) => {
              const IconComponent = PROJECT_ICON_COMPONENTS[project.icon];
              return (
                <li
                  key={`${project.title}-${idx}`}
                  className="flex items-center gap-3 rounded-[12px] border border-line bg-white px-3 py-2.5"
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] ${projectCardTone(idx)}`}
                  >
                    <IconComponent aria-hidden className="h-5 w-5 text-ink-deep" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink-deep">{project.title}</span>
                    {project.subtitle !== null && (
                      <span className="mt-0.5 block truncate text-[12px] text-charcoal-3">{project.subtitle}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </article>
  );
}
