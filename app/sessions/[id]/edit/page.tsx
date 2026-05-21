'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { SessionBlocksEditor } from '@/components/session-blocks-editor';
import { queuePendingToast } from '@/components/ToastProvider';
import { sports } from '@/components/challenge-data';
import {
  createEmptySessionBlockDraft,
  getInvalidSessionBlock,
  mapSessionBlockRecordToDraft,
  normalizeDraftSessionBlocks,
  SessionBlockDraft,
} from '@/lib/session-draft-blocks';
import {
  formatEstimatedWorkoutCalories,
  formatSessionVolumeKg,
  getEstimatedWorkoutCalories,
  getSessionEstimatedDuration,
  getSessionEstimatedVolume,
} from '@/lib/session-blocks';
import { supabase } from '@/lib/supabase';
import { fetchTrainingSessionBlocks, insertTrainingSessionBlocks } from '@/lib/training-session-blocks-db';

type TrainingSession = {
  id: string;
  user_id: string;
  name: string;
  sport: string | null;
  description: string | null;
};

function formatDurationLabel(durationSeconds: number | null) {
  if (!durationSeconds || durationSeconds <= 0) return '—';

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  if (minutes <= 0) {
    return `${seconds} sec`;
  }

  return `${minutes} min${seconds > 0 ? ` ${seconds.toString().padStart(2, '0')}` : ''}`;
}

export default function EditSessionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [description, setDescription] = useState('');
  const [blocks, setBlocks] = useState<SessionBlockDraft[]>([createEmptySessionBlockDraft(0)]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      setLoading(true);
      setMessage('');

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (userError) {
            console.error('Erreur chargement utilisateur edition seance :', userError);
          }
          setMessage('Connecte-toi pour modifier cette seance.');
          return;
        }

        const { data: sessionRow, error: sessionError } = await supabase
          .from('training_sessions')
          .select('id, user_id, name, sport, description')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (sessionError) {
          console.error('Erreur chargement seance edition :', sessionError);
          setMessage('Impossible de charger cette seance.');
          return;
        }

        if (!sessionRow) {
          setMessage('Cette seance est introuvable.');
          return;
        }

        const session = sessionRow as TrainingSession;
        setName(session.name || '');
        setSport(session.sport || '');
        setDescription(session.description || '');

        const { data: blockRows, error: blocksError } = await fetchTrainingSessionBlocks([id]);

        if (blocksError) {
          console.error('Erreur chargement blocs edition seance :', blocksError);
          setBlocks([createEmptySessionBlockDraft(0)]);
          return;
        }

        setBlocks(
          blockRows && blockRows.length > 0
            ? blockRows.map(mapSessionBlockRecordToDraft)
            : [createEmptySessionBlockDraft(0)]
        );
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [id]);

  const validBlocksCount = useMemo(() => blocks.filter((block) => block.name.trim()).length, [blocks]);
  const normalizedBlocks = useMemo(() => normalizeDraftSessionBlocks(blocks), [blocks]);
  const estimatedDurationSeconds = useMemo(
    () => getSessionEstimatedDuration(normalizedBlocks),
    [normalizedBlocks]
  );
  const estimatedVolume = useMemo(
    () => getSessionEstimatedVolume(normalizedBlocks),
    [normalizedBlocks]
  );
  const estimatedCalories = useMemo(
    () => getEstimatedWorkoutCalories(estimatedDurationSeconds, sport),
    [estimatedDurationSeconds, sport]
  );

  const updateBlock = (blockId: string, updates: Partial<SessionBlockDraft>) => {
    setBlocks((current) => current.map((block) => (block.id === blockId ? { ...block, ...updates } : block)));
  };

  const addBlock = () => {
    setBlocks((current) => [...current, createEmptySessionBlockDraft(current.length)]);
  };

  const removeBlock = (blockId: string) => {
    setBlocks((current) => (current.length > 1 ? current.filter((block) => block.id !== blockId) : current));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    setMessage('');

    if (!name.trim() || !sport) {
      setMessage('Renseigne le nom de la seance et le sport associe.');
      return;
    }

    if (normalizedBlocks.length === 0) {
      setMessage('Ajoute au moins un bloc simple pour enregistrer la seance.');
      return;
    }

    const invalidBlock = getInvalidSessionBlock(normalizedBlocks);

    if (invalidBlock) {
      setMessage(
        'Chaque bloc doit avoir un nombre de series valide, un repos valide, une cible valide si necessaire, et une charge positive si renseignee.'
      );
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage('Connecte-toi pour modifier cette seance.');
        return;
      }

      const { error: sessionError } = await supabase
        .from('training_sessions')
        .update({
          name: name.trim(),
          sport,
          description: description.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id);

      if (sessionError) {
        console.error('Erreur mise a jour seance :', sessionError);
        setMessage('Impossible de mettre a jour la seance pour le moment.');
        return;
      }

      const { error: deleteBlocksError } = await supabase
        .from('training_session_blocks')
        .delete()
        .eq('session_id', id);

      if (deleteBlocksError) {
        console.error('Erreur suppression anciens blocs seance :', deleteBlocksError);
        setMessage("La seance a ete mise a jour mais les anciens blocs n'ont pas pu etre remplaces.");
        return;
      }

      const { error: blocksError } = await insertTrainingSessionBlocks(id, normalizedBlocks);

      if (blocksError) {
        setMessage("La seance a ete mise a jour mais les blocs n'ont pas pu etre enregistres.");
        return;
      }

      queuePendingToast({ message: 'Seance mise a jour', tone: 'success' });
      router.push(`/sessions/${id}`);
    } catch (error) {
      console.error('Erreur inattendue mise a jour seance :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <section className="sessions-page sessions-page--dark">
        <article className="card session-hero-card">
          <div className="session-hero-copy">
            <span className="section-kicker">Seances</span>
            <h1>Modifier la seance</h1>
            <p className="muted">
              Ajuste la structure, les blocs et les details sans recreer une nouvelle fiche.
            </p>
          </div>

          <div className="session-hero-actions">
            <Link href={`/sessions/${id}`} className="button ghost">
              Retour au detail
            </Link>
          </div>
        </article>

        <article className="card session-creation-overview">
          <div className="session-creation-overview__stat">
            <span>Duree estimee</span>
            <strong>{formatDurationLabel(estimatedDurationSeconds)}</strong>
          </div>
          <div className="session-creation-overview__stat">
            <span>Blocs</span>
            <strong>{blocks.length || '—'}</strong>
          </div>
          <div className="session-creation-overview__stat">
            <span>Volume estime</span>
            <strong>{formatSessionVolumeKg(estimatedVolume) || '—'}</strong>
          </div>
          <div className="session-creation-overview__stat">
            <span>Calories estimees</span>
            <strong>{formatEstimatedWorkoutCalories(estimatedCalories) || '—'}</strong>
          </div>
          <div className="session-creation-overview__stat">
            <span>Progression</span>
            <strong>{blocks.length > 0 ? `${validBlocksCount} / ${blocks.length}` : '—'}</strong>
          </div>
        </article>

        {loading ? (
          <div className="challenge-state">
            <p>Chargement de la seance...</p>
          </div>
        ) : (
          <form className="sessions-layout" onSubmit={handleSubmit}>
            <div className="session-general-grid">
              <article className="card session-form-card stack session-general-card">
                <div className="session-form-grid">
                  <div className="field">
                    <label htmlFor="session-name">Nom de la seance</label>
                    <input
                      id="session-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Ex : VMA courte, Circuit cardio, Sortie recup"
                      disabled={saving}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="session-sport">Sport</label>
                    <select
                      id="session-sport"
                      value={sport}
                      onChange={(event) => setSport(event.target.value)}
                      disabled={saving}
                    >
                      <option value="">Choisir un sport</option>
                      {sports.map((sportItem) => (
                        <option key={sportItem} value={sportItem}>
                          {sportItem}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field full">
                    <label htmlFor="session-description">Description</label>
                    <textarea
                      id="session-description"
                      rows={4}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Objectif de la seance, intensite, consigne generale..."
                      disabled={saving}
                    />
                  </div>
                </div>

                {message ? <p className="form-feedback form-feedback--error">{message}</p> : null}
              </article>

              <aside className="card session-advice-card">
                <span className="section-kicker">Conseil</span>
                <h2>Ajustement rapide</h2>
                <p>
                  Modifie le format des blocs, la charge et le repos sans perdre la structure
                  generale. Les changements restent compatibles avec le mode live et les programmes.
                </p>
              </aside>
            </div>

            <SessionBlocksEditor
              blocks={blocks}
              disabled={saving}
              onAddBlock={addBlock}
              onRemoveBlock={removeBlock}
              onUpdateBlock={updateBlock}
            />

            <article className="card session-summary-card session-editor-footer">
              <div>
                <span className="section-kicker">Resume</span>
                <h2>Prete a etre mise a jour</h2>
                <p className="muted">
                  {validBlocksCount} bloc{validBlocksCount > 1 ? 's' : ''} pret
                  {validBlocksCount > 1 ? 's' : ''} a etre mis a jour.
                </p>
              </div>

              <div className="session-summary-actions">
                <Link href={`/sessions/${id}`} className="button ghost">
                  Annuler
                </Link>
                <button type="submit" className="button primary" disabled={saving} aria-busy={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </button>
              </div>
            </article>
          </form>
        )}
      </section>
    </AppShell>
  );
}
