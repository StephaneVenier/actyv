'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  EXERCISE_CATEGORIES,
  EXERCISE_LIBRARY,
  ExerciseCategory,
  ExerciseLibraryItem,
  FAVORITE_EXERCISES_STORAGE_KEY,
  RECENT_EXERCISES_STORAGE_KEY,
} from '@/lib/exercise-library';

type SessionExercisePickerProps = {
  buttonLabel?: string;
  disabled?: boolean;
  onSelectExercise: (exerciseName: string) => void;
};

function loadStoredExerciseNames(storageKey: string, limit = 10) {
  if (typeof window === 'undefined') return [] as string[];

  try {
    const savedValue = window.localStorage.getItem(storageKey);
    if (!savedValue) return [];

    const parsedValue = JSON.parse(savedValue);
    return Array.isArray(parsedValue) ? parsedValue.filter(Boolean).slice(0, limit) : [];
  } catch {
    return [];
  }
}

function saveStoredExerciseNames(storageKey: string, values: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify(values));
}

function saveRecentExercise(exerciseName: string) {
  if (typeof window === 'undefined' || !exerciseName.trim()) return;

  const nextRecentExercises = [
    exerciseName.trim(),
    ...loadStoredExerciseNames(RECENT_EXERCISES_STORAGE_KEY, 10).filter(
      (value) => value !== exerciseName.trim()
    ),
  ].slice(0, 10);

  saveStoredExerciseNames(RECENT_EXERCISES_STORAGE_KEY, nextRecentExercises);
}

function toggleFavoriteExercise(exerciseName: string) {
  const trimmedExerciseName = exerciseName.trim();
  if (typeof window === 'undefined' || !trimmedExerciseName) return [] as string[];

  const currentFavorites = loadStoredExerciseNames(FAVORITE_EXERCISES_STORAGE_KEY, 20);
  const nextFavorites = currentFavorites.includes(trimmedExerciseName)
    ? currentFavorites.filter((value) => value !== trimmedExerciseName)
    : [trimmedExerciseName, ...currentFavorites].slice(0, 20);

  saveStoredExerciseNames(FAVORITE_EXERCISES_STORAGE_KEY, nextFavorites);
  return nextFavorites;
}

function mapStoredExercisesToItems(exerciseNames: string[]) {
  const lookup = new Map<string, ExerciseLibraryItem>(
    EXERCISE_LIBRARY.map((exercise) => [exercise.name, exercise])
  );

  return exerciseNames
    .map((exerciseName) => lookup.get(exerciseName))
    .filter((exercise): exercise is ExerciseLibraryItem => Boolean(exercise));
}

export function SessionExercisePicker({
  buttonLabel = 'Choisir un exercice',
  disabled,
  onSelectExercise,
}: SessionExercisePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory | 'Toutes'>('Toutes');
  const [recentExercises, setRecentExercises] = useState<string[]>([]);
  const [favoriteExercises, setFavoriteExercises] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setRecentExercises(loadStoredExerciseNames(RECENT_EXERCISES_STORAGE_KEY, 10));
    setFavoriteExercises(loadStoredExerciseNames(FAVORITE_EXERCISES_STORAGE_KEY, 20));
  }, [isOpen]);

  const filteredExercises = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return EXERCISE_LIBRARY.filter((exercise) => {
      const matchesCategory =
        selectedCategory === 'Toutes' || exercise.category === selectedCategory;
      const matchesQuery =
        normalizedQuery.length === 0 || exercise.name.toLowerCase().includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [query, selectedCategory]);

  const favoriteExerciseItems = useMemo(
    () => mapStoredExercisesToItems(favoriteExercises),
    [favoriteExercises]
  );

  const recentExerciseItems = useMemo(
    () =>
      mapStoredExercisesToItems(recentExercises).filter(
        (exercise) => !favoriteExercises.includes(exercise.name)
      ),
    [favoriteExercises, recentExercises]
  );

  const filteredExerciseItems = useMemo(() => {
    const favoriteSet = new Set(favoriteExercises);

    return [...filteredExercises].sort((left, right) => {
      const leftIsFavorite = favoriteSet.has(left.name);
      const rightIsFavorite = favoriteSet.has(right.name);

      if (leftIsFavorite && !rightIsFavorite) return -1;
      if (!leftIsFavorite && rightIsFavorite) return 1;
      return left.name.localeCompare(right.name, 'fr');
    });
  }, [favoriteExercises, filteredExercises]);

  const handleSelectExercise = (exerciseName: string) => {
    onSelectExercise(exerciseName);
    saveRecentExercise(exerciseName);
    setRecentExercises(loadStoredExerciseNames(RECENT_EXERCISES_STORAGE_KEY, 10));
    setIsOpen(false);
    setQuery('');
    setSelectedCategory('Toutes');
  };

  const handleToggleFavorite = (exerciseName: string) => {
    setFavoriteExercises(toggleFavoriteExercise(exerciseName));
  };

  const renderExerciseItem = (exercise: ExerciseLibraryItem) => {
    const isFavorite = favoriteExercises.includes(exercise.name);

    return (
      <div key={exercise.name} className="session-exercise-picker-item">
        <button
          type="button"
          className="session-exercise-picker-item__select"
          onClick={() => handleSelectExercise(exercise.name)}
        >
          <span>{exercise.name}</span>
          <small>{exercise.category}</small>
        </button>
        <button
          type="button"
          className={`session-exercise-picker-favorite${isFavorite ? ' is-active' : ''}`}
          onClick={() => handleToggleFavorite(exercise.name)}
          aria-label={isFavorite ? `Retirer ${exercise.name} des favoris` : `Ajouter ${exercise.name} aux favoris`}
          title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          ★
        </button>
      </div>
    );
  };

  return (
    <>
      <button
        type="button"
        className="button ghost session-exercise-picker-trigger"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
      >
        {buttonLabel}
      </button>

      {isOpen ? (
        <div className="session-exercise-picker-overlay" role="dialog" aria-modal="true">
          <div className="session-exercise-picker-modal">
            <div className="session-exercise-picker-header">
              <div>
                <span className="section-kicker">Banque d'exercices</span>
                <h3>Choisir un exercice</h3>
              </div>
              <button type="button" className="button ghost" onClick={() => setIsOpen(false)}>
                Fermer
              </button>
            </div>

            <div className="session-exercise-picker-controls">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher un exercice"
              />
              <select
                value={selectedCategory}
                onChange={(event) =>
                  setSelectedCategory(event.target.value as ExerciseCategory | 'Toutes')
                }
              >
                <option value="Toutes">Toutes les categories</option>
                {EXERCISE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            {favoriteExerciseItems.length > 0 ? (
              <div className="session-exercise-picker-section">
                <strong>Favoris</strong>
                <div className="session-exercise-picker-list">
                  {favoriteExerciseItems.map(renderExerciseItem)}
                </div>
              </div>
            ) : null}

            {recentExerciseItems.length > 0 ? (
              <div className="session-exercise-picker-section">
                <strong>Recents</strong>
                <div className="session-exercise-picker-list">
                  {recentExerciseItems.map(renderExerciseItem)}
                </div>
              </div>
            ) : null}

            <div className="session-exercise-picker-section">
              <strong>Exercices</strong>
              <div className="session-exercise-picker-list">
                <button
                  type="button"
                  className="session-exercise-picker-item session-exercise-picker-item--custom"
                  onClick={() => setIsOpen(false)}
                >
                  <span>Exercice personnalise</span>
                  <small>Saisie libre</small>
                </button>

                {filteredExerciseItems.length === 0 ? (
                  <div className="challenge-state challenge-state--compact">
                    <p>Aucun exercice trouve.</p>
                  </div>
                ) : (
                  filteredExerciseItems.map(renderExerciseItem)
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
