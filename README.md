# A-ctyv — starter V1

Base de démarrage pour la V1 de la web app A-ctyv.

## Stack

- Next.js 15
- React 19
- Supabase
- TypeScript

## Pages incluses

- `/` → accueil orienté challenge collectif
- `/challenges/new` → création d'un challenge
- `/challenges/[id]` → page challenge
- `/activities/new` → ajout d'activité
- `/login` → connexion (placeholder)

## Lancer le projet

1. Installer les dépendances

```bash
npm install
```

2. Copier l'environnement

```bash
cp .env.example .env.local
```

3. Renseigner les clés Supabase dans `.env.local`

4. Lancer le projet

```bash
npm run dev
```

## Base de données

Le schéma SQL initial se trouve dans :

```bash
supabase/schema.sql
```

## Priorités pour la suite

1. Brancher Supabase Auth
2. Sauvegarder les challenges en base
3. Sauvegarder les activités en base
4. Ajouter la bibliothèque de modèles de programme
5. Ajouter commentaires et réactions réels
