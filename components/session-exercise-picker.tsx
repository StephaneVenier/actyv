'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  EXERCISE_CATEGORIES,
  EXERCISE_LIBRARY,
  ExerciseCategory,
  ExerciseLibraryItem,
  RECENT_EXERCISES_STORAGE_KEY,
} from '@/lib/exercise-library';

type SessionExercisePickerProps = {
  buttonLabel?: string;
  disabled?: boolean;
  onSelectExercise: (exerciseName: string) => void;
};

function loadRecentExercises() {
  if (typeof window === 'undefined') return [] as string[];

  try {
    const savedValue = window.localStorage.getItem(RECENT_EXERCISES_STORAGE_KEY);
    if (!savedValue) return [];

    const parsedValue = JSON.parse(savedValue);
    return Array.isArray(parsedValue) ? parsedValue.filter(Boolean).slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecentExercise(exerciseName: string) {
  if (typeof window === 'undefined' || !exerciseName.trim()) return;

  const nextRecentExercises = [
    exerciseName.trim(),
    ...loadRecentExercises().filter((value) => value !== exerciseName.trim()),
  ].slice(0, 6);

  window.localStorage.setItem(RECENT_EXERCISES_STORAGE_KEY, JSON.stringify(nextRecentExercises));
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

  useEffect(() => {
    if (!isOpen) return;
    setRecentExercises(loadRecentExercises());
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

  const recentExerciseItems = useMemo(() => {
    const lookup = new Map<string, ExerciseLibraryItem>(
      EXERCISE_LIBRARY.map((exercise) => [exercise.name, exercise])
    );

    return recentExercises
      .map((exerciseName) => lookup.get(exerciseName))
      .filter((exercise): exercise is ExerciseLibraryItem => Boolean(exercise));
  }, [recentExercises]);

  const handleSelectExercise = (exerciseName: string) => {
    onSelectExercise(exerciseName);
    saveRecentExercise(exerciseName);
    setRecentExercises(loadRecentExercises());
    setIsOpen(false);
    setQuery('');
    setSelectedCategory('Toutes');
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
                <span className="section-kicker">Banque fitness</span>
                <h3>Choisir un exercice</h3>
              </div>
              <button
                type="button"
                className="button ghost"
                onClick={() => setIsOpen(false)}
              >
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

            {recentExerciseItems.length > 0 ? (
              <div className="session-exercise-picker-section">
                <strong>Recents</strong>
                <div className="session-exercise-picker-list">
                  {recentExerciseItems.map((exercise) => (
                    <button
                      key={`recent-${exercise.name}`}
                      type="button"
                      className="session-exercise-picker-item"
                      onClick={() => handleSelectExercise(exercise.name)}
                    >
                      <span>{exercise.name}</span>
                      <small>{exercise.category}</small>
                    </button>
                  ))}
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

                {filteredExercises.length === 0 ? (
                  <div className="challenge-state challenge-state--compact">
                    <p>Aucun exercice trouve.</p>
                  </div>
                ) : (
                  filteredExercises.map((exercise) => (
                    <button
                      key={exercise.name}
                      type="button"
                      className="session-exercise-picker-item"
                      onClick={() => handleSelectExercise(exercise.name)}
                    >
                      <span>{exercise.name}</span>
                      <small>{exercise.category}</small>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
