'use client';

import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { ProgramEditorForm } from '@/components/program-editor-form';

export default function NewProgramPage() {
  return (
    <AppShell>
      <section className="sessions-page">
        <article className="card session-hero-card">
          <div className="session-hero-copy">
            <span className="section-kicker">Programmes</span>
            <h1>Creer un programme</h1>
            <p className="muted">
              Planifie plusieurs seances sur plusieurs semaines, avec des seances existantes ou
              configurees directement dans le programme.
            </p>
          </div>

          <div className="session-hero-actions">
            <Link href="/programs" className="button ghost">
              Voir mes programmes
            </Link>
          </div>
        </article>

        <ProgramEditorForm mode="create" submitLabel="Enregistrer le programme" />
      </section>
    </AppShell>
  );
}
