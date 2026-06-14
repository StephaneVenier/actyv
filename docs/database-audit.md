# Audit de synchronisation Supabase

Date: 2026-06-14

## Portee

Cet audit recoupe trois sources du depot:

- `supabase/schema.sql`
- les migrations presentes dans `supabase/migrations/`
- les tables, colonnes et RPC reellement utilises dans `app/`, `lib/` et `components/`

Important:

- cet audit remet le depot en coherence avec la structure **utilisee par le code**
- il ne supprime aucune table legacy sans certitude
- il ne pretend pas etre un dump direct de la base distante, car cette session ne
  dispose pas d'un acces d'inspection admin a la base de production

## Tables confirmees comme actives

Ces objets sont clairement utilises par le produit actuel:

- `profiles`
- `public_profiles` (vue publique)
- `challenges`
- `challenge_members`
- `challenge_participants`
- `activities`
- `activity_interactions`
- `xp_events`
- `user_badges`
- `training_sessions`
- `training_session_blocks`
- `workout_sessions_history`
- `workout_exercise_history`
- `training_programs`
- `training_program_sessions`
- `training_program_completions`
- `daily_sessions`
- `daily_session_completions`
- `daily_steps`

## Tables legacy ou non confirmees

Ces objets existent encore dans `schema.sql`, mais ne sont pas au coeur du code
app actuel ou semblent issus d'iterations precedentes:

- `users`
- `program_templates`
- `program_sessions`
- `activity_reactions`
- `activity_comments`
- `workout_session_history_exercises`

Ces objets ne sont pas supprimes dans ce patch. Ils restent a verifier contre la
base distante avant toute suppression.

## Tables attendues mais absentes ou non versionnees

- `badges` n'existe pas en base versionnee: les definitions sont gerees en code
  dans `lib/badges.ts`
- `user_xp_events` n'est pas versionnee et apparait obsolete au profit de
  `xp_events`
- `notifications` n'est pas versionnee dans le repo actuel

## Ecarts trouves

### 1. `challenges`

Le debut de `schema.sql` decrivait encore une ancienne forme:

- `title`
- `sport_type`
- `target_date`
- `invitation_code`

Alors que le code et les migrations utilisent:

- `name`
- `sport`
- `end_date`
- `goal_km`
- `goal_type`
- `goal_value`
- `visibility`
- `invite_code`
- `is_deleted`

Correction effectuee:

- mise a jour de la definition versionnee de `public.challenges`

### 2. `challenge_members`

Le schema versionne etait en retard sur la migration email -> `user_id`:

- `user_id` etait encore strictement `not null`
- `user_email` n'etait pas present dans la definition initiale

Le code actuel et les migrations utilisent les deux pendant la transition.

Correction effectuee:

- definition mise a jour avec `user_id` nullable
- ajout de `user_email`

### 3. `activities`

Le schema versionne decrivait encore une activite de type legacy:

- `sport_type`
- `activity_date`
- `effort_level`
- `source`
- `external_id`

Le code actuel utilise plutot:

- `user_id`
- `user_email`
- `sport`
- `distance_km`
- `duration_minutes`
- `unit_type`
- `unit_value`
- `exercise_type`
- `comment`
- `likes_count`
- `boosts_count`

Correction effectuee:

- definition versionnee de `public.activities` alignee sur les usages reels du
  front et des helpers

### 4. `xp_events`

Le plus gros ecart trouve:

`schema.sql` decrivait encore:

- `source`
- `xp`
- `metadata`

alors que le code et les ecritures front actuelles utilisent:

- `event_type`
- `xp_amount`
- `target_id`

Correction effectuee:

- definition de table corrigee
- indexs corriges
- fonctions `award_xp` et `award_xp_internal` mises a jour pour ecrire et lire
  les bons champs

### 5. `public_profiles`

Le code lit la vue `public_profiles`, mais elle n'etait pas integree dans le
schema versionne principal.

Correction effectuee:

- ajout de `public.public_profiles` dans `schema.sql`
- ajout des grants `anon` et `authenticated`

## Corrections effectuees dans ce patch

Fichier principal mis a jour:

- `supabase/schema.sql`

Corrections realisees:

- alignement des tables `challenges`, `challenge_members`, `activities`,
  `xp_events`
- ajout / reversion de `public_profiles`
- synchronisation des index `xp_events`
- synchronisation des fonctions XP avec les colonnes reelles

## Recommandations futures

1. Recuperer un dump schema officiel de la base distante et le comparer au repo.
2. Isoler les objets legacy encore necessaires de ceux qui peuvent etre
   archives.
3. Verifier si `users` doit survivre ou etre totalement remplace par
   `profiles/public_profiles`.
4. Statuer explicitement sur:
   - `program_templates`
   - `program_sessions`
   - `activity_reactions`
   - `activity_comments`
   - `workout_session_history_exercises`
5. Documenter la structure cible finale de `xp_events` et supprimer toute
   ancienne terminologie `source/xp/metadata` restante si elle existe encore en
   base distante.
