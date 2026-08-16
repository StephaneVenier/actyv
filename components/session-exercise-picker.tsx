'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  EXERCISE_LIBRARY,
  EXERCISE_CATEGORIES,
  ExerciseLibraryItem,
  getExerciseCategories,
  FAVORITE_EXERCISES_STORAGE_KEY,
  RECENT_EXERCISES_STORAGE_KEY,
  searchExercises as searchExerciseLibrary,
} from '@/lib/exercise-library';
import { getExercises } from '@/lib/exercise-library-api';
import { SessionExerciseIcon } from '@/components/session-exercise-icon';

type SessionExercisePickerProps = {
  buttonLabel?: string;
  disabled?: boolean;
  onSelectExercise: (exercise: ExerciseLibraryItem) => void;
};

function getExerciseStorageKey(exercise: Pick<ExerciseLibraryItem, 'slug' | 'name'>) {
  return exercise.slug || exercise.name.trim();
}

function loadStoredExerciseKeys(storageKey: string, limit = 10) {
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

function saveStoredExerciseKeys(storageKey: string, values: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify(values));
}

function saveRecentExercise(exercise: ExerciseLibraryItem) {
  const storageKey = getExerciseStorageKey(exercise);

  if (typeof window === 'undefined' || !storageKey.trim()) return;

  const nextRecentExercises = [
    storageKey.trim(),
    ...loadStoredExerciseKeys(RECENT_EXERCISES_STORAGE_KEY, 10).filter((value) => value !== storageKey.trim()),
  ].slice(0, 10);

  saveStoredExerciseKeys(RECENT_EXERCISES_STORAGE_KEY, nextRecentExercises);
}

function toggleFavoriteExercise(exercise: ExerciseLibraryItem) {
  const storageKey = getExerciseStorageKey(exercise).trim();
  if (typeof window === 'undefined' || !storageKey) return [] as string[];

  const currentFavorites = loadStoredExerciseKeys(FAVORITE_EXERCISES_STORAGE_KEY, 20);
  const nextFavorites = currentFavorites.includes(storageKey)
    ? currentFavorites.filter((value) => value !== storageKey)
    : [storageKey, ...currentFavorites].slice(0, 20);

  saveStoredExerciseKeys(FAVORITE_EXERCISES_STORAGE_KEY, nextFavorites);
  return nextFavorites;
}

function mapStoredExercisesToItems(exerciseKeys: string[], exercises: ExerciseLibraryItem[]) {
  const lookup = new Map<string, ExerciseLibraryItem>(
    exercises.flatMap((exercise) => [
      [exercise.name, exercise] as const,
      [exercise.slug, exercise] as const,
    ])
  );

  return exerciseKeys
    .map((exerciseKey) => lookup.get(exerciseKey))
    .filter((exercise): exercise is ExerciseLibraryItem => Boolean(exercise));
}

function formatExerciseTag(value: string) {
  return value
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getExercisePickerMeta(exercise: ExerciseLibraryItem) {
  const primaryMuscle = exercise.primaryMuscles[0] ? formatExerciseTag(exercise.primaryMuscles[0]) : null;
  const primaryEquipment = exercise.equipment[0] ? formatExerciseTag(exercise.equipment[0]) : null;

  return [primaryMuscle, primaryEquipment, exercise.category].filter(Boolean)[0]
    ? [primaryMuscle, primaryEquipment].filter(Boolean).join(' • ') || exercise.category || 'Sans categorie'
    : 'Sans categorie';
}

export function SessionExercisePicker({
  buttonLabel = 'Choisir un exercice',
  disabled,
  onSelectExercise,
}: SessionExercisePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Toutes');
  const [exercises, setExercises] = useState<ExerciseLibraryItem[]>(EXERCISE_LIBRARY);
  const [recentExercises, setRecentExercises] = useState<string[]>([]);
  const [favoriteExercises, setFavoriteExercises] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;

    const loadExerciseLibrary = async () => {
      const { data } = await getExercises();

      if (!isCancelled && data.length > 0) {
        setExercises(data);
      }
    };

    setRecentExercises(loadStoredExerciseKeys(RECENT_EXERCISES_STORAGE_KEY, 10));
    setFavoriteExercises(loadStoredExerciseKeys(FAVORITE_EXERCISES_STORAGE_KEY, 20));
    void loadExerciseLibrary();

    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  const categories = useMemo(() => {
    const loadedCategories = getExerciseCategories(exercises);
    return loadedCategories.length > 0 ? loadedCategories : EXERCISE_CATEGORIES;
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    return searchExerciseLibrary(exercises, query).filter((exercise) => {
      const matchesCategory =
        selectedCategory === 'Toutes' || exercise.category === selectedCategory;
      return matchesCategory;
    });
  }, [exercises, query, selectedCategory]);

  const favoriteExerciseItems = useMemo(
    () => mapStoredExercisesToItems(favoriteExercises, exercises),
    [exercises, favoriteExercises]
  );

  const recentExerciseItems = useMemo(
    () =>
      mapStoredExercisesToItems(recentExercises, exercises).filter(
        (exercise) => !favoriteExercises.includes(getExerciseStorageKey(exercise))
      ),
    [exercises, favoriteExercises, recentExercises]
  );

  const filteredExerciseItems = useMemo(() => {
    const favoriteSet = new Set(favoriteExercises);

    return [...filteredExercises].sort((left, right) => {
      const leftIsFavorite = favoriteSet.has(getExerciseStorageKey(left));
      const rightIsFavorite = favoriteSet.has(getExerciseStorageKey(right));

      if (leftIsFavorite && !rightIsFavorite) return -1;
      if (!leftIsFavorite && rightIsFavorite) return 1;
      return left.name.localeCompare(right.name, 'fr');
    });
  }, [favoriteExercises, filteredExercises]);

  const handleSelectExercise = (exercise: ExerciseLibraryItem) => {
    onSelectExercise(exercise);
    saveRecentExercise(exercise);
    setRecentExercises(loadStoredExerciseKeys(RECENT_EXERCISES_STORAGE_KEY, 10));
    setIsOpen(false);
    setQuery('');
    setSelectedCategory('Toutes');
  };

  const handleToggleFavorite = (exercise: ExerciseLibraryItem) => {
    setFavoriteExercises(toggleFavoriteExercise(exercise));
  };

  const renderExerciseItem = (exercise: ExerciseLibraryItem) => {
    const storageKey = getExerciseStorageKey(exercise);
    const isFavorite = favoriteExercises.includes(storageKey);

    return (
      <div key={exercise.id ?? exercise.slug} className="session-exercise-picker-item">
        <button
          type="button"
          className="session-exercise-picker-item__select"
          onClick={() => handleSelectExercise(exercise)}
        >
          <span className="session-exercise-picker-item__main">
            <SessionExerciseIcon
              exerciseName={exercise.name}
              exerciseImageUrl={exercise.imageUrl}
              visualCategory={exercise.visualCategory}
              sport={exercise.sport}
              blockType={exercise.trackingType}
              size="md"
            />
            <span className="session-exercise-picker-item__copy">
              <span>{exercise.name}</span>
              <small>{getExercisePickerMeta(exercise)}</small>
            </span>
          </span>
        </button>
        <button
          type="button"
          className={`session-exercise-picker-favorite${isFavorite ? ' is-active' : ''}`}
          onClick={() => handleToggleFavorite(exercise)}
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
                  setSelectedCategory(event.target.value)
                }
              >
                <option value="Toutes">Toutes les categories</option>
                {categories.map((category) => (
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
