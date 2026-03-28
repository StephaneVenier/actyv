'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AppShell } from '@/components/AppShell';
import { sports } from '@/components/challenge-data';

function generateInviteCode(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';

  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

export default function NewChallengePage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [goalKm, setGoalKm] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage('');

    if (!name || !sport) {
      setMessage('Le nom du challenge et le sport sont obligatoires.');
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

      const parsedGoalKm = goalKm ? Number(goalKm) : null;
      const inviteCode = generateInviteCode();

      const { data: challenge, error: challengeError } = await supabase
        .from('challenges')
        .insert([
          {
            name,
            sport,
            start_date: startDate || null,
            end_date: endDate || null,
            goal_km: parsedGoalKm,
            description: description || null,
            created_by: user.id,
            visibility: 'private',
            invite_code: inviteCode,
          },
        ])
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
            Version simple de la V1 : nom, sport, dates, objectif et description.
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
            <label htmlFor="goalKm">Objectif (km)</label>
            <input
              id="goalKm"
              name="goalKm"
              type="number"
              step="0.1"
              min="0"
              placeholder="100"
              value={goalKm}
              onChange={(e) => setGoalKm(e.target.value)}
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