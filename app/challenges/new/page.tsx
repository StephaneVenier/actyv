'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AppShell } from '@/components/AppShell';
import { sports } from '@/components/challenge-data';

type GoalType = 'distance' | 'duration' | 'reps';

function generateInviteCode(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';

  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

function getGoalLabel(goalType: GoalType) {
  switch (goalType) {
    case 'distance':
      return 'Objectif (km)';
    case 'duration':
      return 'Objectif (minutes)';
    case 'reps':
      return 'Objectif (répétitions)';
    default:
      return 'Objectif';
  }
}

function getGoalPlaceholder(goalType: GoalType) {
  switch (goalType) {
    case 'distance':
      return '100';
    case 'duration':
      return '600';
    case 'reps':
      return '1000';
    default:
      return '';
  }
}

function getGoalStep(goalType: GoalType) {
  return goalType === 'distance' ? '0.1' : '1';
}

export default function NewChallengePage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('distance');
  const [goalValue, setGoalValue] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage('');

    if (!name.trim() || !sport) {
      setMessage('Le nom du challenge et le sport sont obligatoires.');
      return;
    }

    if (startDate && endDate && endDate < startDate) {
      setMessage("La date objectif ne peut pas être avant la date de début.");
      return;
    }

    const parsedGoalValue = goalValue ? Number(goalValue) : null;

    if (parsedGoalValue !== null && (Number.isNaN(parsedGoalValue) || parsedGoalValue < 0)) {
      setMessage("L'objectif doit être un nombre positif.");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage('Vous devez être connecté pour créer un challenge.');
        return;
      }

      const inviteCode = generateInviteCode();

      const payload = {
        name: name.trim(),
        sport,
        start_date: startDate || null,
        end_date: endDate || null,
        goal_type: goalType,
        goal_value: parsedGoalValue,
        goal_km: goalType === 'distance' ? parsedGoalValue : null, // compatibilité ancienne logique
        description: description.trim() || null,
        created_by: user.id,
        visibility: 'private',
        invite_code: inviteCode,
      };

      const { data: challenge, error: challengeError } = await supabase
        .from('challenges')
        .insert([payload])
        .select()
        .single();

      if (challengeError || !challenge) {
        console.error('Erreur création challenge :', challengeError);
        setMessage(
          `Erreur création challenge : ${
            challengeError?.message || 'erreur inconnue'
          }`
        );
        return;
      }

      const { error: memberError } = await supabase
        .from('challenge_members')
        .insert([
          {
            challenge_id: challenge.id,
            user_email: user.email,
            role: 'owner',
          },
        ]);

      if (memberError) {
        console.error('Erreur ajout owner dans challenge_members :', memberError);
        setMessage(
          `Challenge créé mais erreur membre : ${
            memberError?.message || 'erreur inconnue'
          }`
        );
        return;
      }

      router.push(`/challenges/${challenge.id}`);
    } catch (err) {
      console.error('Erreur inattendue :', err);
      setMessage("Une erreur inattendue s'est produite.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="card stack">
        <div>
          <h1>Créer un challenge</h1>
          <p className="muted">
            Crée un défi collectif avec un objectif en distance, en durée ou en répétitions.
          </p>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Nom du challenge</label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Objectif 100 km"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="sport">Sport</label>
            <select
              id="sport"
              name="sport"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              required
            >
              <option value="">Choisir un sport</option>
              {sports.map((sportItem) => (
                <option key={sportItem} value={sportItem}>
                  {sportItem}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="startDate">Date de début</label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="endDate">Date objectif</label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="goalType">Type d’objectif</label>
            <select
              id="goalType"
              name="goalType"
              value={goalType}
              onChange={(e) => setGoalType(e.target.value as GoalType)}
            >
              <option value="distance">Distance (km)</option>
              <option value="duration">Durée (minutes)</option>
              <option value="reps">Répétitions</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="goalValue">{getGoalLabel(goalType)}</label>
            <input
              id="goalValue"
              name="goalValue"
              type="number"
              step={getGoalStep(goalType)}
              min="0"
              placeholder={getGoalPlaceholder(goalType)}
              value={goalValue}
              onChange={(e) => setGoalValue(e.target.value)}
            />
          </div>

          <div className="field full">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              placeholder="Décris l’objectif du groupe"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
            />
          </div>

          {message && (
            <p
              className="full"
              style={{
                margin: 0,
                color: message.includes('succès') ? '#16a34a' : 'crimson',
              }}
            >
              {message}
            </p>
          )}

          <div className="full">
            <button
              type="submit"
              disabled={loading}
              className="button primary"
            >
              {loading ? 'Création...' : 'Créer le challenge'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}