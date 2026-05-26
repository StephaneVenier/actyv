'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { SessionBlocksEditor } from '@/components/session-blocks-editor';
import { queuePendingToast } from '@/components/ToastProvider';
import { sports } from '@/components/challenge-data';
import {
  createEmptySessionBlockDraft,
  getInvalidSessionBlock,
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
import { awardXp } from '@/lib/gamification';
import { supabase } from '@/lib/supabase';
import { insertTrainingSessionBlocks } from '@/lib/training-session-blocks-db';

function formatDurationLabel(durationSeconds: number | null) {
  if (!durationSeconds || durationSeconds <= 0) return '—';

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  if (minutes <= 0) {
    return `${seconds} sec`;
  }

  return `${minutes} min${seconds > 0 ? ` ${seconds.toString().padStart(2, '0')}` : ''}`;
}

export default function NewSessionPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [description, setDescription] = useState('');
  const [blocks, setBlocks] = useState<SessionBlockDraft[]>([createEmptySessionBlockDraft(0)]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

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
  const progressLabel =
    blocks.length > 0 ? `${validBlocksCount} / ${blocks.length}` : '—';

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
    if (loading) return;

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

    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage('Connecte-toi pour creer une seance.');
        return;
      }

      const { data: session, error: sessionError } = await supabase
        .from('training_sessions')
        .insert({
          user_id: user.id,
          name: name.trim(),
          sport,
          description: description.trim() || null,
        })
        .select('id')
        .single();

      if (sessionError || !session) {
        console.error('Erreur creation seance :', sessionError);
        setMessage('Impossible de creer la seance pour le moment.');
        return;
      }

      const { error: blocksError } = await insertTrainingSessionBlocks(session.id, normalizedBlocks);

      if (blocksError) {
        setMessage("La seance a ete creee mais les blocs n'ont pas pu etre enregistres.");
        return;
      }

      const xpResult = await awardXp({
        userId: user.id,
        source: 'session_created',
        metadata: { target_id: session.id },
      });

      if (xpResult?.error) {
        console.error('XP award failed', {
          payload: {
            user_id: user.id,
            event_type: 'session_created',
            source_type: 'training_session',
            source_id: session.id,
            xp_amount: 5,
          },
          error: xpResult.error,
        });
      }

      if (xpResult?.awarded) {
        queuePendingToast({ message: '+5 XP seance creee', tone: 'info' });
      }
      queuePendingToast({ message: 'Seance creee', tone: 'success' });
      router.push(`/sessions/${session.id}`);
    } catch (error) {
      console.error('Erreur inattendue creation seance :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <section className="sessions-page sessions-page--dark">
        <article className="card session-hero-card">
          <div className="session-hero-copy">
            <span className="section-kicker">Seances</span>
            <h1>Creer une seance</h1>
            <p className="muted">
              Construis une seance simple et efficace : blocs en repetitions, duree, distance ou libre.
            </p>
          </div>

          <div className="session-hero-actions">
            <Link href="/sessions" className="button ghost">
              Voir mes seances
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
            <strong>{progressLabel}</strong>
          </div>
        </article>

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
                    disabled={loading}
                  />
                </div>

                <div className="field">
                  <label htmlFor="session-sport">Sport</label>
                  <select
                    id="session-sport"
                    value={sport}
                    onChange={(event) => setSport(event.target.value)}
                    disabled={loading}
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
                    disabled={loading}
                  />
                </div>
              </div>

              {message ? <p className="form-feedback form-feedback--error">{message}</p> : null}
            </article>

            <aside className="card session-advice-card">
              <span className="section-kicker">Conseil</span>
              <h2>Structure utile</h2>
              <p>
                Structure ta seance avec des blocs adaptes a ton objectif. Tu pourras les
                reordonner et les ajuster ensuite sans recreer la base.
              </p>
            </aside>
          </div>

          <SessionBlocksEditor
            blocks={blocks}
            disabled={loading}
            onAddBlock={addBlock}
            onRemoveBlock={removeBlock}
            onUpdateBlock={updateBlock}
          />

          <article className="card session-summary-card session-editor-footer">
            <div>
              <span className="section-kicker">Resume</span>
              <h2>Prete a etre creee</h2>
              <p className="muted">
                {validBlocksCount} bloc{validBlocksCount > 1 ? 's' : ''} pret
                {validBlocksCount > 1 ? 's' : ''} a etre enregistres.
              </p>
            </div>

            <div className="session-summary-actions">
              <Link href="/sessions" className="button ghost">
                Annuler
              </Link>
              <button type="submit" className="button primary" disabled={loading} aria-busy={loading}>
                {loading ? 'Creation...' : 'Creer la seance'}
              </button>
            </div>
          </article>
        </form>
      </section>
    </AppShell>
  );
}
