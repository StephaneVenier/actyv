'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
};

type Activity = {
  id: string;
  challenge_id: string;
  user_email: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  created_at: string | null;
  challenges: {
    id: string;
    name: string;
    sport: string | null;
    goal_km: number | null;
    end_date: string | null;
  } | null;
};

type UserChallengeSummary = {
  challengeId: string;
  challengeName: string;
  sport: string | null;
  goalKm: number | null;
  challengeEndDate: string | null;
  myDistance: number;
  myDuration: number;
  myActivities: number;
};

function formatDistance(value: number) {
  return `${value.toFixed(1)} km`;
}

function formatDuration(value: number) {
  return `${value} min`;
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'Non renseignée';

  const date = new Date(dateString);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function isPast(dateString: string | null) {
  if (!dateString) return false;
  const date = new Date(dateString);
  const today = new Date();
  date.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return date < today;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadProfilePage = async () => {
      setLoading(true);
      setMessage('');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email, username')
        .eq('id', user.id)
        .single();

      setProfile(profileData || { id: user.id, email: user.email || null, username: null });
      setUsernameInput(profileData?.username || '');

      const { data: activitiesData, error: activitiesError } = await supabase
        .from('activities')
        .select(`
          id,
          challenge_id,
          user_email,
          distance_km,
          duration_minutes,
          created_at,
          challenges (
            id,
            name,
            sport,
            goal_km,
            end_date
          )
        `)
        .eq('user_email', user.email)
        .order('created_at', { ascending: false });

      if (activitiesError) {
        console.error('Erreur chargement profil :', activitiesError);
        setActivities([]);
      } else {
        setActivities((activitiesData as Activity[]) || []);
      }

      setLoading(false);
    };

    loadProfilePage();
  }, []);

  const stats = useMemo(() => {
    const totalActivities = activities.length;
    const totalDistance = activities.reduce((sum, item) => sum + (item.distance_km || 0), 0);
    const totalDuration = activities.reduce((sum, item) => sum + (item.duration_minutes || 0), 0);

    return {
      totalActivities,
      totalDistance,
      totalDuration,
    };
  }, [activities]);

  const groupedChallenges = useMemo<UserChallengeSummary[]>(() => {
    const map = new Map<string, UserChallengeSummary>();

    for (const activity of activities) {
      const challenge = activity.challenges;
      if (!challenge) continue;

      if (!map.has(challenge.id)) {
        map.set(challenge.id, {
          challengeId: challenge.id,
          challengeName: challenge.name,
          sport: challenge.sport,
          goalKm: challenge.goal_km,
          challengeEndDate: challenge.end_date,
          myDistance: 0,
          myDuration: 0,
          myActivities: 0,
        });
      }

      const current = map.get(challenge.id)!;
      current.myDistance += activity.distance_km || 0;
      current.myDuration += activity.duration_minutes || 0;
      current.myActivities += 1;
    }

    return Array.from(map.values());
  }, [activities]);

  const activeChallenges = groupedChallenges.filter(
    (challenge) => !challenge.challengeEndDate || !isPast(challenge.challengeEndDate)
  );

  const completedChallenges = groupedChallenges.filter(
    (challenge) => challenge.challengeEndDate && isPast(challenge.challengeEndDate)
  );

  const handleSaveUsername = async () => {
    if (!profile) return;

    setSavingUsername(true);
    setMessage('');

    const trimmed = usernameInput.trim();

    if (!trimmed) {
      setMessage('Le pseudo ne peut pas être vide.');
      setSavingUsername(false);
      return;
    }

    const { error } = await supabase.from('profiles').upsert({
      id: profile.id,
      email: profile.email,
      username: trimmed,
    });

    if (error) {
      console.error('Erreur mise à jour pseudo :', error);
      setMessage("Impossible d'enregistrer le pseudo.");
      setSavingUsername(false);
      return;
    }

    setProfile((prev) => (prev ? { ...prev, username: trimmed } : prev));
    setEditMode(false);
    setMessage('Pseudo mis à jour.');
    setSavingUsername(false);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="card">
          <h1>Mon profil</h1>
          <p>Chargement...</p>
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="card">
          <h1>Mon profil</h1>
          <p>Vous devez être connecté pour voir cette page.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="stack">
        <section className="card">
          <div className="stack">
            <div>
              <h1>Mon profil</h1>
              <p className="muted">Retrouve ici ton identité Actyv, tes stats et tes challenges.</p>
            </div>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <strong>Pseudo :</strong>{' '}
                {editMode ? (
                  <input
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Choisir un pseudo"
                    style={{ marginLeft: '0.5rem' }}
                  />
                ) : (
                  profile.username || 'Aucun pseudo défini'
                )}
              </div>

              <div>
                <strong>Email :</strong> {profile.email}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {!editMode ? (
                  <button type="button" onClick={() => setEditMode(true)}>
                    Modifier mon pseudo
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={handleSaveUsername} disabled={savingUsername}>
                      {savingUsername ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditMode(false);
                        setUsernameInput(profile.username || '');
                      }}
                    >
                      Annuler
                    </button>
                  </>
                )}
              </div>

              {message && <p className="muted">{message}</p>}
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Mes statistiques</h2>

          <div
            style={{
              marginTop: '1rem',
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            }}
          >
            <div>
              <strong>Activités</strong>
              <div style={{ marginTop: '0.35rem', fontSize: '1.7rem', fontWeight: 700 }}>
                {stats.totalActivities}
              </div>
            </div>

            <div>
              <strong>Distance totale</strong>
              <div style={{ marginTop: '0.35rem', fontSize: '1.7rem', fontWeight: 700 }}>
                {formatDistance(stats.totalDistance)}
              </div>
            </div>

            <div>
              <strong>Durée totale</strong>
              <div style={{ marginTop: '0.35rem', fontSize: '1.7rem', fontWeight: 700 }}>
                {formatDuration(stats.totalDuration)}
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Challenges en cours</h2>

          {activeChallenges.length === 0 ? (
            <p style={{ marginTop: '1rem' }}>Aucun challenge en cours pour le moment.</p>
          ) : (
            <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
              {activeChallenges.map((challenge) => {
                const progressPercent =
                  challenge.goalKm && challenge.goalKm > 0
                    ? Math.min((challenge.myDistance / challenge.goalKm) * 100, 100)
                    : null;

                return (
                  <article
                    key={challenge.challengeId}
                    style={{
                      padding: '1rem',
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: '1rem',
                      display: 'grid',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <strong>{challenge.challengeName}</strong>
                    </div>

                    <div>{challenge.sport || 'Sport non renseigné'}</div>

                    <div>
                      <strong>Ma contribution :</strong> {formatDistance(challenge.myDistance)}
                    </div>

                    <div>
                      <strong>Mes activités :</strong> {challenge.myActivities}
                    </div>

                    {challenge.goalKm && challenge.goalKm > 0 ? (
                      <>
                        <div
                          style={{
                            width: '100%',
                            height: '14px',
                            background: 'rgba(0,0,0,0.08)',
                            borderRadius: '999px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${progressPercent || 0}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #22c55e 0%, #84cc16 100%)',
                              borderRadius: '999px',
                            }}
                          />
                        </div>

                        <div>
                          <strong>{formatDistance(challenge.myDistance)}</strong> /{' '}
                          {formatDistance(challenge.goalKm)}
                        </div>
                      </>
                    ) : (
                      <div>Aucun objectif défini.</div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="card">
          <h2>Historique des challenges</h2>

          {completedChallenges.length === 0 ? (
            <p style={{ marginTop: '1rem' }}>Aucun challenge terminé pour le moment.</p>
          ) : (
            <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
              {completedChallenges.map((challenge) => (
                <article
                  key={challenge.challengeId}
                  style={{
                    padding: '1rem',
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: '1rem',
                    display: 'grid',
                    gap: '0.4rem',
                  }}
                >
                  <div>
                    <strong>{challenge.challengeName}</strong>
                  </div>
                  <div>{challenge.sport || 'Sport non renseigné'}</div>
                  <div>
                    <strong>Ma contribution :</strong> {formatDistance(challenge.myDistance)}
                  </div>
                  <div>
                    <strong>Durée totale :</strong> {formatDuration(challenge.myDuration)}
                  </div>
                  <div>
                    <strong>Date de fin :</strong> {formatDate(challenge.challengeEndDate)}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}