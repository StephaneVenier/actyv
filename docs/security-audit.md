# Audit securite Supabase et RLS

Date: 2026-06-11

## Portee

Audit cible des acces aux donnees dans le repo Actyv, avec priorite sur les challenges prives, les tables d'activites et les tables exposees par la Banque / gamification.

Objectif de ce patch:

- verifier les protections RLS presentes dans le repo
- corriger les failles evidentes et suffisamment sures
- documenter les zones de risque qui demandent une verification manuelle cote Supabase

## Constats principaux

### 1. Challenges prives

Cause la plus probable du bug remonte:

- la policy `public.challenges` autorisait le createur et `challenge_participants`
- elle ne prenait pas en compte les invitations stockees dans `challenge_members`

Effet concret:

- un challenge prive pouvait exister en base
- etre visible dans certains ecrans derives du profil
- mais rester absent ou inaccessible dans la liste/detail quand l'acces dependait d'une invitation email plutot que d'une ligne `challenge_participants`

Correction appliquee:

- la lecture des challenges inclut maintenant aussi les lignes `challenge_members.user_email = auth email`
- ajout des policies `update` et `delete` sur `challenges` pour limiter ces operations au createur

### 2. Tables challenge/activity sans RLS versionnee

Dans le repo, les protections RLS versionnees etaient presentes pour:

- `challenges` (partiellement)
- `challenge_participants` (partiellement)
- `training_sessions`
- `training_session_blocks`
- `training_programs`
- `training_program_sessions`
- `training_program_completions`
- `xp_events`
- `user_badges`
- `daily_sessions`
- `daily_session_completions`
- `daily_steps`

En revanche, aucune policy versionnee n'etait trouvee pour:

- `challenge_members`
- `activities`
- `activity_interactions`

Correction appliquee:

- activation RLS explicite
- lecture limitee aux challenges/activites visibles
- ecriture limitee au proprietaire ou createur quand pertinent

### 3. Derive schema/code

Le repo montre une derive entre le schema versionne et le code front:

- le code utilise `challenge_members.user_email`
- le code utilise `activities.user_email`, `sport`, `unit_type`, `unit_value`, `exercise_type`
- ces colonnes ne sont pas toutes definies dans les premieres declarations de `supabase/schema.sql`

Conclusion:

- le projet Supabase reel a probablement evolue hors du schema versionne
- il faut considerer `schema.sql` comme incomplet/incoherent tant qu'un resync n'a pas ete fait

Ce patch ne refond pas ce schema, mais le signale explicitement.

## Tables verifiees

| Table | Etat RLS dans le repo | Observation | Action |
| --- | --- | --- | --- |
| `profiles` | non versionne ici | table lue par de nombreux ecrans, melange probable donnees publiques/privees | pas de verrouillage automatique; verification manuelle recommandee |
| `challenges` | present, incomplet | omission des acces via `challenge_members`; pas d'update/delete explicites | corrige |
| `challenge_participants` | present, partiel | lecture/ecriture partielle; pas de delete explicite | renforce |
| `challenge_members` | absent | risque d'exposition des invitations email | corrige |
| `activities` | absent | risque d'acces large aux activites et metadata challenge | corrige |
| `activity_interactions` | absent | risque d'ecriture/lecture large des likes/boosts | corrige |
| `training_sessions` | present | lecture publique + proprio conforme au besoin Banque | RAS |
| `training_session_blocks` | present | coherent avec `training_sessions` | RAS |
| `training_programs` | present | public/shared/private conforme | RAS |
| `training_program_sessions` | present | coherent avec la visibilite du programme | RAS |
| `training_program_completions` | present | proprietaire uniquement | RAS |
| `xp_events` | present | lecture/insertion propres; ecriture limitee a soi | RAS |
| `user_xp_events` | non trouve | semble obsolete/remplace par `xp_events` | a supprimer/archiver si existe encore en prod |
| `user_badges` | present | lecture/insertion propres | RAS |
| `badges` | table non trouvee | badges definis en code dans `lib/badges.ts` | RAS cote DB |
| `daily_sessions` | present | lecture publique controlee par session publique | RAS |
| `daily_session_completions` | present | proprietaire uniquement | RAS |
| `daily_steps` | present | proprietaire uniquement | RAS |
| `notifications` | table non trouvee | non auditee faute de schema | a verifier si table existe en prod |

## Fichier modifie

- `supabase/migrations/20260611_audit_rls_challenges_and_activities.sql`

## Corrections appliquees

### `public.challenges`

- select:
  - public si `visibility = 'public'`
  - createur
  - participant (`challenge_participants.user_id = auth.uid()`)
  - membre invite (`challenge_members.user_email = auth email`)
- insert:
  - createur uniquement
- update/delete:
  - createur uniquement

### `public.challenge_participants`

- select:
  - utilisateur lui-meme
  - createur du challenge
  - lecture publique pour les challenges publics
- insert:
  - utilisateur lui-meme, seulement sur un challenge visible/non supprime
- delete:
  - utilisateur lui-meme ou createur du challenge

### `public.challenge_members`

- select:
  - createur du challenge
  - utilisateur invite par email
  - lecture publique si le challenge est public
- insert/update/delete:
  - createur du challenge uniquement

### `public.activities`

- select:
  - proprietaire direct (`user_id` ou `user_email`)
  - activite d'un challenge public
  - activite d'un challenge dont l'utilisateur est createur, participant ou membre invite
- insert:
  - proprietaire direct uniquement
  - challenge accessible et non supprime
- update/delete:
  - proprietaire direct uniquement

### `public.activity_interactions`

- select:
  - si l'activite cible est visible
- insert:
  - uniquement pour son propre `user_id`
  - seulement sur une activite visible
- delete:
  - uniquement ses propres interactions

## Points restant a verifier manuellement dans Supabase

### 1. Policies `profiles`

Le repo ne versionne pas clairement les policies de `profiles`, alors que la table sert a:

- charger son propre profil
- resoudre un `id` depuis un email
- afficher des `username`/`level` sur des ecrans communautaires

Risque:

- si `profiles` est trop ouvert, l'email des utilisateurs peut etre expose
- si `profiles` est trop ferme, leaderboard/challenges peuvent casser

Recommandation:

- separer a terme `profiles` prive et `public_profiles`/view publique
- garder email prive
- exposer seulement `id`, `username`, `level`, `avatar_url` si necessaire

### 2. Verification de la derive schema

Verifier dans le projet Supabase reel que les colonnes ci-dessous existent bien:

- `challenge_members.user_email`
- `activities.user_email`
- `activities.sport`
- `activities.unit_type`
- `activities.unit_value`
- `activities.exercise_type`
- `activities.likes_count`
- `activities.boosts_count`

Si `schema.sql` doit redevenir la source de verite:

- le resynchroniser avec la base reelle
- ou generer un dump schema propre

### 3. Anciennes tables/event legacy

Verifier si les objets suivants existent encore en production:

- `user_xp_events`
- `notifications`
- anciennes policies non versionnees

Si oui:

- confirmer leur usage reel
- les verrouiller ou les retirer

## Recommandations pour la suite

1. Ajouter un audit automatique RLS dans le process de release:
   - liste des tables sans RLS
   - liste des tables sans policy `update/delete`

2. Resynchroniser `supabase/schema.sql` avec le schema reel.

3. Sortir les donnees de profil publiques dans une vue dediee.

4. Faire une verification manuelle dans le dashboard Supabase:
   - onglet Authentication > policies
   - test avec compte createur
   - test avec compte participant
   - test avec compte secondaire invite par email
   - test non connecte sur challenges publics

## Scenarios de verification conseilles

1. Challenge prive cree par A, visible par A.
2. Challenge prive avec invitation email vers B, visible par B dans la liste.
3. Detail du challenge prive accessible par B.
4. B peut rejoindre le challenge, mais ne peut pas modifier/supprimer le challenge.
5. C non invite ne voit pas le challenge prive.
6. Activites d'un challenge prive visibles seulement par createur/participants/invites.
7. Likes/boosts possibles seulement sur des activites visibles.

## Profiles et donnees personnelles

### Champs publics identifies

Ces champs peuvent rester visibles via une surface publique dediee:

- `id`
- `username`
- `level`
- `total_xp` si necessaire aux classements

### Champs prives identifies

Ces champs doivent rester reserves au proprietaire:

- `email`
- toute preference de compte
- toute information personnelle supplementaire stockee plus tard dans `profiles`
- toute donnee interne de gestion de compte

### Corrections realisees

- activation RLS explicite sur `public.profiles`
- lecture du profil complet limitee a l'utilisateur proprietaire
- insertion / mise a jour / suppression limitees a l'utilisateur proprietaire
- creation d'une vue publique `public.public_profiles` n'exposant que:
  - `id`
  - `username`
  - `level`
  - `total_xp`
- bascule des lectures communautaires de `profiles` vers `public_profiles` pour:
  - l'accueil / feed
  - les classements
  - le detail challenge
  - la Banque Actyv
  - les programmes publics partages

### Risques trouves

Le repo utilise encore des champs historiques bases sur l'email dans d'autres tables, notamment:

- `activities.user_email`
- `challenge_members.user_email`

Cela signifie que la protection de `profiles.email` ne suffit pas a elle seule pour clore tout le sujet RGPD.

### Recommandations RGPD

1. Considerer `public_profiles` comme unique surface publique du profil.
2. Remplacer progressivement les usages metier de `user_email` par `user_id`.
3. Eviter tout fallback visuel public base sur l'email.
4. Prevoir une migration progressive des anciennes activites qui n'auraient pas encore `user_id`.
