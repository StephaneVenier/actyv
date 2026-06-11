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
