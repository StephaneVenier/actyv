'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { queuePendingToast } from '@/components/ToastProvider';
import { sports } from '@/components/challenge-data';
import {
  formatSessionBlockSummary,
  getSessionBlockInputLabel,
  getSessionBlockPlaceholder,
  getSessionBlockTypeLabel,
  SESSION_BLOCK_TYPES,
  SessionBlockType,
} from '@/lib/session-blocks';
import { supabase } from '@/lib/supabase';
import {
  fetchTrainingSessionBlocks,
  insertTrainingSessionBlocks,
  TrainingSessionBlockRecord,
} from '@/lib/training-session-blocks-db';

type DraftBlock = {
  id: string;
  name: string;
  blockType: SessionBlockType;
  setsCount: string;
  targetValue: string;
  chargeKg: string;
};

type TrainingSession = {
  id: string;
  user_id: string;
  name: string;
  sport: string | null;
  description: string | null;
};

function createEmptyBlock(index: number): DraftBlock {
  return {
    id: `block-${Date.now()}-${index}`,
    name: '',
    blockType: 'reps',
    setsCount: '1',
    targetValue: '',
    chargeKg: '',
  };
}

function mapBlockToDraft(block: TrainingSessionBlockRecord): DraftBlock {
  return {
    id: block.id,
    name: block.name,
    blockType: block.block_type,
    setsCount: String(block.sets_count ?? 1),
    targetValue: block.target_value === null || block.target_value === undefined ? '' : String(block.target_value),
    chargeKg: block.charge_kg === null || block.charge_kg === undefined ? '' : String(block.charge_kg),
  };
}

export default function EditSessionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [description, setDescription] = useState('');
  const [blocks, setBlocks] = useState<DraftBlock[]>([createEmptyBlock(0)]);
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
            console.error("Erreur chargement utilisateur edition seance :", userError);
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
          setBlocks([createEmptyBlock(0)]);
          return;
        }

        setBlocks(blockRows && blockRows.length > 0 ? blockRows.map(mapBlockToDraft) : [createEmptyBlock(0)]);
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [id]);

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
    setBlocks((current) =>
      current.length > 1 ? current.filter((block) => block.id !== blockId) : current
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    setMessage('');

    if (!name.trim() || !sport) {
      setMessage('Renseigne le nom de la seance et le sport associe.');
      return;
    }

    const normalizedBlocks = blocks
      .map((block, index) => ({
        position: index,
        name: block.name.trim(),
        block_type: block.blockType,
        sets_count: block.setsCount.trim() === '' ? 1 : Number(block.setsCount),
        target_value:
          block.blockType === 'free' || block.targetValue.trim() === '' ? null : Number(block.targetValue),
        charge_kg: block.chargeKg.trim() === '' ? null : Number(block.chargeKg),
      }))
      .filter((block) => block.name);

    if (normalizedBlocks.length === 0) {
      setMessage('Ajoute au moins un bloc simple pour enregistrer la seance.');
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
        setMessage('La seance a ete mise a jour mais les anciens blocs n’ont pas pu etre remplaces.');
        return;
      }

      const { error: blocksError } = await insertTrainingSessionBlocks(id, normalizedBlocks);

      if (blocksError) {
        setMessage('La seance a ete mise a jour mais les blocs n’ont pas pu etre enregistres.');
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
      <section className="sessions-page">
        <article className="card session-hero-card">
          <div className="session-hero-copy">
            <span className="section-kicker">Seances</span>
            <h1>Modifier la seance</h1>
            <p className="muted">
              Mets a jour les informations de ta seance et ajuste ses blocs sans recréer une nouvelle fiche.
            </p>
          </div>

          <div className="session-hero-actions">
            <Link href={`/sessions/${id}`} className="button ghost">
              Retour au detail
            </Link>
          </div>
        </article>

        {loading ? (
          <div className="challenge-state">
            <p>Chargement de la seance...</p>
          </div>
        ) : (
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

              {message && <p className="form-feedback form-feedback--error">{message}</p>}
            </article>

            <article className="card session-form-card stack">
              <div className="session-blocks-header">
                <div>
                  <span className="section-kicker">Blocs</span>
                  <h2>Structure de la seance</h2>
                </div>

                <button type="button" className="button ghost" onClick={addBlock} disabled={saving}>
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
                        disabled={saving || blocks.length === 1}
                      >
                        Retirer
                      </button>
                    </div>

                    <div className="session-form-grid">
                      <div className="field">
                        <label>Nom du bloc</label>
                        <input
                          value={block.name}
                          onChange={(event) => updateBlock(block.id, { name: event.target.value })}
                          placeholder="Ex : Pompes, Gainage, 400m rapide"
                          disabled={saving}
                        />
                      </div>

                      <div className="field">
                        <label>Type</label>
                        <select
                          value={block.blockType}
                          onChange={(event) =>
                            updateBlock(block.id, {
                              blockType: event.target.value as SessionBlockType,
                              targetValue: event.target.value === 'free' ? '' : block.targetValue,
                            })
                          }
                          disabled={saving}
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
                          value={block.setsCount}
                          onChange={(event) => updateBlock(block.id, { setsCount: event.target.value })}
                          placeholder="Ex : 3"
                          disabled={saving}
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
                          disabled={saving}
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
                          disabled={saving || block.blockType === 'free'}
                        />
                      </div>
                    </div>

                    <p className="session-block-preview">
                      Apercu : <strong>{block.name.trim() || 'Bloc sans nom'}</strong> ·{' '}
                      {formatSessionBlockSummary(
                        block.blockType,
                        block.targetValue ? Number(block.targetValue) : null,
                        block.setsCount ? Number(block.setsCount) : 1,
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
                {validBlocksCount} bloc{validBlocksCount > 1 ? 's' : ''} pret
                {validBlocksCount > 1 ? 's' : ''} a etre mis a jour.
              </p>

              <div className="session-summary-actions">
                <button type="submit" className="button primary" disabled={saving} aria-busy={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </button>
                <Link href={`/sessions/${id}`} className="button ghost">
                  Annuler
                </Link>
              </div>
            </article>
          </form>
        )}
      </section>
    </AppShell>
  );
}
