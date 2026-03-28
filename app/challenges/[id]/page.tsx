'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

type Challenge = {
  id: string;
  name: string;
  sport: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at?: string;
  goal_km?: number | null;
  created_by?: string | null;
  invite_code?: string | null;
};

type Activity = {
  id: string;
  challenge_id: string;
  user_email: string | null;
  sport: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  comment: string | null;
  created_at: string | null;
};

type Profile = {
  email: string | null;
  username: string | null;
};

type LeaderboardRow = {
  user_email: string;
  displayName: string;
  totalDistance: number;
  totalDuration: number;
  totalActivities: number;
};

function formatDate(dateString: string | null) {
  if (!dateString) return 'Non renseignée';

  const date = new Date(dateString);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatDistance(distance: number | null) {
  if (distance === null || distance === undefined) return '0 km';
  return `${distance.toFixed(1)} km`;
}

function formatDuration(duration: number | null) {
  if (duration === null || duration === undefined) return '0 min';
  return `${duration} min`;
}

export default function ChallengeDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activitiesErrorMessage, setActivitiesErrorMessage] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string>('');

  useEffect(() => {
    const fetchChallengeAndActivities = async () => {
      if (!id) return;

      setLoading(true);
      setActivitiesLoading(true);
      setActivitiesErrorMessage(null);
      setNotFound(false);
      setShareMessage('');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id || null);

      const { data: challengeData, error: challengeError } = await supabase
        .from('challenges')
        .select('*')
        .eq('id', id)
        .single();

      if (challengeError || !challengeData) {
        console.error('Erreur chargement challenge :', challengeError);
        setNotFound(true);
        setChallenge(null);
        setActivities([]);
        setLoading(false);
        setActivitiesLoading(false);
        return;
      }

      setChallenge(challengeData);
      setLoading(false);

      const { data: activitiesData, error: activitiesError } = await supabase
        .from('activities')
        .select('id, challenge_id, user_email, sport, distance_km, duration_minutes, comment, created_at')
        .eq('challenge_id', id)
        .order('created_at', { ascending: false });

      if (activitiesError) {
        console.error('Erreur chargement activités :', activitiesError);
        setActivities([]);
        setProfilesMap({});
        setActivitiesErrorMessage(
          activitiesError.message || 'Impossible de charger les activités pour le moment.'
        );
        setActivitiesLoading(false);
        return;
      }

      const loadedActivities = activitiesData || [];
      setActivities(loadedActivities);

      const emails = Array.from(
        new Set(
          loadedActivities
            .map((activity) => activity.user_email)
            .filter((email): email is string => Boolean(email))
        )
      );

      if (emails.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('email, username')
          .in('email', emails);

        if (profilesError) {
          console.error('Erreur chargement profils :', profilesError);
          setProfilesMap({});
        } else {
          const nextProfilesMap: Record<string, string> = {};

          (profilesData as Profile[] | null)?.forEach((profile) => {
            if (profile.email && profile.username) {
              nextProfilesMap[profile.email] = profile.username;
            }
          });

          setProfilesMap(nextProfilesMap);
        }
      } else {
        setProfilesMap({});
      }

      setActivitiesLoading(false);
    };

    fetchChallengeAndActivities();
  }, [id]);

  const getDisplayName = (email: string | null) => {
    if (!email) return 'Utilisateur inconnu';
    return profilesMap[email] || email;
  };

  const totalActivities = activities.length;
  const totalDistance = activities.reduce((sum, activity) => sum + (activity.distance_km || 0), 0);
  const totalDuration = activities.reduce(
    (sum, activity) => sum + (activity.duration_minutes || 0),
    0
  );

  const leaderboard = useMemo<LeaderboardRow[]>(() => {
    const grouped = new Map<string, LeaderboardRow>();

    for (const activity of activities) {
      const email = activity.user_email || 'Utilisateur inconnu';
      const displayName = getDisplayName(activity.user_email);

      if (!grouped.has(email)) {
        grouped.set(email, {
          user_email: email,
          displayName,
          totalDistance: 0,
          totalDuration: 0,
          totalActivities: 0,
        });
      }

      const current = grouped.get(email)!;
      current.totalDistance += activity.distance_km || 0;
      current.totalDuration += activity.duration_minutes || 0;
      current.totalActivities += 1;
    }

    return Array.from(grouped.values()).sort((a, b) => {
      if (b.totalDistance !== a.totalDistance) {
        return b.totalDistance - a.totalDistance;
      }
      return b.totalDuration - a.totalDuration;
    });
  }, [activities, profilesMap]);

  const goalKm = challenge?.goal_km || null;
  const progressPercent =
    goalKm && goalKm > 0 ? Math.min((totalDistance / goalKm) * 100, 100) : null;

  const isOwner = currentUserId === challenge?.created_by;

  const handleInvitePartner = async () => {
    if (!challenge?.invite_code) {
      setShareMessage("Aucun lien d'invitation disponible pour ce challenge.");
      return;
    }

    const inviteUrl = `${window.location.origin}/join/${challenge.invite_code}`;
    const shareData = {
      title: 'Rejoins mon challenge Actyv',
      text: `Rejoins mon challenge "${challenge.name}" sur Actyv !`,
      url: inviteUrl,
    };

    try {
      setShareMessage('');

      if (navigator.share) {
        await navigator.share(shareData);
        setShareMessage('Lien de partage ouvert.');
        return;
      }

      await navigator.clipboard.writeText(inviteUrl);
      setShareMessage("Lien d'invitation copié dans le presse-papiers.");
    } catch (error) {
      console.error("Erreur lors du partage de l'invitation :", error);
      setShareMessage("Impossible de partager le lien pour le moment.");
    }
  };

  if (loading) {
    return (
      <AppShell>
        <section className="stack">
          <Link href="/" className="detail-back-link">← Retour à l’accueil</Link>
          <h1>Chargement du challenge...</h1>
        </section>
      </AppShell>
    );
  }

  if (notFound || !challenge) {
    return (
      <AppShell>
        <section className="stack">
          <Link href="/" className="detail-back-link">← Retour à l’accueil</Link>
          <h1>Challenge introuvable</h1>
          <p>Ce challenge n’existe pas ou n’est plus disponible.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="challenge-detail-page">
        <Link href="/" className="detail-back-link">← Retour à l’accueil</Link>

        <article className="card challenge-hero-card">
          <div className="challenge-hero-top">
            <div className="stack" style={{ gap: '0.75rem' }}>
              <span className="badge">{challenge.sport || 'Sport non renseigné'}</span>
              <h1 className="challenge-hero-title">{challenge.name}</h1>
              <p className="challenge-hero-description">
                {challenge.description || 'Aucune description pour le moment.'}
              </p>
            </div>

            <div className="challenge-hero-actions">
              {isOwner && (
                <button
                  type="button"
                  className="button primary"
                  onClick={handleInvitePartner}
                >
                  Inviter un partenaire
                </button>
              )}

              <Link href="/activities/new" className="button ghost">
                + Ajouter une activité
              </Link>
            </div>
          </div>

          <div className="challenge-meta-grid">
            <div className="challenge-meta-item">
              <span className="challenge-meta-label">Date de début</span>
              <strong>{formatDate(challenge.start_date)}</strong>
            </div>

            <div className="challenge-meta-item">
              <span className="challenge-meta-label">Date de fin</span>
              <strong>{formatDate(challenge.end_date)}</strong>
            </div>

            <div className="challenge-meta-item">
              <span className="challenge-meta-label">Objectif</span>
              <strong>{goalKm && goalKm > 0 ? formatDistance(goalKm) : 'Non défini'}</strong>
            </div>
          </div>

          {isOwner && shareMessage && (
            <p className="challenge-share-message">{shareMessage}</p>
          )}
        </article>

        <section className="challenge-stats-grid">
          <article className="card stat-card">
            <span className="stat-card-label">Activités</span>
            <strong className="stat-card-value">{totalActivities}</strong>
          </article>

          <article className="card stat-card">
            <span className="stat-card-label">Distance totale</span>
            <strong className="stat-card-value">{formatDistance(totalDistance)}</strong>
          </article>

          <article className="card stat-card">
            <span className="stat-card-label">Durée totale</span>
            <strong className="stat-card-value">{formatDuration(totalDuration)}</strong>
          </article>

          <article className="card stat-card">
            <span className="stat-card-label">Participants</span>
            <strong className="stat-card-value">{leaderboard.length}</strong>
          </article>
        </section>

        <section className="card progress-card">
          <h2>Progression</h2>

          {goalKm && goalKm > 0 ? (
            <>
              <div className="progress-meta">
                <span className="progress-target">Objectif : {formatDistance(goalKm)}</span>
                <span className="progress-percent">
                  {(progressPercent || 0).toFixed(1)}%
                </span>
              </div>

              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${progressPercent || 0}%` }}
                />
              </div>

              <div className="progress-text">
                <strong>{formatDistance(totalDistance)}</strong> / {formatDistance(goalKm)}
              </div>
            </>
          ) : (
            <p style={{ marginTop: '1rem' }}>
              Aucun objectif kilométrique défini pour ce challenge.
            </p>
          )}
        </section>

        <section className="card">
          <h2>Classement</h2>

          {leaderboard.length === 0 ? (
            <p style={{ marginTop: '1rem' }}>Aucun participant pour le moment.</p>
          ) : (
            <div className="leaderboard-list">
              {leaderboard.map((row, index) => (
                <article key={row.user_email} className="leaderboard-item">
                  <div className="leaderboard-rank">#{index + 1}</div>

                  <div className="leaderboard-main">
                    <strong className="leaderboard-name">{row.displayName}</strong>
                    <div className="leaderboard-meta">
                      <span>{formatDistance(row.totalDistance)}</span>
                      <span>{formatDuration(row.totalDuration)}</span>
                      <span>{row.totalActivities} activité{row.totalActivities > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Activités du challenge</h2>

          {activitiesLoading ? (
            <p style={{ marginTop: '1rem' }}>Chargement des activités...</p>
          ) : activitiesErrorMessage ? (
            <p style={{ marginTop: '1rem', color: 'crimson' }}>
              {activitiesErrorMessage}
            </p>
          ) : activities.length === 0 ? (
            <p style={{ marginTop: '1rem' }}>Aucune activité pour le moment.</p>
          ) : (
            <div className="activity-list">
              {activities.map((activity) => (
                <article key={activity.id} className="activity-item">
                  <div className="activity-top">
                    <strong className="activity-user">{getDisplayName(activity.user_email)}</strong>
                    <span className="activity-date">{formatDate(activity.created_at)}</span>
                  </div>

                  <div className="activity-sport">
                    {activity.sport || challenge.sport || 'Sport non renseigné'}
                  </div>

                  <div className="activity-stats">
                    <span><strong>Distance :</strong> {formatDistance(activity.distance_km)}</span>
                    <span><strong>Durée :</strong> {formatDuration(activity.duration_minutes)}</span>
                  </div>

                  {activity.comment && (
                    <p className="activity-comment">
                      <strong>Commentaire :</strong> {activity.comment}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </AppShell>
  );
}