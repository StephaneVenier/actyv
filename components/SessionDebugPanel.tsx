'use client';

type SessionDebugPanelProps = {
  componentName: string;
  routeLabel: string;
  sessionId: string;
  error: Error | null;
  snapshot?: unknown;
};

export function SessionDebugPanel({
  componentName,
  routeLabel,
  sessionId,
  error,
  snapshot,
}: SessionDebugPanelProps) {
  const stack = error?.stack || 'No stack available';

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '24px',
        background: '#071112',
        color: '#f4f7f6',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          border: '1px solid rgba(53, 230, 107, 0.28)',
          borderRadius: '16px',
          background: 'rgba(10, 18, 20, 0.92)',
          padding: '20px',
        }}
      >
        <p style={{ margin: 0, color: '#35e66b', fontSize: '12px', letterSpacing: '0.08em' }}>
          DIAGNOSTIC TEMPORAIRE
        </p>
        <h1 style={{ margin: '8px 0 12px', fontSize: '24px', lineHeight: 1.2 }}>
          Erreur au chargement de la page séance
        </h1>

        <div style={{ display: 'grid', gap: '12px' }}>
          <section>
            <h2 style={{ margin: '0 0 6px', fontSize: '14px', color: '#20b7a6' }}>Message erreur</h2>
            <pre style={preStyle}>{error?.message || 'Erreur inconnue'}</pre>
          </section>

          <section>
            <h2 style={{ margin: '0 0 6px', fontSize: '14px', color: '#20b7a6' }}>Stack</h2>
            <pre style={preStyle}>{stack}</pre>
          </section>

          <section>
            <h2 style={{ margin: '0 0 6px', fontSize: '14px', color: '#20b7a6' }}>Contexte</h2>
            <pre style={preStyle}>
              {safeStringify({
                componentName,
                routeLabel,
                sessionId,
                errorName: error?.name ?? null,
                errorStack: error?.stack ?? null,
                supabaseSnapshot: snapshot ?? null,
              })}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: '14px',
  borderRadius: '12px',
  background: '#0d1719',
  color: '#f4f7f6',
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontSize: '12px',
  lineHeight: 1.5,
};

function safeStringify(value: unknown) {
  const seen = new WeakSet<object>();

  try {
    return JSON.stringify(
      value,
      (_key, currentValue) => {
        if (currentValue instanceof Error) {
          return {
            name: currentValue.name,
            message: currentValue.message,
            stack: currentValue.stack,
          };
        }

        if (currentValue && typeof currentValue === 'object') {
          if (seen.has(currentValue as object)) {
            return '[Circular]';
          }

          seen.add(currentValue as object);
        }

        return currentValue;
      },
      2
    );
  } catch (error) {
    return `Unable to serialize diagnostic snapshot: ${error instanceof Error ? error.message : String(error)}`;
  }
}
