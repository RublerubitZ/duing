'use client';

import { PROJECT_ICONS, type ProjectIcon } from '@duing/types';
import { PROJECT_ICON_COMPONENTS } from '@/app/_lib/projectIcons';

type Props = { value: ProjectIcon; onChange: (next: ProjectIcon) => void };

export function ProjectIconPicker({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="아이콘 선택" className="grid grid-cols-10 gap-1.5 max-sm:grid-cols-5">
      {PROJECT_ICONS.map((icon) => {
        const IconComponent = PROJECT_ICON_COMPONENTS[icon];
        const selected = value === icon;
        return (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={icon}
            onClick={() => onChange(icon)}
            className={`grid h-9 w-9 place-items-center rounded-[8px] border transition-colors ${
              selected
                ? 'border-ink bg-sage-mist text-ink-deep'
                : 'border-line bg-white text-charcoal-3 hover:border-sage hover:text-charcoal-2'
            }`}
          >
            <IconComponent className="h-[18px] w-[18px]" />
          </button>
        );
      })}
    </div>
  );
}
