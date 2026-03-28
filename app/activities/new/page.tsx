'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { sports } from '@/components/challenge-data';

type Challenge = {
  id: string;
  name: string;
};

export default function NewActivityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loadingChallenges, setLoadingChallenges] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const preselectedChallengeId = searchParams.get('challenge') || '';

  useEffect(() => {
    const fetchChallenges = async () => {
      const { data, error } = await supabase
        .from('challenges')
        .select('id, name')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur chargement challenges :', error);
        setChallenges([]);
      } else {
        setChallenges(data || []);
      }

      setLoadingChallenges(false);
    };

    fetchChallenges();
  }, []);

  const preselectedChallengeName = useMemo(() => {
    return challenges.find((challenge) => challenge.id === preselectedChallengeId)?.name || null;
  }, [challenges, preselectedChallengeId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;

    setSubmitting(true);
    setMessage(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      setMessage('Vous devez être connecté pour ajouter une activité.');
      setSubmitting(false);
      return;
    }

    const formData = new FormData(form);

    const challenge_id = String(formData.get('challenge') || '');
    const sport = String(formData.get('sport') || '');
    const durationValue = formData.get('duration');
    const distanceValue = formData.get('distance');
    const comment = String(formData.get('comment') || '');

    const duration_minutes = durationValue ? Number(durationValue) : null;
    const distance_km = distanceValue ? Number(distanceValue) : null;

    if (!challenge_id || !sport) {
      setMessage('Merci de sélectionner un challenge et un type d’activité.');
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from('activities').insert({
      challenge_id,
      user_email: user.email,
      sport,
      duration_minutes,
      distance_km,
      comment: comment || null,
    });

    if (error) {
      console.error('Erreur création activité :', error);
      setMessage("Impossible d'enregistrer l’activité.");
      setSubmitting(false);
      return;
    }

    router.push(`/challenges/${challenge_id}`);
  };

  return (
    <AppShell>
      <section className="activity-page">
        <article className="card activity-hero-card">
          <div className="activity-hero-top">
            <div className="stack" style={{ gap: '0.7rem' }}>
              <span className="badge">Nouvelle activité</span>
              <h1 className="activity-page-title">Ajoute ton activité du jour 💪</h1>
              <p className="activity-page-subtitle">
                Renseigne rapidement ta séance pour mettre à jour ton challenge et suivre ta progression.
              </p>
            </div>
          </div>

          {preselectedChallengeName && (
            <div className="activity-context-card">
              <span className="activity-context-label">Challenge sélectionné</span>
              <strong className="activity-context-value">{preselectedChallengeName}</strong>
            </div>
          )}
        </article>

        <article className="card activity-form-card">
          <form className="form-grid activity-form-grid" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="challenge">Challenge</label>
              <select
                id="challenge"
                name="challenge"
                defaultValue={preselectedChallengeId}
                disabled={loadingChallenges}
              >
                <option value="" disabled>
                  {loadingChallenges ? 'Chargement des challenges...' : 'Choisir un challenge'}
                </option>
                {challenges.map((challenge) => (
                  <option key={challenge.id} value={challenge.id}>
                    {challenge.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="sport">Type d’activité</label>
              <select id="sport" name="sport" defaultValue="">
                <option value="" disabled>
                  Choisir une activité
                </option>
                {sports.map((sportItem) => (
                  <option key={sportItem} value={sportItem}>
                    {sportItem}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="duration">Durée (minutes)</label>
              <input
                id="duration"
                name="duration"
                type="number"
                min="0"
                placeholder="Ex : 35"
              />
            </div>

            <div className="field">
              <label htmlFor="distance">Distance (km)</label>
              <input
                id="distance"
                name="distance"
                type="number"
                min="0"
                step="0.1"
                placeholder="Ex : 5.2"
              />
            </div>

            <div className="field full">
              <div className="activity-comment-header">
                <label htmlFor="comment">Commentaire</label>
                <span className="muted">Facultatif</span>
              </div>

              <textarea
                id="comment"
                name="comment"
                rows={3}
                placeholder="Comment tu t’es senti aujourd’hui ? Bonnes sensations, séance difficile, super sortie..."
              />
            </div>

            {message && (
              <div className="field full">
                <div className="activity-feedback-message">{message}</div>
              </div>
            )}

            <div className="field full">
  <button type="submit" className="button primary activity-submit-btn" disabled={submitting}>
    {submitting ? '⏳ Ajout en cours...' : 'Publier mon activité'}
  </button>
</div>
          </form>
        </article>
      </section>
    </AppShell>
  );
}