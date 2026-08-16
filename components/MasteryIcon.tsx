'use client';

type MasteryIconProps = {
  categoryId: string;
  className?: string;
};

export function renderMasteryCategoryIcon(categoryId: string) {
  switch (categoryId) {
    case 'fitness':
      return (
        <>
          <path d="M6 16c2-4 4-6 8-8" />
          <path d="M10 7c1 1.5 1.5 3.2 1.5 5.2" />
          <path d="M14.5 8.5 18 5l1 1-3.2 3.3" />
          <path d="M5 19c2.6-1.2 4.8-1.2 7.2-.4" />
        </>
      );
    case 'musculation':
      return (
        <>
          <path d="M4 10v4" />
          <path d="M7 8v8" />
          <path d="M17 8v8" />
          <path d="M20 10v4" />
          <path d="M7 12h10" />
        </>
      );
    case 'course':
    case 'course-a-pied':
      return (
        <>
          <circle cx="16.5" cy="6" r="1.5" />
          <path d="M8 18l3-5 2 1.2 1.8 3.8" />
          <path d="M11 8l2.4 1.2 2.6-.6" />
          <path d="M10.5 11.5 8 14" />
        </>
      );
    case 'trail':
      return (
        <>
          <path d="m3 18 5-7 3 4 3-6 7 9" />
          <path d="m9 10 1.5-2 1.5 2" />
        </>
      );
    case 'marche':
      return (
        <>
          <path d="M8 18c1-2.4.8-4.7-.5-5.5-1.2-.7-2.9.5-3.8 2.7-.7 1.8-.6 3.7.5 4.4 1 .6 2.4-.2 3.8-1.6Z" />
          <path d="M16 20c1-2.4.8-4.7-.5-5.5-1.2-.7-2.9.5-3.8 2.7-.7 1.8-.6 3.7.5 4.4 1 .6 2.4-.2 3.8-1.6Z" />
        </>
      );
    case 'velo':
      return (
        <>
          <circle cx="7" cy="16" r="3" />
          <circle cx="17" cy="16" r="3" />
          <path d="M9 16h3l2-5h3" />
          <path d="M11 11 9 16" />
        </>
      );
    case 'natation':
      return (
        <>
          <path d="M4 16c1.2 1 2.4 1 3.6 0 1.2-1 2.4-1 3.6 0 1.2 1 2.4 1 3.6 0 1.2-1 2.4-1 3.6 0" />
          <path d="M7 11c1-1.8 2.2-2.8 3.8-2.8 1.5 0 2.8.9 3.8 2.8" />
          <path d="M9.5 9.5 12 7l2.5 2.5" />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="7" />;
  }
}

export function MasteryIcon({ categoryId, className }: MasteryIconProps) {
  return (
    <span className={className || 'mastery-icon'} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {renderMasteryCategoryIcon(categoryId)}
      </svg>
    </span>
  );
}
