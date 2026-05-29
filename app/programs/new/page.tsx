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
              Construis, planifie et partage tes seances sur plusieurs semaines.
            </p>
          </div>

          <div className="session-hero-actions">
            <Link href="/programs" className="button ghost">
              Voir mes programmes
            </Link>
          </div>
        </article>

        <article className="card session-form-card program-placeholder-card">
          <div className="program-placeholder-card__copy">
            <span className="section-kicker">Demarrage rapide</span>
            <h2>Cadre du programme</h2>
            <p className="muted">
              Commence par definir le nom du programme, le sport principal, la duree en
              semaines et une description. Le formulaire ci-dessous enregistre deja ton
              programme, et la planification detaillee continue d&apos;evoluer.
            </p>
          </div>

          <div className="program-placeholder-form">
            <div className="program-placeholder-form__field">
              <span>Nom du programme</span>
              <strong>Nom, sport, duree et description</strong>
            </div>
            <div className="program-placeholder-form__field">
              <span>Sport principal</span>
              <strong>Choix libre</strong>
            </div>
            <div className="program-placeholder-form__field">
              <span>Duree en semaines</span>
              <strong>Cadence simple</strong>
            </div>
            <div className="program-placeholder-form__field">
              <span>Description</span>
              <strong>Resume du cycle</strong>
            </div>
          </div>

          <p className="muted">Creation connectee a ton compte. Tu pourras enrichir la planification ensuite.</p>
        </article>

        <ProgramEditorForm mode="create" submitLabel="Enregistrer le programme" />
      </section>
    </AppShell>
  );
}
