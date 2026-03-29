'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

type GoalType = 'distance' | 'duration' | 'reps';

type Challenge = {
  id: string;
  name: string;
  sport: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at?: string;
  goal_km?: number | null;
  goal_type?: GoalType | null;
  goal_value?: number | null;
  created_by?: string | null;
  invite_code?: string | null;
  visibility?: string | null;
  is_deleted?: boolean | null;
};

type Activity = {
  id: string;
  challenge_id: string;
  user_email: string | null;
  sport: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  unit_type?: GoalType | null;
  unit_value?: number | null;
  exercise_type?: string | null;
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
  totalValue: number;
  totalActivities: number;
  totalDistance: number;
  totalDuration: number;
  totalReps: number;
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

function formatDistance(distance: number | null | undefined) {
  if (distance === null || distance === undefined) return '0 km';
  return `${distance.toFixed(1)} km`;
}

function formatDuration(duration: number | null | undefined) {
  if (duration === null || duration === undefined) return '0 min';
  return `${duration} min`;
}

function formatReps(reps: number | null | undefined) {
  if (reps === null || reps === undefined) return '0 répétition';
  return `${reps} répétition${reps > 1 ? 's' : ''}`;
}

function getGoalTypeLabel(goalType: GoalType | null | undefined) {
  switch (goalType) {
    case 'distance':
      return 'Distance';
    case 'duration':
      return 'Durée';
    case 'reps':
      return 'Répétitions';
    default:
      return 'Objectif';
  }
}

function getUnitShortLabel(goalType: GoalType | null | undefined) {
  switch (goalType) {
    case 'distance':
      return 'km';
    case 'duration':
      return 'min';
    case 'reps':
      return 'rép.';
    default:
      return '';
  }
}

function formatGoalValue(value: number | null | undefined, goalType: GoalType | null | undefined) {
  if (value === null || value === undefined) return 'Non défini';

  switch (goalType) {
    case 'distance':
      return formatDistance(value);
    case 'duration':
      return formatDuration(value);
    case 'reps':
      return formatReps(value);
    default:
      return `${value}`;
  }
}

function formatExerciseType(exerciseType: string | null | undefined) {
  if (!exerciseType) return null;

  const labels: Record<string, string> = {
    squat: 'Squats',
    pushup: 'Pompes',
    burpee: 'Burpees',
    situp: 'Abdos',
    plank: 'Gainage',
    lunges: 'Fentes',
    'jumping-jack': 'Jumping Jacks',
    other: 'Autre',
  };

  return labels[exerciseType] || exerciseType;
}

export default function ChallengeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activitiesErrorMessage, setActivitiesErrorMessage] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState('');

  useEffect(() => {
    const fetchChallengeAndActivities = async () => {
      if (!id) return;

      setLoading(true);
      setActivitiesLoading(true);
      setActivitiesErrorMessage(null);
      setNotFound(false);
      setAccessDenied(false);
      setShareMessage('');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id || null);

      const { data: challengeData, error: challengeError } = await supabase
        .from('challenges')
        .select('*')
        .eq('id', id)
        .eq('is_deleted', false)
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

      const isPublic = challengeData.visibility === 'public';
      let hasAccess = isPublic;

      if (!isPublic && user?.email) {
        const { data: memberData, error: memberError } = await supabase
          .from('challenge_members')
          .select('challenge_id')
          .eq('challenge_id', id)
          .eq('user_email', user.email)
          .maybeSingle();

        if (memberError) {
          console.error('Erreur vérification accès challenge :', memberError);
        }

        hasAccess = Boolean(memberData);
      }

      if (!hasAccess) {
        setAccessDenied(true);
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
        .select(
          'id, challenge_id, user_email, sport, distance_km, duration_minutes, unit_type, unit_value, exercise_type, comment, created_at'
        )
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

      const loadedActivities = (activitiesData as Activity[]) || [];
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

  const handleDeleteChallenge = async () => {
    const confirmed = window.confirm(
      'Voulez-vous vraiment supprimer ce challenge ? Il ne sera plus visible, mais les données seront conservées.'
    );

    if (!confirmed || !challenge?.id) return;

    try {
      const { error } = await supabase
        .from('challenges')
        .update({ is_deleted: true })
        .eq('id', challenge.id);

      if (error) {
        console.error('Erreur suppression challenge :', error);
        alert('Erreur lors de la suppression.');
        return;
      }

      router.push('/');
    } catch (err) {
      console.error('Erreur inattendue suppression challenge :', err);
      alert('Erreur inattendue.');
    }
  };

  const getDisplayName = (email: string | null) => {
    if (!email) return 'Utilisateur inconnu';
    return profilesMap[email] || email;
  };

  const effectiveGoalType: GoalType | null =
    challenge?.goal_type || (challenge?.goal_km ? 'distance' : null);

  const effectiveGoalValue: number | null =
    challenge?.goal_value ?? challenge?.goal_km ?? null;

  const normalizedActivities = useMemo(() => {
    return activities.map((activity) => {
      const fallbackUnitType: GoalType | null =
        activity.unit_type ||
        (activity.distance_km !== null && activity.distance_km !== undefined
          ? 'distance'
          : activity.duration_minutes !== null && activity.duration_minutes !== undefined
          ? 'duration'
          : null);

      const fallbackUnitValue =
        activity.unit_value ??
        (fallbackUnitType === 'distance'
          ? activity.distance_km
          : fallbackUnitType === 'duration'
          ? activity.duration_minutes
          : null);

      return {
        ...activity,
        normalized_unit_type: fallbackUnitType,
        normalized_unit_value: fallbackUnitValue,
      };
    });
  }, [activities]);

  const matchingActivities = useMemo(() => {
    if (!effectiveGoalType) return normalizedActivities;
    return normalizedActivities.filter(
      (activity) => activity.normalized_unit_type === effectiveGoalType
    );
  }, [normalizedActivities, effectiveGoalType]);

  const totalActivities = activities.length;

  const totalDistance = normalizedActivities.reduce((sum, activity) => {
    if (activity.normalized_unit_type === 'distance') {
      return sum + (activity.normalized_unit_value || 0);
    }
    return sum;
  }, 0);

  const totalDuration = normalizedActivities.reduce((sum, activity) => {
    if (activity.normalized_unit_type === 'duration') {
      return sum + (activity.normalized_unit_value || 0);
    }
    return sum;
  }, 0);

  const totalReps = normalizedActivities.reduce((sum, activity) => {
    if (activity.normalized_unit_type === 'reps') {
      return sum + (activity.normalized_unit_value || 0);
    }
    return sum;
  }, 0);

  const totalChallengeProgress = matchingActivities.reduce((sum, activity) => {
    return sum + (activity.normalized_unit_value || 0);
  }, 0);

  const leaderboard = useMemo<LeaderboardRow[]>(() => {
    const grouped = new Map<string, LeaderboardRow>();

    for (const activity of normalizedActivities) {
      const email = activity.user_email || 'Utilisateur inconnu';
      const displayName = getDisplayName(activity.user_email);

      if (!grouped.has(email)) {
        grouped.set(email, {
          user_email: email,
          displayName,
          totalValue: 0,
          totalActivities: 0,
          totalDistance: 0,
          totalDuration: 0,
          totalReps: 0,
        });
      }

      const current = grouped.get(email)!;

      if (activity.normalized_unit_type === 'distance') {
        current.totalDistance += activity.normalized_unit_value || 0;
      }

      if (activity.normalized_unit_type === 'duration') {
        current.totalDuration += activity.normalized_unit_value || 0;
      }

      if (activity.normalized_unit_type === 'reps') {
        current.totalReps += activity.normalized_unit_value || 0;
      }

      if (effectiveGoalType && activity.normalized_unit_type === effectiveGoalType) {
        current.totalValue += activity.normalized_unit_value || 0;
      }

      current.totalActivities += 1;
    }

    return Array.from(grouped.values()).sort((a, b) => {
      if (b.totalValue !== a.totalValue) {
        return b.totalValue - a.totalValue;
      }

      if (b.totalActivities !== a.totalActivities) {
        return b.totalActivities - a.totalActivities;
      }

      return a.displayName.localeCompare(b.displayName, 'fr');
    });
  }, [normalizedActivities, profilesMap, effectiveGoalType]);

  const progressPercent =
    effectiveGoalValue && effectiveGoalValue > 0
      ? Math.min((totalChallengeProgress / effectiveGoalValue) * 100, 100)
      : null;

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

  function renderMainStatValue() {
    if (effectiveGoalType === 'distance') return formatDistance(totalChallengeProgress);
    if (effectiveGoalType === 'duration') return formatDuration(totalChallengeProgress);
    if (effectiveGoalType === 'reps') return formatReps(totalChallengeProgress);
    return 'Non défini';
  }

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

  if (notFound) {
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

  if (accessDenied) {
    return (
      <AppShell>
        <section className="stack">
          <Link href="/" className="detail-back-link">← Retour à l’accueil</Link>
          <h1>Accès refusé</h1>
          <p>Ce challenge est privé. Tu dois être invité pour y accéder.</p>
        </section>
      </AppShell>
    );
  }

  if (!challenge) {
    return (
      <AppShell>
        <section className="stack">
          <Link href="/" className="detail-back-link">← Retour à l’accueil</Link>
          <h1>Challenge introuvable</h1>
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

              {isOwner && (
                <button
                  type="button"
                  className="button danger"
                  onClick={handleDeleteChallenge}
                >
                  Supprimer le challenge
                </button>
              )}

              <Link href={`/activities/new?challenge=${challenge.id}`} className="button ghost">
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
              <span className="challenge-meta-label">{getGoalTypeLabel(effectiveGoalType)}</span>
              <strong>{formatGoalValue(effectiveGoalValue, effectiveGoalType)}</strong>
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
            <span className="stat-card-label">Progression challenge</span>
            <strong className="stat-card-value">{renderMainStatValue()}</strong>
          </article>

          <article className="card stat-card">
            <span className="stat-card-label">Participants</span>
            <strong className="stat-card-value">{leaderboard.length}</strong>
          </article>

          <article className="card stat-card">
            <span className="stat-card-label">Type d’objectif</span>
            <strong className="stat-card-value">
              {getGoalTypeLabel(effectiveGoalType)}
            </strong>
          </article>
        </section>

        <section className="card progress-card">
          <h2>Progression</h2>

          {effectiveGoalValue && effectiveGoalValue > 0 ? (
            <>
              <div className="progress-meta">
                <span className="progress-target">
                  Objectif : {formatGoalValue(effectiveGoalValue, effectiveGoalType)}
                </span>
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
                <strong>{formatGoalValue(totalChallengeProgress, effectiveGoalType)}</strong> /{' '}
                {formatGoalValue(effectiveGoalValue, effectiveGoalType)}
              </div>
            </>
          ) : (
            <p style={{ marginTop: '1rem' }}>
              Aucun objectif défini pour ce challenge.
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
                      <span>
                        <strong>
                          {row.totalValue} {getUnitShortLabel(effectiveGoalType)}
                        </strong>
                      </span>

                      {row.totalDistance > 0 && (
                        <span>{formatDistance(row.totalDistance)}</span>
                      )}

                      {row.totalDuration > 0 && (
                        <span>{formatDuration(row.totalDuration)}</span>
                      )}

                      {row.totalReps > 0 && (
                        <span>{formatReps(row.totalReps)}</span>
                      )}

                      <span>
                        {row.totalActivities} activité{row.totalActivities > 1 ? 's' : ''}
                      </span>
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
              {normalizedActivities.map((activity) => (
                <article key={activity.id} className="activity-item">
                  <div className="activity-top">
                    <strong className="activity-user">{getDisplayName(activity.user_email)}</strong>
                    <span className="activity-date">{formatDate(activity.created_at)}</span>
                  </div>

                  <div className="activity-sport">
                    {activity.sport || challenge.sport || 'Sport non renseigné'}
                  </div>

                  <div className="activity-stats">
                    {activity.normalized_unit_type === 'distance' && (
                      <span>
                        <strong>Distance :</strong> {formatDistance(activity.normalized_unit_value)}
                      </span>
                    )}

                    {activity.normalized_unit_type === 'duration' && (
                      <span>
                        <strong>Durée :</strong> {formatDuration(activity.normalized_unit_value)}
                      </span>
                    )}

                    {activity.normalized_unit_type === 'reps' && (
                      <span>
                        <strong>Répétitions :</strong> {formatReps(activity.normalized_unit_value)}
                      </span>
                    )}

                    {activity.exercise_type && (
                      <span>
                        <strong>Exercice :</strong> {formatExerciseType(activity.exercise_type)}
                      </span>
                    )}
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

        <section className="challenge-stats-grid">
          <article className="card stat-card">
            <span className="stat-card-label">Distance totale</span>
            <strong className="stat-card-value">{formatDistance(totalDistance)}</strong>
          </article>

          <article className="card stat-card">
            <span className="stat-card-label">Durée totale</span>
            <strong className="stat-card-value">{formatDuration(totalDuration)}</strong>
          </article>

          <article className="card stat-card">
            <span className="stat-card-label">Répétitions totales</span>
            <strong className="stat-card-value">{formatReps(totalReps)}</strong>
          </article>
        </section>
      </section>
    </AppShell>
  );
}