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
import { supabase } from '@/lib/supabase';
import { insertTrainingSessionBlocks } from '@/lib/training-session-blocks-db';

export default function NewSessionPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [description, setDescription] = useState('');
  const [blocks, setBlocks] = useState<SessionBlockDraft[]>([createEmptySessionBlockDraft(0)]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const validBlocksCount = useMemo(() => blocks.filter((block) => block.name.trim()).length, [blocks]);

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

    const normalizedBlocks = normalizeDraftSessionBlocks(blocks);

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
      <section className="sessions-page">
        <article className="card session-hero-card">
          <div className="session-hero-copy">
            <span className="section-kicker">Seances</span>
            <h1>Creer une seance</h1>
            <p className="muted">
              Construis une seance simple, quel que soit le sport : blocs en repetitions, duree,
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
                  placeholder="Objectif de la seance, intensite, consigne generale..."
                  disabled={loading}
                />
              </div>
            </div>

            {message ? <p className="form-feedback form-feedback--error">{message}</p> : null}
          </article>

          <SessionBlocksEditor
            blocks={blocks}
            disabled={loading}
            onAddBlock={addBlock}
            onRemoveBlock={removeBlock}
            onUpdateBlock={updateBlock}
          />

          <article className="card session-summary-card">
            <span className="section-kicker">Resume</span>
            <h2>Seance V1</h2>
            <p className="muted">
              {validBlocksCount} bloc{validBlocksCount > 1 ? 's' : ''} pret
              {validBlocksCount > 1 ? 's' : ''} a etre enregistres.
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
