'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { SessionExercisePicker } from '@/components/session-exercise-picker';
import { queuePendingToast } from '@/components/ToastProvider';
import { sports } from '@/components/challenge-data';
import {
  formatSessionBlockSummary,
  getSessionBlockInputLabel,
  getSessionBlockPlaceholder,
  getSessionBlockTypeLabel,
  normalizeSessionSetsCount,
  SESSION_BLOCK_TYPES,
  SessionBlockType,
} from '@/lib/session-blocks';
import { supabase } from '@/lib/supabase';
import { insertTrainingSessionBlocks } from '@/lib/training-session-blocks-db';

type DraftBlock = {
  id: string;
  name: string;
  blockType: SessionBlockType;
  sets_count: number | '';
  targetValue: string;
  chargeKg: string;
};

function createEmptyBlock(index: number): DraftBlock {
  return {
    id: `block-${Date.now()}-${index}`,
    name: '',
    blockType: 'reps',
    sets_count: 1,
    targetValue: '',
    chargeKg: '',
  };
}

export default function NewSessionPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [description, setDescription] = useState('');
  const [blocks, setBlocks] = useState<DraftBlock[]>([createEmptyBlock(0)]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const validBlocksCount = useMemo(
    () => blocks.filter((block) => block.name.trim()).length,
    [blocks]
  );

  const updateBlock = (blockId: string, updates: Partial<DraftBlock>) => {
    setBlocks((current) =>
      current.map((block) => (block.id === blockId ? { ...block, ...updates } : block))
    );
  };

  const addBlock = () => {
    setBlocks((current) => [...current, createEmptyBlock(current.length)]);
  };

  const removeBlock = (blockId: string) => {
    setBlocks((current) => (current.length > 1 ? current.filter((block) => block.id !== blockId) : current));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setMessage('');

    if (!name.trim() || !sport) {
      setMessage('Renseigne le nom de la séance et le sport associé.');
      return;
    }

    const normalizedBlocks = blocks
      .map((block, index) => ({
        position: index,
        name: block.name.trim(),
        block_type: block.blockType,
        sets_count: normalizeSessionSetsCount(block.sets_count),
        target_value:
          block.blockType === 'free' || block.targetValue.trim() === ''
            ? null
            : Number(block.targetValue),
        charge_kg: block.chargeKg.trim() === '' ? null : Number(block.chargeKg),
      }))
      .filter((block) => block.name);

    if (normalizedBlocks.length === 0) {
      setMessage('Ajoute au moins un bloc simple pour enregistrer la séance.');
      return;
    }

    const invalidBlock = normalizedBlocks.find(
      (block) =>
        Number.isNaN(block.sets_count) ||
        block.sets_count <= 0 ||
        !Number.isInteger(block.sets_count) ||
        (block.charge_kg !== null && (Number.isNaN(block.charge_kg) || block.charge_kg <= 0)) ||
        (block.block_type !== 'free' &&
          (block.target_value === null || Number.isNaN(block.target_value) || block.target_value <= 0))
    );

    if (invalidBlock) {
      setMessage(
        'Chaque bloc doit avoir un nombre de series valide, une cible valide si necessaire, et une charge positive si renseignee.'
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
        setMessage('Connecte-toi pour créer une séance.');
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
        console.error('Erreur création séance :', sessionError);
        setMessage('Impossible de créer la séance pour le moment.');
        return;
      }

      const { error: blocksError } = await insertTrainingSessionBlocks(session.id, normalizedBlocks);

      if (blocksError) {
        setMessage("La seance a ete creee mais les blocs n'ont pas pu etre enregistres.");
        return;
      }

      queuePendingToast({ message: 'Seance creee', tone: 'success' });
      router.push(`/sessions/${session.id}`);
    } catch (error) {
      console.error('Erreur inattendue création séance :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <section className="sessions-page">
        <article className="card session-hero-card">
          <div className="session-hero-copy">
            <span className="section-kicker">Seances</span>
            <h1>Creer une seance</h1>
            <p className="muted">
              Construis une séance simple, quel que soit le sport : blocs en répétitions, durée,
              distance ou libre.
            </p>
          </div>

          <div className="session-hero-actions">
            <Link href="/sessions" className="button ghost">
              Voir mes seances
            </Link>
          </div>
        </article>

        <form className="sessions-layout" onSubmit={handleSubmit}>
          <article className="card session-form-card stack">
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
                  placeholder="Objectif de la séance, intensité, consigne générale..."
                  disabled={loading}
                />
              </div>
            </div>

            {message && <p className="form-feedback form-feedback--error">{message}</p>}
          </article>

          <article className="card session-form-card stack">
            <div className="session-blocks-header">
              <div>
                <span className="section-kicker">Blocs</span>
                <h2>Structure de la seance</h2>
              </div>

              <button type="button" className="button ghost" onClick={addBlock} disabled={loading}>
                + Ajouter un bloc
              </button>
            </div>

            <div className="session-block-list">
              {blocks.map((block, index) => (
                <article key={block.id} className="session-block-card">
                  <div className="session-block-card__top">
                    <strong>Bloc {index + 1}</strong>
                    <button
                      type="button"
                      className="button ghost session-block-remove"
                      onClick={() => removeBlock(block.id)}
                      disabled={loading || blocks.length === 1}
                    >
                      Retirer
                    </button>
                  </div>

                  <div className="session-form-grid">
                    <div className="field">
                      <label>Nom du bloc</label>
                      <div className="session-block-name-field">
                        <SessionExercisePicker
                          disabled={loading}
                          onSelectExercise={(exerciseName) =>
                            updateBlock(block.id, { name: exerciseName })
                          }
                        />
                      </div>
                      <input
                        value={block.name}
                        onChange={(event) => updateBlock(block.id, { name: event.target.value })}
                        placeholder="Ex : Pompes, Gainage, 400m rapide"
                        disabled={loading}
                      />
                    </div>

                    <div className="field">
                      <label>Type</label>
                      <select
                        value={block.blockType}
                        onChange={(event) =>
                          updateBlock(block.id, {
                            blockType: event.target.value as SessionBlockType,
                            targetValue:
                              event.target.value === 'free' ? '' : block.targetValue,
                          })
                        }
                        disabled={loading}
                      >
                        {SESSION_BLOCK_TYPES.map((blockType) => (
                          <option key={blockType} value={blockType}>
                            {getSessionBlockTypeLabel(blockType)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label>Series</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={block.sets_count}
                        onChange={(event) =>
                          updateBlock(block.id, {
                            sets_count:
                              event.target.value.trim() === ''
                                ? ''
                                : normalizeSessionSetsCount(event.target.value),
                          })
                        }
                        placeholder="Ex : 3"
                        disabled={loading}
                      />
                    </div>

                    <div className="field">
                      <label>Charge (kg)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={block.chargeKg}
                        onChange={(event) => updateBlock(block.id, { chargeKg: event.target.value })}
                        placeholder="Ex : 80"
                        disabled={loading}
                      />
                    </div>

                    <div className="field full">
                      <label>{getSessionBlockInputLabel(block.blockType)}</label>
                      <input
                        type={block.blockType === 'free' ? 'text' : 'number'}
                        min={block.blockType === 'free' ? undefined : '0'}
                        step={block.blockType === 'distance' ? '1' : '1'}
                        value={block.targetValue}
                        onChange={(event) => updateBlock(block.id, { targetValue: event.target.value })}
                        placeholder={getSessionBlockPlaceholder(block.blockType)}
                        disabled={loading || block.blockType === 'free'}
                      />
                    </div>
                  </div>

                  <p className="session-block-preview">
                    Apercu : <strong>{block.name.trim() || 'Bloc sans nom'}</strong> ·{' '}
                    {formatSessionBlockSummary(
                      block.blockType,
                      block.targetValue ? Number(block.targetValue) : null,
                      normalizeSessionSetsCount(block.sets_count),
                      block.chargeKg ? Number(block.chargeKg) : null
                    )}
                  </p>
                </article>
              ))}
            </div>
          </article>

          <article className="card session-summary-card">
            <span className="section-kicker">Resume</span>
            <h2>Seance V1</h2>
            <p className="muted">
              {validBlocksCount} bloc{validBlocksCount > 1 ? 's' : ''} prêt
              {validBlocksCount > 1 ? 's' : ''} à être enregistrés.
            </p>

            <div className="session-summary-actions">
              <button type="submit" className="button primary" disabled={loading} aria-busy={loading}>
                {loading ? 'Creation...' : 'Enregistrer la seance'}
              </button>
              <Link href="/sessions" className="button ghost">
                Annuler
              </Link>
            </div>
          </article>
        </form>
      </section>
    </AppShell>
  );
}

