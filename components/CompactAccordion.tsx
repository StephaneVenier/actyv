import type { ReactNode } from 'react';

type CompactAccordionProps = {
  title: string;
  kicker?: string;
  summary?: string;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
};

export function CompactAccordion({
  title,
  kicker,
  summary,
  trailing,
  children,
  className = '',
  contentClassName = '',
  defaultOpen = false,
}: CompactAccordionProps) {
  return (
    <details className={`compact-accordion ${className}`.trim()} {...(defaultOpen ? { open: true } : {})}>
      <summary className="compact-accordion__summary">
        <div className="compact-accordion__heading">
          <span className="compact-accordion__chevron" aria-hidden="true" />
          <div className="compact-accordion__copy">
            {kicker ? <span className="section-kicker compact-accordion__kicker">{kicker}</span> : null}
            <strong className="compact-accordion__title">{title}</strong>
            {summary ? <span className="compact-accordion__meta">{summary}</span> : null}
          </div>
        </div>

        {trailing ? <div className="compact-accordion__trailing">{trailing}</div> : null}
      </summary>

      <div className={`compact-accordion__content ${contentClassName}`.trim()}>{children}</div>
    </details>
  );
}
