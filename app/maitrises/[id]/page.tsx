'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { MasteryVisual } from '@/components/MasteryVisual';
import { addMasteryEntry, loadMasteryDetail } from '@/lib/masteries-api';
import {
  type MasteryDetailData,
  formatMasteryProgressLabel,
  formatMasteryValue,
  getMasteryInfoCopy,
  getMasteryInputHint,
  getMasteryInputLabel,
  getMasteryInputStep,
  getMasteryProgressPercent,
  getMasteryUnitLabel,
  normalizeMasteryNumber,
} from '@/lib/masteries';
import { supabase } from '@/lib/supabase';

function formatRelativeDay(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Recemment';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

function formatEntryValue(value: number, unit: string) {
  return `${formatMasteryValue(value, unit)} ${getMasteryUnitLabel(unit, value)}`;
}

function getEntrySourceLabel(source: string, metadata: Record<string, unknown> | null | undefined) {
  if (source === 'manual') {
    return 'Ajout manuel';
  }

  if (source === 'session') {
    const workoutName = typeof metadata?.workout_name === 'string' ? metadata.workout_name.trim() : '';
    return workoutName ? `Seance Actyv - ${workoutName}` : 'Seance Actyv';
  }

  if (source === 'activity') {
    const activitySport = typeof metadata?.activity_sport === 'string' ? metadata.activity_sport.trim() : '';
    return activitySport ? `Activite Actyv - ${activitySport}` : 'Activite Actyv';
  }

  if (source === 'import') {
    return 'Import';
  }

  return source;
}

export default function MasteryDetailPage() {
  const params = useParams();
  const masteryId = Array.isArray(params?.id) ? params.id[0] : params?.id || '';

  const [currentUserId, setCurrentUserId] = useState('');
  const [detail, setDetail] = useState<MasteryDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entryValueInput, setEntryValueInput] = useState('');
  const [setsCountInput, setSetsCountInput] = useState('');
  const [repsInput, setRepsInput] = useState('');
  const [chargeInput, setChargeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const loadPage = async () => {
      setLoading(true);
      setErrorMessage('');
      setAuthRequired(false);

      try {
        if (!supabase || typeof (supabase as { auth?: { getUser?: unknown } }).auth?.getUser !== 'function') {
          throw new Error('Supabase non configure pour les maitrises.');
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!isCancelled) {
            setAuthRequired(true);
            setDetail(null);
          }
          return;
        }

        if (!isCancelled) {
          setCurrentUserId(user.id);
        }

        const nextDetail = await loadMasteryDetail(user.id, masteryId);

        if (!isCancelled) {
          setDetail(nextDetail);
        }
      } catch (error) {
        console.error('Erreur chargement detail maitrise :', error);

        if (!isCancelled) {
          setErrorMessage(
            'Impossible de charger cette maitrise pour le moment. Verifie que la migration Supabase a bien ete appliquee.'
          );
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    if (masteryId) {
      void loadPage();
    } else {
      setLoading(false);
      setDetail(null);
      setErrorMessage('Identifiant de maitrise manquant.');
    }

    return () => {
      isCancelled = true;
    };
  }, [masteryId]);

  const mastery = detail?.mastery || null;
  const history = detail?.history || [];

  const derivedVolumeValue = useMemo(() => {
    if (!mastery || mastery.measurementType !== 'volume') return 0;

    const setsCount = normalizeMasteryNumber(setsCountInput);
    const reps = normalizeMasteryNumber(repsInput);
    const charge = normalizeMasteryNumber(chargeInput);

    return setsCount * reps * charge;
  }, [chargeInput, mastery, repsInput, setsCountInput]);

  const resetForm = () => {
    setEntryValueInput('');
    setSetsCountInput('');
    setRepsInput('');
    setChargeInput('');
  };

  const loadFreshDetail = async () => {
    if (!currentUserId || !masteryId) return;

    const nextDetail = await loadMasteryDetail(currentUserId, masteryId);
    setDetail(nextDetail);
  };

  const handleSubmitEntry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!mastery) return;

    setSubmitting(true);
    setMessage('');

    try {
      let value = 0;
      let metadata: Record<string, unknown> = {
        measurement_type: mastery.measurementType,
        unit: mastery.unit,
      };

      if (mastery.measurementType === 'volume') {
        const setsCount = normalizeMasteryNumber(setsCountInput);
        const reps = normalizeMasteryNumber(repsInput);
        const charge = normalizeMasteryNumber(chargeInput);

        value = setsCount * reps * charge;
        metadata = {
          ...metadata,
          sets_count: setsCount,
          reps_per_set: reps,
          charge_kg: charge,
        };
      } else {
        value = normalizeMasteryNumber(entryValueInput);
      }

      if (value <= 0) {
        setMessage('Renseigne une valeur valide avant d enregistrer cette performance.');
        setSubmitting(false);
        return;
      }

      const result = await addMasteryEntry({
        masteryId: mastery.dbId,
        value,
        metadata,
      });

      await loadFreshDetail();
      setShowEntryForm(false);
      resetForm();

      const unlockedLevelsLabel =
        result.unlockedLevels.length > 0
          ? ` Niveaux debloques : ${result.unlockedLevels.map((entry) => `N${entry.level}`).join(', ')}.`
          : '';
      const xpLabel = result.xpAwarded > 0 ? ` +${result.xpAwarded} XP.` : '';

      setMessage(`Performance enregistree.${xpLabel}${unlockedLevelsLabel}`);
    } catch (error) {
      console.error('Erreur ajout performance maitrise :', error);
      setMessage('Impossible d enregistrer cette performance pour le moment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authRequired) {
    return (
      <AppShell>
        <div className="masteries-page">
          <section className="card masteries-state-card">
            <strong>Connexion requise</strong>
            <p>Connecte-toi pour suivre tes maitrises, ton historique et tes niveaux.</p>
            <div className="masteries-state-card__actions">
              <Link href="/login" className="button primary">
                Se connecter
              </Link>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell>
        <div className="masteries-page">
          <section className="card masteries-state-card">
            <strong>Chargement</strong>
            <p>Nous recuperons la progression, les seuils et l historique de cette maitrise.</p>
          </section>
        </div>
      </AppShell>
    );
  }

  if (errorMessage) {
    return (
      <AppShell>
        <div className="masteries-page">
          <section className="card masteries-state-card">
            <strong>Chargement indisponible</strong>
            <p>{errorMessage}</p>
            <div className="masteries-state-card__actions">
              <Link href="/maitrises" className="button ghost">
                Retour aux maitrises
              </Link>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  if (!mastery) {
    return (
      <AppShell>
        <div className="masteries-page">
          <section className="card masteries-state-card">
            <strong>Maitrise introuvable</strong>
            <p>Cette maitrise n existe pas encore dans le socle backend actuellement seed.</p>
            <div className="masteries-state-card__actions">
              <Link href="/maitrises" className="button primary">
                Retour aux maitrises
              </Link>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  const progressPercent = getMasteryProgressPercent(mastery);
  const progressLabel = formatMasteryProgressLabel(mastery);
  const remainingUnitLabel = getMasteryUnitLabel(mastery.unit, mastery.remainingValue);

  return (
    <AppShell>
      <div className="masteries-page">
        <section className="card masteries-detail-shell">
          <div className="masteries-detail-shell__topbar">
            <Link href="/maitrises" className="masteries-detail-shell__back" aria-label="Retour aux maitrises">
              &larr;
            </Link>
            <div className="masteries-detail-shell__actions">
              <button type="button" className="masteries-detail-shell__icon-button" aria-label="Favori" disabled>
                &#9734;
              </button>
              <button type="button" className="masteries-detail-shell__icon-button" aria-label="Plus d'options" disabled>
                &#8942;
              </button>
            </div>
          </div>

          <div className="masteries-detail-shell__hero">
            <span className="mastery-detail-shell__icon-wrap">
              <MasteryVisual mastery={mastery} size="hero" className="mastery-detail-shell__exercise-art" />
            </span>
            <div className="masteries-hero-card__copy masteries-hero-card__copy--detail">
              <h1>{mastery.name}</h1>
              <p className="mastery-detail-shell__level">Niveau {mastery.level}</p>
            </div>
          </div>

          <div className="mastery-detail-progress mastery-detail-progress--hero">
            <div className="mastery-detail-progress__top">
              <strong>{progressLabel}</strong>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div className="progress-bar mastery-card__bar" aria-hidden="true">
              <span className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="mastery-detail-progress__hint">
              {mastery.isMaxLevel
                ? 'Niveau maximum atteint.'
                : `Progression actuelle entre le niveau ${mastery.level} et le niveau ${mastery.nextLevel}.`}
            </p>
          </div>

          <div className="card mastery-detail-reward-card">
            <div className="mastery-detail-reward-card__block">
              <span className="mastery-detail-reward-card__icon">&#9733;</span>
              <div>
                <strong>
                  {mastery.isMaxLevel
                    ? 'Niveau maximum atteint'
                    : `Encore ${formatMasteryValue(mastery.remainingValue, mastery.unit)}`}
                </strong>
                <span>
                  {mastery.isMaxLevel
                    ? 'Les prochains paliers seront ajoutes dans une etape suivante.'
                    : `pour atteindre le niveau ${mastery.nextLevel} en ${remainingUnitLabel}`}
                </span>
              </div>
            </div>
            <div className="mastery-detail-reward-card__divider" aria-hidden="true" />
            <div className="mastery-detail-reward-card__block mastery-detail-reward-card__block--reward">
              <span>Prochaine recompense</span>
              <strong>{mastery.isMaxLevel ? 'Bientot plus' : `+${mastery.nextRewardXp} XP`}</strong>
            </div>
          </div>

          <div className="card mastery-detail-stats-card">
            <div className="mastery-detail-stat-row">
              <span className="mastery-detail-stat-row__icon">&Sigma;</span>
              <span>Total realise</span>
              <strong>{formatEntryValue(mastery.totalValue, mastery.unit)}</strong>
            </div>
            <div className="mastery-detail-stat-row">
              <span className="mastery-detail-stat-row__icon">&#9719;</span>
              <span>15 derniers jours</span>
              <strong>{formatEntryValue(mastery.last15DaysValue, mastery.unit)}</strong>
            </div>
            <div className="mastery-detail-stat-row">
              <span className="mastery-detail-stat-row__icon">&#8962;</span>
              <span>Meilleure performance</span>
              <strong>{formatEntryValue(mastery.bestSessionValue, mastery.unit)}</strong>
            </div>
          </div>

          <div className="mastery-detail-action-card">
            <button
              type="button"
              className="button mastery-detail-action-card__button"
              onClick={() => setShowEntryForm((previous) => !previous)}
            >
              <span className="mastery-detail-action-card__plus" aria-hidden="true">
                +
              </span>
              {showEntryForm ? 'Fermer le formulaire' : 'Ajouter une performance'}
            </button>
            <p className="mastery-detail-locked-note">{getMasteryInputHint(mastery)}</p>
          </div>

          {showEntryForm ? (
            <section className="card mastery-entry-form-card">
              <div className="mastery-entry-form-card__header">
                <div>
                  <span className="section-kicker">Ajout manuel</span>
                  <h2>Nouvelle performance</h2>
                </div>
              </div>

              <form className="mastery-entry-form" onSubmit={handleSubmitEntry}>
                {mastery.measurementType === 'volume' ? (
                  <div className="mastery-entry-form__grid">
                    <label className="mastery-entry-field">
                      <span>Series</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={setsCountInput}
                        onChange={(event) => setSetsCountInput(event.target.value)}
                        inputMode="numeric"
                        placeholder="4"
                      />
                    </label>
                    <label className="mastery-entry-field">
                      <span>Repetitions</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={repsInput}
                        onChange={(event) => setRepsInput(event.target.value)}
                        inputMode="numeric"
                        placeholder="10"
                      />
                    </label>
                    <label className="mastery-entry-field">
                      <span>Charge (kg)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={chargeInput}
                        onChange={(event) => setChargeInput(event.target.value)}
                        inputMode="decimal"
                        placeholder="50"
                      />
                    </label>
                    <div className="mastery-entry-field mastery-entry-field--summary">
                      <span>Volume calcule</span>
                      <strong>{formatEntryValue(derivedVolumeValue, mastery.unit)}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="mastery-entry-form__grid mastery-entry-form__grid--single">
                    <label className="mastery-entry-field mastery-entry-field--full">
                      <span>{getMasteryInputLabel(mastery)}</span>
                      <input
                        type="number"
                        min="0"
                        step={getMasteryInputStep(mastery)}
                        value={entryValueInput}
                        onChange={(event) => setEntryValueInput(event.target.value)}
                        inputMode={mastery.unit === 'km' ? 'decimal' : 'numeric'}
                        placeholder={mastery.unit === 'km' ? '5.0' : '20'}
                      />
                    </label>
                  </div>
                )}

                <div className="mastery-entry-form__actions">
                  <button type="submit" className="button primary" disabled={submitting}>
                    {submitting ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => {
                      setShowEntryForm(false);
                      resetForm();
                    }}
                    disabled={submitting}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {message ? (
            <p className={`form-feedback ${message.includes('Impossible') ? 'form-feedback--error' : 'form-feedback--success'}`}>
              {message}
            </p>
          ) : null}

          <section className="card mastery-history-card">
            <div className="mastery-history-card__header">
              <div>
                <span className="section-kicker">Historique</span>
                <h2>Dernieres performances</h2>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="mastery-history-item mastery-history-item--empty">
                <strong>Aucune performance enregistree</strong>
                <span>Commence avec une premiere entree manuelle pour faire progresser cette maitrise.</span>
              </div>
            ) : (
              <div className="mastery-history-list">
                {history.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="mastery-history-item">
                    <div className="mastery-history-item__top">
                      <strong>{formatRelativeDay(entry.performedAt)}</strong>
                      <span>{formatEntryValue(entry.value, mastery.unit)}</span>
                    </div>
                    <small>
                      Source : {getEntrySourceLabel(entry.source, entry.metadata)} -{' '}
                      {new Date(entry.performedAt).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="card mastery-detail-info-card">
            <span className="mastery-detail-info-card__icon" aria-hidden="true">
              i
            </span>
            <p>{getMasteryInfoCopy(mastery)}</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
