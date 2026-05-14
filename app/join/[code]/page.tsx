'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AppShell } from '@/components/AppShell';
import { awardXp } from '@/lib/gamification';

type Challenge = {
  id: string;
  name: string;
  sport: string;
  description: string | null;
  already_joined?: boolean;
};

export default function JoinChallengePage() {
  const params = useParams();
  const code = typeof params.code === 'string' ? params.code : '';

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [message, setMessage] = useState('Vérification du lien...');
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const joinChallenge = async () => {
      try {
        if (!code) {
          setMessage("Code d'invitation invalide.");
          setLoading(false);
          return;
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setMessage('Vous devez être connecté pour rejoindre un challenge.');
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.rpc('join_challenge_by_invite', {
          p_invite_code: code,
        });

        const foundChallenge = Array.isArray(data)
          ? (data[0] as Challenge | undefined)
          : (data as Challenge | null);

        if (error || !foundChallenge) {
          console.error('Erreur invitation challenge :', error);
          setMessage(
            error?.message?.includes('invalid_invite')
              ? "Ce lien d'invitation est invalide ou expiré."
              : "Impossible de rejoindre ce challenge avec ce lien pour le moment."
          );
          setLoading(false);
          return;
        }

        setChallenge(foundChallenge);

        if (foundChallenge.already_joined) {
          setJoined(true);
          setMessage('Vous faites déjà partie de ce challenge.');
          setLoading(false);
          return;
        }

        await awardXp({
          userId: user.id,
          source: 'challenge_joined',
          metadata: { target_id: foundChallenge.id },
        });

        setJoined(true);
        setMessage('Vous avez rejoint le challenge avec succès !');
      } catch (error) {
        console.error('Erreur inattendue page join :', error);
        setMessage("Impossible de rejoindre ce challenge pour le moment.");
      } finally {
        setLoading(false);
      }
    };

    joinChallenge();
  }, [code]);

  return (
    <AppShell>
      <div className="card stack">
        <div>
          <h1>Rejoindre un challenge</h1>
          <p className="muted">Invitation via lien privé.</p>
        </div>

        {challenge && (
          <div className="card" style={{ padding: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>{challenge.name}</h2>
            <p style={{ margin: '0.25rem 0' }}>
              <strong>Sport :</strong> {challenge.sport}
            </p>
            {challenge.description && (
              <p style={{ margin: '0.5rem 0 0 0' }}>{challenge.description}</p>
            )}
          </div>
        )}

        <p
          style={{
            margin: 0,
            color:
              message.includes('succès') || message.includes('déjà')
                ? '#16a34a'
                : loading
                  ? 'inherit'
                  : 'crimson',
          }}
        >
          {message}
        </p>

        {joined && challenge && (
          <div>
            <Link href={`/challenges/${challenge.id}`} className="button primary">
              Voir le challenge
            </Link>
          </div>
        )}

        {!loading && !joined && (
          <div>
            <Link href="/" className="button">
              Retour à l’accueil
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
