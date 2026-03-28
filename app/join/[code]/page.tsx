'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AppShell } from '@/components/AppShell';

type Challenge = {
  id: string;
  name: string;
  sport: string;
  description: string | null;
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

        if (userError || !user || !user.email) {
          setMessage('Vous devez être connecté pour rejoindre un challenge.');
          setLoading(false);
          return;
        }

        const { data: foundChallenge, error: challengeError } = await supabase
          .from('challenges')
          .select('id, name, sport, description')
          .eq('invite_code', code)
          .single();

        if (challengeError || !foundChallenge) {
          setMessage('Challenge introuvable ou lien invalide.');
          setLoading(false);
          return;
        }

        setChallenge(foundChallenge);

        const { data: existingMember, error: existingMemberError } = await supabase
          .from('challenge_members')
          .select('id')
          .eq('challenge_id', foundChallenge.id)
          .eq('user_email', user.email)
          .maybeSingle();

        if (existingMemberError) {
          console.error('Erreur vérification membre existant :', existingMemberError);
          setMessage("Une erreur s'est produite lors de la vérification du challenge.");
          setLoading(false);
          return;
        }

        if (existingMember) {
          setJoined(true);
          setMessage('Vous faites déjà partie de ce challenge.');
          setLoading(false);
          return;
        }

        const { error: insertError } = await supabase
          .from('challenge_members')
          .insert([
            {
              challenge_id: foundChallenge.id,
              user_email: user.email,
              role: 'member',
            },
          ]);

        if (insertError) {
          console.error('Erreur ajout membre :', insertError);
          setMessage("Impossible de rejoindre le challenge pour le moment.");
          setLoading(false);
          return;
        }

        setJoined(true);
        setMessage('Vous avez rejoint le challenge avec succès !');
      } catch (error) {
        console.error('Erreur inattendue page join :', error);
        setMessage("Une erreur inattendue s'est produite.");
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