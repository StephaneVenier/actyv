'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ProgramEditorForm } from '@/components/program-editor-form';
import { supabase } from '@/lib/supabase';
import { TrainingProgram, TrainingProgramSession } from '@/lib/training-programs';

export default function EditProgramPage() {
  const params = useParams();
  const id = params?.id as string;

  const [program, setProgram] = useState<TrainingProgram | null>(null);
  const [programSessions, setProgramSessions] = useState<TrainingProgramSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadProgram = async () => {
      setLoading(true);
      setMessage(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (userError) {
            console.error('Erreur chargement user edition programme :', userError);
          }
          setMessage('Connecte-toi pour modifier ce programme.');
          return;
        }

        const [programResponse, sessionsResponse] = await Promise.all([
          supabase
            .from('training_programs')
            .select('id, user_id, name, description, sport, duration_weeks, visibility, start_date, created_at')
            .eq('id', id)
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('training_program_sessions')
            .select('id, program_id, session_id, session_name, sport, week_number, day_of_week, order_index, created_at')
            .eq('program_id', id)
            .order('week_number', { ascending: true })
            .order('day_of_week', { ascending: true })
            .order('order_index', { ascending: true }),
        ]);

        if (programResponse.error) {
          console.error('Erreur chargement programme edition :', programResponse.error);
          setMessage('Impossible de charger ce programme.');
          return;
        }

        if (!programResponse.data) {
          setMessage('Ce programme est introuvable.');
          return;
        }

        setProgram(programResponse.data as TrainingProgram);

        if (sessionsResponse.error) {
          console.error('Erreur chargement sessions programme edition :', sessionsResponse.error);
          setProgramSessions([]);
        } else {
          setProgramSessions((sessionsResponse.data as TrainingProgramSession[]) || []);
        }
      } finally {
        setLoading(false);
      }
    };

    loadProgram();
  }, [id]);

  return (
    <AppShell>
      <section className="sessions-page">
        <article className="card session-hero-card">
          <div className="session-hero-copy">
            <span className="section-kicker">Programmes</span>
            <h1>Modifier le programme</h1>
            <p className="muted">
              Ajuste le planning, remplace une seance existante ou configure une vraie seance directement ici.
            </p>
          </div>

          <div className="session-hero-actions">
            <Link href={`/programs/${id}`} className="button ghost">
              Retour au detail
            </Link>
          </div>
        </article>

        {loading ? (
          <div className="challenge-state">
            <p>Chargement du programme...</p>
          </div>
        ) : !program ? (
          <div className="challenge-state">
            <p>{message || 'Ce programme est introuvable.'}</p>
          </div>
        ) : (
          <ProgramEditorForm
            mode="edit"
            programId={id}
            initialProgram={program}
            initialProgramSessions={programSessions}
            submitLabel="Enregistrer les modifications"
          />
        )}
      </section>
    </AppShell>
  );
}
