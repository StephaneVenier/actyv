'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { sports } from '@/components/challenge-data';

type GoalType = 'distance' | 'duration' | 'reps';

type Challenge = {
  id: string;
  name: string;
  goal_type: GoalType | null;
};

function getUnitLabel(goalType: GoalType | null | undefined) {
  switch (goalType) {
    case 'distance':
      return 'Distance (km)';
    case 'duration':
      return 'Durée (minutes)';
    case 'reps':
      return 'Nombre de répétitions';
    default:
      return 'Valeur';
  }
}

function getUnitPlaceholder(goalType: GoalType | null | undefined) {
  switch (goalType) {
    case 'distance':
      return 'Ex : 5.2';
    case 'duration':
      return 'Ex : 35';
    case 'reps':
      return 'Ex : 100';
    default:
      return 'Ex : 1';
  }
}

function getUnitStep(goalType: GoalType | null | undefined) {
  return goalType === 'distance' ? '0.1' : '1';
}

export default function NewActivityPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loadingChallenges, setLoadingChallenges] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [selectedChallengeId, setSelectedChallengeId] = useState(
    searchParams.get('challenge') || ''
  );
  const [selectedSport, setSelectedSport] = useState('');
  const [unitValue, setUnitValue] = useState('');
  const [exerciseType, setExerciseType] = useState('');
  const [comment, setComment] = useState('');

  const preselectedChallengeId = searchParams.get('challenge') || '';

  useEffect(() => {
    const fetchChallenges = async () => {
      setLoadingChallenges(true);

      const { data, error } = await supabase
        .from('challenges')
        .select('id, name, goal_type')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur chargement challenges :', error);
        setChallenges([]);
      } else {
        setChallenges((data as Challenge[]) || []);
      }

      setLoadingChallenges(false);
    };

    fetchChallenges();
  }, []);

  useEffect(() => {
    if (preselectedChallengeId) {
      setSelectedChallengeId(preselectedChallengeId);
    }
  }, [preselectedChallengeId]);

  const selectedChallenge = useMemo(() => {
    return challenges.find((challenge) => challenge.id === selectedChallengeId) || null;
  }, [challenges, selectedChallengeId]);

  const selectedGoalType: GoalType = selectedChallenge?.goal_type || 'distance';

  const preselectedChallengeName = useMemo(() => {
    return selectedChallenge?.name || null;
  }, [selectedChallenge]);

  useEffect(() => {
    setUnitValue('');
    setExerciseType('');
    setMessage(null);
  }, [selectedChallengeId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSubmitting(true);
    setMessage(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.email) {
        setMessage('Vous devez être connecté pour ajouter une activité.');
        setSubmitting(false);
        return;
      }

      if (!selectedChallengeId || !selectedSport) {
        setMessage('Merci de sélectionner un challenge et un type d’activité.');
        setSubmitting(false);
        return;
      }

      const parsedUnitValue = unitValue ? Number(unitValue) : null;

      if (parsedUnitValue === null || Number.isNaN(parsedUnitValue) || parsedUnitValue <= 0) {
        setMessage('Merci de renseigner une valeur valide pour ton activité.');
        setSubmitting(false);
        return;
      }

      if (selectedGoalType === 'reps' && !exerciseType) {
        setMessage("Merci de sélectionner le type d'exercice.");
        setSubmitting(false);
        return;
      }

      const insertPayload = {
        challenge_id: selectedChallengeId,
        user_email: user.email,
        sport: selectedSport,
        unit_type: selectedGoalType,
        unit_value: parsedUnitValue,
        exercise_type: selectedGoalType === 'reps' ? exerciseType : null,
        comment: comment.trim() || null,

        // Compatibilité avec l'ancien système
        duration_minutes: selectedGoalType === 'duration' ? parsedUnitValue : null,
        distance_km: selectedGoalType === 'distance' ? parsedUnitValue : null,
      };

      const { error } = await supabase.from('activities').insert(insertPayload);

      if (error) {
        console.error('Erreur création activité :', error);
        setMessage("Impossible d'enregistrer l’activité.");
        setSubmitting(false);
        return;
      }

      router.push(`/challenges/${selectedChallengeId}`);
    } catch (error) {
      console.error('Erreur inattendue :', error);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setSubmitting(false);
    }
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
                value={selectedChallengeId}
                onChange={(e) => setSelectedChallengeId(e.target.value)}
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
              <select
                id="sport"
                name="sport"
                value={selectedSport}
                onChange={(e) => setSelectedSport(e.target.value)}
              >
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
              <label htmlFor="unitValue">{getUnitLabel(selectedGoalType)}</label>
              <input
                id="unitValue"
                name="unitValue"
                type="number"
                min="0"
                step={getUnitStep(selectedGoalType)}
                placeholder={getUnitPlaceholder(selectedGoalType)}
                value={unitValue}
                onChange={(e) => setUnitValue(e.target.value)}
              />
            </div>

            {selectedGoalType === 'reps' && (
              <div className="field">
                <label htmlFor="exerciseType">Type d’exercice</label>
                <select
                  id="exerciseType"
                  name="exerciseType"
                  value={exerciseType}
                  onChange={(e) => setExerciseType(e.target.value)}
                >
                  <option value="" disabled>
                    Choisir un exercice
                  </option>
                  <option value="squat">Squats</option>
                  <option value="pushup">Pompes</option>
                  <option value="burpee">Burpees</option>
                  <option value="situp">Abdos</option>
                  <option value="plank">Gainage</option>
                  <option value="lunges">Fentes</option>
                  <option value="jumping-jack">Jumping Jacks</option>
                  <option value="other">Autre</option>
                </select>
              </div>
            )}

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
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            {message && (
              <div className="field full">
                <div className="activity-feedback-message">{message}</div>
              </div>
            )}

            <div className="field full">
              <button
                type="submit"
                className="button primary activity-submit-btn"
                disabled={submitting}
              >
                {submitting ? '⏳ Ajout en cours...' : 'Publier mon activité'}
              </button>
            </div>
          </form>
        </article>
      </section>
    </AppShell>
  );
}