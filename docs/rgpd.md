# Pages legales et RGPD Actyv

Date: 2026-06-11

## Pages ajoutees

- `/legal/mentions-legales`
- `/legal/confidentialite`
- `/legal/cookies`

## Acces dans l'application

Les liens vers ces pages sont exposes dans le footer global de l'application afin
de rester accessibles depuis le site sans alourdir la navigation principale.

## Elements encore a completer

- nom legal exact de l'editeur
- responsable de publication
- validation de l'adresse de contact `contact@a-ctyv.fr`
- durees de conservation detaillees par categorie de donnees
- procedure interne de traitement des demandes RGPD

## Cookies actuellement utilises

A ce stade, la documentation produit ne declare que des cookies ou mecanismes
techniques necessaires au fonctionnement du service:

- authentification / session
- securite
- preferences essentielles si presentes

Aucun cookie analytique ou publicitaire non essentiel n'est documente dans ce
patch. Si cela change, un mecanisme de consentement devra etre ajoute avant
activation.

## Prochaines etapes RGPD recommandees

1. Completer les informations legales definitives.
2. Verifier en production la liste exacte des cookies / stockages utilises par
   Supabase, Vercel et les services tiers.
3. Formaliser les durees de retention par table et par usage.
4. Documenter la procedure d'exercice des droits utilisateur.
5. Prevoir un registre simple des sous-traitants et des transferts eventuels.

## Export des donnees utilisateur

Une premiere version de l'export utilisateur est disponible depuis la page
Profil, dans la section `Confidentialite et donnees`.

### Donnees incluses

- profil
- activites
- challenges crees
- challenges rejoints
- seances creees
- programmes crees
- badges obtenus
- evenements XP
- historique d'entrainement et statistiques utilisateur

### Limites de la V1

- export JSON uniquement, telecharge cote navigateur
- certaines donnees anciennes peuvent dependre du fallback email si elles n'ont
  pas encore ete migrees vers `user_id`
- si une source n'est pas disponible pour le compte, l'export reste genere et
  ajoute une note explicative au lieu d'echouer

### Prochaines etapes

- suppression ou anonymisation du compte
- procedure utilisateur documentee pour demande d'export et d'effacement
- verification plus fine du perimetre des tables exportables en production

## Synchronisation Android Health Connect

Une premiere base de synchronisation Android est disponible dans la section
`Sante et synchronisation` de la page Profil.

> Note technique: Health Connect requiert Android 8.0 / API 26 minimum pour
> l'application Android Actyv.

### Donnees lues de Health Connect

- pas du jour
- distance totale du jour si disponible
- distance marche/course si disponible
- distance velo si disponible

### Nature de la V1

- integration optionnelle et limitee a Android
- aucune synchronisation automatique sans autorisation utilisateur
- si Health Connect n'est pas disponible, la saisie manuelle reste active
- les donnees synchronisees sont enregistrees dans `daily_steps` avec
  `source = health_connect`

### Limites de la V1

- lecture uniquement des donnees du jour
- pas de synchronisation continue en arriere-plan
- pas de synchronisation iOS
- les permissions Health Connect restent revocables depuis Android

### Prochaines etapes

- envisager la lecture de series temporelles plus larges
- documenter les durees de retention des donnees d'activite synchronisees
- verifier la politique produit si d'autres types de donnees s'ajoutent

## Suppression de compte

Une premiere version du droit a l'effacement est exposee depuis la page Profil,
dans la section `Confidentialite et donnees`.

### Donnees supprimees

- compte Auth Supabase, via API admin cote serveur
- profil utilisateur
- badges et evenements XP relies au compte
- seances, programmes, historiques d'entrainement, donnees quotidiennes et
  autres donnees strictement personnelles supprimees par cascade ou suppression
  ciblee

### Donnees anonymisees

- activites conservees pour l'integrite des challenges, avec auteur anonymise
  et commentaire efface
- challenges crees conserves, avec `created_by` remis a `null`

### Limites de la V1

- la suppression Auth cote serveur necessite la variable
  `SUPABASE_SERVICE_ROLE_KEY`
- certaines tables legacy peuvent etre ignorees proprement si elles ne sont pas
  presentes sur la base ciblee
- la suppression agit sur le compte connecte uniquement

### Actions manuelles restantes

- ajouter `SUPABASE_SERVICE_ROLE_KEY` dans l'environnement serveur
- verifier en production le comportement exact des tables legacy `users`,
  `challenge_members` et des anciennes donnees email non migrees
