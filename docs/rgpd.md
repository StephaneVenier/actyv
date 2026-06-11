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
