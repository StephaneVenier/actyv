'use client';

import { useEffect, useMemo, useState } from 'react';
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
  created_at?: string | null;
  goal_km?: number | null;
  visibility?: string | null;
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

type ChallengeMember = {
  challenge_id: string;
  user_email: string | null;
};

function formatDate(dateString: string | null) {
  if (!dateString) return 'Date inconnue';

  const date = new Date(dateString);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatDistance(distance: number | null) {
  if (distance === null || distance === undefined) return null;
  return `${distance.toFixed(1)} km`;
}

function formatDuration(duration: number | null) {
  if (duration === null || duration === undefined) return null;
  return `${duration} min`;
}

export default function HomePage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [loadingChallenges, setLoadingChallenges] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(true);

  useEffect(() => {
    const fetchHomeData = async () => {
      setLoadingChallenges(true);
      setLoadingFeed(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const userEmail = user?.email || null;

      let visibleChallengeIds: string[] = [];

      if (userEmail) {
        const { data: memberRows, error: membersError } = await supabase
          .from('challenge_members')
          .select('challenge_id, user_email')
          .eq('user_email', userEmail);

        if (membersError) {
          console.error('Erreur chargement challenge_members :', membersError);
        } else {
          visibleChallengeIds = (memberRows as ChallengeMember[] | null)?.map(
            (row) => row.challenge_id
          ) || [];
        }
      }

      let challengesQuery = supabase
        .from('challenges')
        .select('id, name, sport, description, start_date, end_date, created_at, goal_km, visibility')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (userEmail && visibleChallengeIds.length > 0) {
        challengesQuery = challengesQuery.or(
          `visibility.eq.public,id.in.(${visibleChallengeIds.join(',')})`
        );
      } else {
        challengesQuery = challengesQuery.eq('visibility', 'public');
      }

      const { data: challengesData, error: challengesError } = await challengesQuery;

      if (challengesError) {
        console.error('Erreur chargement challenges :', challengesError);
        setChallenges([]);
      } else {
        setChallenges(challengesData || []);
      }

      setLoadingChallenges(false);

      if (!userEmail) {
        setActivities([]);
        setProfilesMap({});
        setLoadingFeed(false);
        return;
      }

      const joinedChallengeIds = visibleChallengeIds;

      if (joinedChallengeIds.length === 0) {
        setActivities([]);
        setProfilesMap({});
        setLoadingFeed(false);
        return;
      }

      const { data: feedActivities, error: feedError } = await supabase
        .from('activities')
        .select('id, challenge_id, user_email, sport, distance_km, duration_minutes, comment, created_at')
        .in('challenge_id', joinedChallengeIds)
        .order('created_at', { ascending: false })
        .limit(8);

      if (feedError) {
        console.error('Erreur chargement feed activités :', feedError);
        setActivities([]);
        setProfilesMap({});
        setLoadingFeed(false);
        return;
      }

      const loadedActivities = feedActivities || [];
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

      setLoadingFeed(false);
    };

    fetchHomeData();
  }, []);

  const challengesMap = useMemo(() => {
    return Object.fromEntries(challenges.map((challenge) => [challenge.id, challenge]));
  }, [challenges]);

  const getDisplayName = (email: string | null) => {
    if (!email) return 'Utilisateur inconnu';
    return profilesMap[email] || email;
  };

  return (
    <AppShell>
      <div className="home-page">
        <section className="hero-banner">
          <div className="hero-actions">
            <Link
              href="/challenges/new"
              className="hero-btn hero-btn--primary hero-btn-left"
            >
              Créer un challenge
            </Link>

            <Link
              href="/challenges"
              className="hero-btn hero-btn--secondary hero-btn-right"
            >
              Explorer les challenges
            </Link>
          </div>
        </section>

        <section className="home-challenges">
          <div className="home-challenges__header">
            <div>
              <span className="section-kicker">En ce moment</span>
              <h2>Challenges en cours</h2>
            </div>

            <Link href="/challenges" className="home-challenges__link">
              Voir tout
            </Link>
          </div>

          {loadingChallenges ? (
            <div className="challenge-state">
              <p>Chargement des challenges...</p>
            </div>
          ) : challenges.length === 0 ? (
            <div className="challenge-state">
              <p>Aucun challenge en cours pour le moment.</p>
            </div>
          ) : (
            <div className="challenge-list">
              {challenges.slice(0, 6).map((challenge) => (
                <Link
                  key={challenge.id}
                  href={`/challenges/${challenge.id}`}
                  className="challenge-item"
                >
                  <div className="challenge-item__top">
                    <span className="challenge-item__pill">
                      {challenge.sport || 'Sport'}
                    </span>
                  </div>

                  <h3>{challenge.name}</h3>

                  <p>
                    {challenge.description?.trim()
                      ? challenge.description
                      : challenge.goal_km
                        ? `Objectif : ${challenge.goal_km} km`
                        : 'Rejoins ce challenge et commence à faire progresser ton équipe.'}
                  </p>

                  <span className="challenge-item__cta">Voir le détail →</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="home-feed">
          <div className="home-feed__header">
            <div>
              <span className="section-kicker">À suivre</span>
              <h2>Activités récentes</h2>
            </div>
          </div>

          {loadingFeed ? (
            <div className="challenge-state">
              <p>Chargement des activités...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="challenge-state">
              <p>Aucune activité récente sur tes challenges pour le moment.</p>
            </div>
          ) : (
            <div className="feed-list">
              {activities.map((activity) => {
                const challenge = challengesMap[activity.challenge_id];
                const distanceText = formatDistance(activity.distance_km);
                const durationText = formatDuration(activity.duration_minutes);

                return (
                  <article key={activity.id} className="feed-item">
                    <div className="feed-item__top">
                      <div className="feed-item__identity">
                        <strong>{getDisplayName(activity.user_email)}</strong>
                        <span className="feed-item__date">{formatDate(activity.created_at)}</span>
                      </div>

                      <div className="feed-item__action">
                        a ajouté une activité
                      </div>

                      {challenge && (
                        <Link
                          href={`/challenges/${challenge.id}`}
                          className="feed-item__challenge"
                        >
                          {challenge.name}
                        </Link>
                      )}
                    </div>

                    <div className="feed-item__sport">
                      {activity.sport || challenge?.sport || 'Activité'}
                    </div>

                    <div className="feed-item__stats">
                      {distanceText && <span>{distanceText}</span>}
                      {durationText && <span>{durationText}</span>}
                    </div>

                    {activity.comment && (
                      <p className="feed-item__comment">{activity.comment}</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}