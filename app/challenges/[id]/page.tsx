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
  user_id: string | null;
  user_email: string | null;
  sport: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  reps: number | null;
  comment: string | null;
  created_at: string | null;
  likes_count?: number | null;
  boosts_count?: number | null;
  unit_type?: GoalType | null;
  unit_value?: number | null;
  exercise_type?: string | null;
};

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
};

type ChallengeParticipant = {
  id: string;
  challenge_id: string;
  user_id: string;
  role: 'admin' | 'participant';
  joined_at: string;
};

type ActivityInteractionType = 'like' | 'boost';

type ActivityInteraction = {
  id: string;
  activity_id: string;
  user_id: string;
  type: ActivityInteractionType;
  created_at?: string;
};

type LeaderboardRow = {
  user_key: string;
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

function formatGoalValue(
  value: number | null | undefined,
  goalType: GoalType | null | undefined
) {
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
  const [participants, setParticipants] = useState<ChallengeParticipant[]>([]);
  const [interactions, setInteractions] = useState<ActivityInteraction[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, string>>({});
  const [profilesByEmail, setProfilesByEmail] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [joiningChallenge, setJoiningChallenge] = useState(false);
  const [activitiesErrorMessage, setActivitiesErrorMessage] = useState<string | null>(null);
  const [participantsErrorMessage, setParticipantsErrorMessage] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState('');

  const fetchChallengeAndActivities = async () => {
  if (!id) return;

  setLoading(true);
  setActivitiesLoading(true);
  setParticipantsLoading(true);
  setActivitiesErrorMessage(null);
  setParticipantsErrorMessage(null);
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
    setParticipants([]);
    setInteractions([]);
    setLoading(false);
    setActivitiesLoading(false);
    setParticipantsLoading(false);
    return;
  }

  const isPublic = challengeData.visibility === 'public';
  let hasAccess = isPublic;

  if (!isPublic && user?.id) {
    const { data: memberData, error: memberError } = await supabase
      .from('challenge_participants')
      .select('id')
      .eq('challenge_id', id)
      .eq('user_id', user.id)
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
    setParticipants([]);
    setInteractions([]);
    setLoading(false);
    setActivitiesLoading(false);
    setParticipantsLoading(false);
    return;
  }

  setChallenge(challengeData);
  setLoading(false);

  const [activitiesResponse, participantsResponse, interactionsResponse] =
    await Promise.all([
      supabase
        .from('activities')
        .select(
          'id, challenge_id, user_id, user_email, sport, distance_km, duration_minutes, unit_type, unit_value, exercise_type, comment, created_at, likes_count, boosts_count'
        )
        .eq('challenge_id', id)
        .order('created_at', { ascending: false }),

      supabase
        .from('challenge_participants')
        .select('id, challenge_id, user_id, role, joined_at')
        .eq('challenge_id', id)
        .order('joined_at', { ascending: true }),

      supabase
        .from('activity_interactions')
        .select('id, activity_id, user_id, type, created_at'),
    ]);

  const { data: activitiesData, error: activitiesError } = activitiesResponse;
  const { data: participantsData, error: participantsError } = participantsResponse;
  const { data: interactionsData, error: interactionsError } = interactionsResponse;

  if (activitiesError) {
    console.error('Erreur chargement activités :', activitiesError);
    setActivities([]);
    setActivitiesErrorMessage(
      activitiesError.message || 'Impossible de charger les activités pour le moment.'
    );
  } else {
    setActivities((activitiesData as Activity[]) || []);
  }

  if (participantsError) {
    console.error('Erreur chargement participants :', participantsError);
    setParticipants([]);
    setParticipantsErrorMessage(
      participantsError.message || 'Impossible de charger les participants pour le moment.'
    );
  } else {
    setParticipants((participantsData as ChallengeParticipant[]) || []);
  }

  if (interactionsError) {
    console.error('Erreur chargement interactions :', interactionsError);
    setInteractions([]);
  } else {
    setInteractions((interactionsData as ActivityInteraction[]) || []);
  }

  const loadedActivities = (activitiesData as Activity[]) || [];
  const loadedParticipants = (participantsData as ChallengeParticipant[]) || [];

  const userIdsFromParticipants = loadedParticipants.map((participant) => participant.user_id);
  const userIdsFromActivities = loadedActivities
    .map((activity) => activity.user_id)
    .filter((value): value is string => Boolean(value));

  const emailsFromActivities = loadedActivities
    .map((activity) => activity.user_email)
    .filter((value): value is string => Boolean(value));

  const uniqueUserIds = Array.from(
    new Set([...userIdsFromParticipants, ...userIdsFromActivities])
  );
  const uniqueEmails = Array.from(new Set(emailsFromActivities));

  let profilesData: Profile[] = [];

  if (uniqueUserIds.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, username')
      .in('id', uniqueUserIds);

    if (error) {
      console.error('Erreur chargement profils par id :', error);
    } else {
      profilesData = [...profilesData, ...((data as Profile[]) || [])];
    }
  }

  const missingEmails = uniqueEmails.filter((email) => {
    return !profilesData.some(
      (profile) => profile.email?.toLowerCase() === email.toLowerCase()
    );
  });

  if (missingEmails.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, username')
      .in('email', missingEmails);

    if (error) {
      console.error('Erreur chargement profils par email :', error);
    } else {
      profilesData = [...profilesData, ...((data as Profile[]) || [])];
    }
  }

  const nextProfilesById: Record<string, string> = {};
  const nextProfilesByEmail: Record<string, string> = {};

  profilesData.forEach((profile) => {
    if (profile.id && profile.username) {
      nextProfilesById[profile.id] = profile.username;
    }

    if (profile.email && profile.username) {
      nextProfilesByEmail[profile.email.toLowerCase()] = profile.username;
    }
  });

  setProfilesById(nextProfilesById);
  setProfilesByEmail(nextProfilesByEmail);

  setActivitiesLoading(false);
  setParticipantsLoading(false);
};

useEffect(() => {
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

  const getDisplayName = (
    userId: string | null | undefined,
    email: string | null | undefined
  ) => {
    if (userId && profilesById[userId]) return profilesById[userId];
    if (email && profilesByEmail[email.toLowerCase()]) return profilesByEmail[email.toLowerCase()];
    if (email) return email;
    return 'Utilisateur inconnu';
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
      const userKey = activity.user_id || activity.user_email || 'Utilisateur inconnu';
      const displayName = getDisplayName(activity.user_id, activity.user_email);

      if (!grouped.has(userKey)) {
        grouped.set(userKey, {
          user_key: userKey,
          displayName,
          totalValue: 0,
          totalActivities: 0,
          totalDistance: 0,
          totalDuration: 0,
          totalReps: 0,
        });
      }

      const current = grouped.get(userKey)!;

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
  }, [normalizedActivities, profilesById, profilesByEmail, effectiveGoalType]);

  const progressPercent =
    effectiveGoalValue && effectiveGoalValue > 0
      ? Math.min((totalChallengeProgress / effectiveGoalValue) * 100, 100)
      : null;

  const isOwner = currentUserId === challenge?.created_by;

  const isParticipant = useMemo(() => {
    if (!currentUserId) return false;
    return participants.some((participant) => participant.user_id === currentUserId);
  }, [participants, currentUserId]);

  const isPublic = challenge?.visibility === 'public';

  const getLikesCount = (activityId: string) => {
  return interactions.filter(
    (interaction) =>
      interaction.activity_id === activityId && interaction.type === 'like'
  ).length;
};

const getBoostsCount = (activityId: string) => {
  return interactions.filter(
    (interaction) =>
      interaction.activity_id === activityId && interaction.type === 'boost'
  ).length;
};

const hasUserLiked = (activityId: string) => {
  if (!currentUserId) return false;

  return interactions.some(
    (interaction) =>
      interaction.activity_id === activityId &&
      interaction.user_id === currentUserId &&
      interaction.type === 'like'
  );
};

const handleLike = async (activityId: string) => {
  if (!currentUserId) {
    alert('Tu dois être connecté pour liker une activité.');
    return;
  }

  const existingLike = interactions.find(
    (interaction) =>
      interaction.activity_id === activityId &&
      interaction.user_id === currentUserId &&
      interaction.type === 'like'
  );

  if (existingLike) {
    const { error } = await supabase
      .from('activity_interactions')
      .delete()
      .eq('id', existingLike.id);

    if (error) {
      console.error('Erreur suppression like :', error);
      alert("Impossible de retirer le like pour le moment.");
      return;
    }
  } else {
    const { error } = await supabase
      .from('activity_interactions')
      .insert({
        activity_id: activityId,
        user_id: currentUserId,
        type: 'like',
      });

    if (error) {
      console.error('Erreur ajout like :', error);
      alert("Impossible d'ajouter le like pour le moment.");
      return;
    }
  }

  await fetchChallengeAndActivities();
};


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

  const handleJoinChallenge = async () => {
    if (!challenge?.id) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert('Vous devez être connecté pour rejoindre ce challenge.');
      return;
    }

    setJoiningChallenge(true);

    try {
      const { error } = await supabase.from('challenge_participants').insert({
        challenge_id: challenge.id,
        user_id: user.id,
        role: 'participant',
      });

      if (error) {
        if (error.code === '23505') {
          alert('Vous participez déjà à ce challenge.');
        } else {
          console.error('Erreur participation challenge :', error);
          alert("Impossible de rejoindre le challenge pour le moment.");
        }
        return;
      }

      setParticipants((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          challenge_id: challenge.id,
          user_id: user.id,
          role: 'participant',
          joined_at: new Date().toISOString(),
        },
      ]);

      setCurrentUserId(user.id);
    } finally {
      setJoiningChallenge(false);
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
        <Link href="/" className="detail-back-link">
          ← Retour à l’accueil
        </Link>

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
              {isPublic && !isParticipant && (
                <button
                  type="button"
                  className="button primary"
                  onClick={handleJoinChallenge}
                  disabled={joiningChallenge}
                >
                  {joiningChallenge ? 'Participation...' : 'Rejoindre le challenge'}
                </button>
              )}

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
              <span className="challenge-meta-label">
                {getGoalTypeLabel(effectiveGoalType)}
              </span>
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
            <strong className="stat-card-value">{participants.length}</strong>
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
            <p style={{ marginTop: '1rem' }}>Aucun objectif défini pour ce challenge.</p>
          )}
        </section>

        <section className="card">
          <h2>Participants</h2>

          {participantsLoading ? (
            <p style={{ marginTop: '1rem' }}>Chargement des participants...</p>
          ) : participantsErrorMessage ? (
            <p style={{ marginTop: '1rem', color: 'crimson' }}>
              {participantsErrorMessage}
            </p>
          ) : participants.length === 0 ? (
            <p style={{ marginTop: '1rem' }}>Aucun participant pour le moment.</p>
          ) : (
            <div className="leaderboard-list">
              {participants.map((participant) => (
                <article key={participant.id} className="leaderboard-item">
                  <div className="leaderboard-rank">
                    {participant.role === 'admin' ? '👑' : '👤'}
                  </div>

                  <div className="leaderboard-main">
                    <strong className="leaderboard-name">
                      {getDisplayName(participant.user_id, null)}
                    </strong>
                    <div className="leaderboard-meta">
                      <span>
                        {participant.role === 'admin' ? 'Administrateur' : 'Participant'}
                      </span>
                      <span>Rejoint le {formatDate(participant.joined_at)}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2>Classement</h2>

          {leaderboard.length === 0 ? (
            <p style={{ marginTop: '1rem' }}>Aucune activité pour le moment.</p>
          ) : (
            <div className="leaderboard-list">
              {leaderboard.map((row, index) => (
                <article key={row.user_key} className="leaderboard-item">
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

                      {row.totalReps > 0 && <span>{formatReps(row.totalReps)}</span>}

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
                    <strong className="activity-user">
                      {getDisplayName(activity.user_id, activity.user_email)}
                    </strong>
                    <span className="activity-date">{formatDate(activity.created_at)}</span>
                  </div>

                  <div className="activity-sport">
                    {activity.sport || challenge.sport || 'Sport non renseigné'}
                  </div>

                  <div className="activity-stats">
                    {activity.normalized_unit_type === 'distance' && (
                      <span>
                        <strong>Distance :</strong>{' '}
                        {formatDistance(activity.normalized_unit_value)}
                      </span>
                    )}

                    {activity.normalized_unit_type === 'duration' && (
                      <span>
                        <strong>Durée :</strong>{' '}
                        {formatDuration(activity.normalized_unit_value)}
                      </span>
                    )}

                    {activity.normalized_unit_type === 'reps' && (
                      <span>
                        <strong>Répétitions :</strong>{' '}
                        {formatReps(activity.normalized_unit_value)}
                      </span>
                    )}

                    {activity.exercise_type && (
                      <span>
                        <strong>Exercice :</strong>{' '}
                        {formatExerciseType(activity.exercise_type)}
                      </span>
                    )}
                  </div>

                  {activity.comment && (
                    <p className="activity-comment">
                      <strong>Commentaire :</strong> {activity.comment}
                    </p>
                  )}
                  <div className="activity-reactions">
  <button
    type="button"
    className={`reaction-button ${hasUserLiked(activity.id) ? 'active' : ''}`}
    onClick={() => handleLike(activity.id)}
  >
    👍 {getLikesCount(activity.id)}
  </button>

  <span>⚡ {getBoostsCount(activity.id)}</span>
</div>
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