import { supabase } from '@/lib/supabase';
import {
  type AddMasteryEntryResult,
  type Mastery,
  type MasteryCategory,
  type MasteryDashboardData,
  type MasteryDetailData,
  type MasteryEntry,
  type MasteryMeasurementType,
  type ProcessSessionMasteriesResult,
  type ProcessedSessionMastery,
  type ProcessActivityMasteriesResult,
  type ProcessedActivityMastery,
  type MasteryProgressSnapshot,
  type MasterySource,
  type MasteryUnlock,
  MASTERY_CATEGORY_FALLBACKS,
  buildMasteryRecordFromProgress,
  getMasteryCategorySummary,
  normalizeMasteryNumber,
} from '@/lib/masteries';

type MasteryCategoryRow = {
  id: string;
  slug: string;
  name: string;
  sort_order: number | null;
  active: boolean | null;
};

type MasteryRow = {
  id: string;
  slug: string;
  name: string;
  category_id: string;
  measurement_type: string;
  unit: string;
  description: string | null;
  active: boolean | null;
  sort_order: number | null;
};

type MasteryEntryRow = {
  id: string;
  user_id: string;
  mastery_id: string;
  value: number;
  source: string;
  source_ref_id: string | null;
  metadata: Record<string, unknown> | null;
  performed_at: string;
  created_at: string;
};

type MasteryUnlockRow = {
  id: string;
  user_id: string;
  mastery_id: string;
  level: number;
  xp_awarded: number;
  unlocked_at: string;
};

type MasteryProgressRow = {
  mastery_id: string;
  slug: string;
  name: string;
  category_id: string;
  measurement_type: string;
  unit: string;
  description: string | null;
  sort_order: number | null;
  total_value: number | string | null;
  current_level: number | string | null;
  current_threshold: number | string | null;
  next_level: number | string | null;
  next_threshold: number | string | null;
  remaining_value: number | string | null;
  progress_percent: number | string | null;
  xp_reward_next_level: number | string | null;
  is_max_level: boolean | null;
};

function ensureSupabaseReady() {
  if (!supabase || typeof (supabase as { from?: unknown }).from !== 'function') {
    throw new Error('Supabase n est pas configure pour les maitrises.');
  }
}

function getFifteenDaysAgoIso() {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - 15);
  return threshold.toISOString();
}

function sortCategories(categories: MasteryCategory[]) {
  const fallbackOrder = new Map(MASTERY_CATEGORY_FALLBACKS.map((category, index) => [category.id, index]));

  return [...categories].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return (fallbackOrder.get(left.id) ?? 99) - (fallbackOrder.get(right.id) ?? 99);
  });
}

function mapEntryRowToModel(row: MasteryEntryRow): MasteryEntry {
  return {
    id: row.id,
    userId: row.user_id,
    masteryId: row.mastery_id,
    value: normalizeMasteryNumber(row.value),
    source: (row.source as MasterySource) || 'manual',
    sourceRefId: row.source_ref_id,
    metadata: row.metadata || {},
    performedAt: row.performed_at,
    createdAt: row.created_at,
  };
}

function mapUnlockRowToModel(row: MasteryUnlockRow): MasteryUnlock {
  return {
    id: row.id,
    userId: row.user_id,
    masteryId: row.mastery_id,
    level: row.level,
    xpAwarded: normalizeMasteryNumber(row.xp_awarded),
    unlockedAt: row.unlocked_at,
  };
}

function readPayloadNumber(payload: Record<string, unknown>, key: string) {
  return normalizeMasteryNumber(payload[key] as string | number | null | undefined);
}

function mapProgressPayloadToSnapshot(payload: Record<string, unknown>): MasteryProgressSnapshot {
  return {
    totalValue: readPayloadNumber(payload, 'total_value'),
    currentLevel: readPayloadNumber(payload, 'current_level'),
    currentThreshold: readPayloadNumber(payload, 'current_threshold'),
    nextLevel: readPayloadNumber(payload, 'next_level'),
    nextThreshold: readPayloadNumber(payload, 'next_threshold'),
    remainingValue: readPayloadNumber(payload, 'remaining_value'),
    progressPercent: readPayloadNumber(payload, 'progress_percent'),
    xpRewardNextLevel: readPayloadNumber(payload, 'xp_reward_next_level'),
    isMaxLevel: Boolean(payload.is_max_level),
  };
}

function mapProgressRowToSnapshot(row: MasteryProgressRow): MasteryProgressSnapshot {
  return {
    totalValue: normalizeMasteryNumber(row.total_value),
    currentLevel: normalizeMasteryNumber(row.current_level),
    currentThreshold: normalizeMasteryNumber(row.current_threshold),
    nextLevel: normalizeMasteryNumber(row.next_level),
    nextThreshold: normalizeMasteryNumber(row.next_threshold),
    remainingValue: normalizeMasteryNumber(row.remaining_value),
    progressPercent: normalizeMasteryNumber(row.progress_percent),
    xpRewardNextLevel: normalizeMasteryNumber(row.xp_reward_next_level),
    isMaxLevel: Boolean(row.is_max_level),
  };
}

async function fetchMasteryCategories() {
  ensureSupabaseReady();
  const categoriesResponse = await supabase
    .from('mastery_categories')
    .select('id, slug, name, sort_order, active')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (categoriesResponse.error) throw categoriesResponse.error;

  return (categoriesResponse.data as MasteryCategoryRow[] | null) || [];
}

function buildCategoriesIndex(categories: MasteryCategoryRow[]) {
  const categoriesByDbId = new Map(
    categories.map((category) => [
      category.id,
      {
        id: category.slug,
        dbId: category.id,
        label: category.name,
        sortOrder: category.sort_order ?? 0,
        active: category.active ?? true,
      } satisfies MasteryCategory,
    ])
  );

  return {
    categoryList: sortCategories([...categoriesByDbId.values()]),
    categoriesByDbId,
  };
}

function buildDashboardFromProgressRows({
  categories,
  masteries,
}: {
  categories: MasteryCategoryRow[];
  masteries: MasteryProgressRow[];
}): MasteryDashboardData {
  const { categoryList, categoriesByDbId } = buildCategoriesIndex(categories);

  const masteryRecords: Mastery[] = masteries
    .map((mastery) => {
      const category = categoriesByDbId.get(mastery.category_id);
      if (!category) return null;

      return buildMasteryRecordFromProgress({
        dbId: mastery.mastery_id,
        slug: mastery.slug,
        categorySlug: category.id,
        categoryDbId: category.dbId || mastery.category_id,
        name: mastery.name,
        unit: mastery.unit,
        measurementType: mastery.measurement_type as MasteryMeasurementType,
        description: mastery.description,
        progress: mapProgressRowToSnapshot(mastery),
        last15DaysValue: 0,
        bestSessionValue: 0,
      });
    })
    .filter((mastery): mastery is Mastery => Boolean(mastery));

  const masteriesByCategory = Object.fromEntries(
    categoryList.map((category) => [category.id, masteryRecords.filter((mastery) => mastery.categoryId === category.id)])
  );
  const summaries = Object.fromEntries(
    categoryList.map((category) => [category.id, getMasteryCategorySummary(masteriesByCategory[category.id] || [])])
  );

  return {
    categories: categoryList,
    masteries: masteryRecords,
    masteriesByCategory,
    summaries,
  };
}

export async function loadMasteriesDashboard(userId: string): Promise<MasteryDashboardData> {
  void userId;
  ensureSupabaseReady();

  const [categories, progressResponse] = await Promise.all([
    fetchMasteryCategories(),
    supabase.rpc('get_my_masteries_progress'),
  ]);

  if (progressResponse.error) throw progressResponse.error;

  return buildDashboardFromProgressRows({
    categories,
    masteries: (progressResponse.data as MasteryProgressRow[] | null) || [],
  });
}

export async function loadMasteryDetail(userId: string, masterySlug: string): Promise<MasteryDetailData | null> {
  ensureSupabaseReady();

  const [categories, masteryResponse] = await Promise.all([
    fetchMasteryCategories(),
    supabase
      .from('masteries')
      .select('id, slug, name, category_id, measurement_type, unit, description, active, sort_order')
      .eq('slug', masterySlug)
      .eq('active', true)
      .maybeSingle(),
  ]);

  if (masteryResponse.error) throw masteryResponse.error;

  const targetMastery = (masteryResponse.data as MasteryRow | null) || null;

  if (!targetMastery) {
    return null;
  }

  const [entriesResponse, unlocksResponse, progressResponse] = await Promise.all([
    supabase
      .from('mastery_entries')
      .select('id, user_id, mastery_id, value, source, source_ref_id, metadata, performed_at, created_at')
      .eq('user_id', userId)
      .eq('mastery_id', targetMastery.id)
      .order('performed_at', { ascending: false }),
    supabase
      .from('mastery_level_unlocks')
      .select('id, user_id, mastery_id, level, xp_awarded, unlocked_at')
      .eq('user_id', userId)
      .eq('mastery_id', targetMastery.id)
      .order('level', { ascending: false }),
    supabase.rpc('compute_mastery_progress', { p_mastery_id: targetMastery.id }),
  ]);

  if (entriesResponse.error) throw entriesResponse.error;
  if (unlocksResponse.error) throw unlocksResponse.error;
  if (progressResponse.error) throw progressResponse.error;

  const { categoriesByDbId } = buildCategoriesIndex(categories);
  const category = categoriesByDbId.get(targetMastery.category_id);
  if (!category) return null;

  const entries = (entriesResponse.data as MasteryEntryRow[] | null) || [];
  const fifteenDaysAgoIso = getFifteenDaysAgoIso();
  const last15DaysValue = entries.reduce((sum, entry) => {
    return entry.performed_at >= fifteenDaysAgoIso ? sum + normalizeMasteryNumber(entry.value) : sum;
  }, 0);
  const bestSessionValue = entries.reduce((best, entry) => Math.max(best, normalizeMasteryNumber(entry.value)), 0);
  const mastery = buildMasteryRecordFromProgress({
    dbId: targetMastery.id,
    slug: targetMastery.slug,
    categorySlug: category.id,
    categoryDbId: category.dbId || targetMastery.category_id,
    name: targetMastery.name,
    unit: targetMastery.unit,
    measurementType: targetMastery.measurement_type as MasteryMeasurementType,
    description: targetMastery.description,
    progress: mapProgressPayloadToSnapshot((progressResponse.data || {}) as Record<string, unknown>),
    last15DaysValue,
    bestSessionValue,
  });

  if (!mastery) {
    return null;
  }

  return {
    mastery,
    history: entries.map(mapEntryRowToModel),
    recentUnlocks: ((unlocksResponse.data as MasteryUnlockRow[] | null) || []).map(mapUnlockRowToModel),
  };
}

function normalizeRpcResult(data: unknown): AddMasteryEntryResult {
  const payload = (data || {}) as Record<string, unknown>;

  return {
    entryId: String(payload.entry_id || ''),
    masteryId: String(payload.mastery_id || ''),
    totalValue: readPayloadNumber(payload, 'total_value'),
    currentLevel: readPayloadNumber(payload, 'current_level'),
    currentThreshold: readPayloadNumber(payload, 'current_threshold'),
    nextLevel: readPayloadNumber(payload, 'next_level'),
    nextThreshold: readPayloadNumber(payload, 'next_threshold'),
    remainingValue: readPayloadNumber(payload, 'remaining_value'),
    progressPercent: readPayloadNumber(payload, 'progress_percent'),
    xpRewardNextLevel: readPayloadNumber(payload, 'xp_reward_next_level'),
    xpAwarded: readPayloadNumber(payload, 'xp_awarded'),
    insertedValue: readPayloadNumber(payload, 'inserted_value'),
    isMaxLevel: Boolean(payload.is_max_level),
    unlockedLevels: Array.isArray(payload.unlocked_levels)
      ? payload.unlocked_levels.map((entry) => {
          const normalized = (entry || {}) as Record<string, unknown>;
          return {
            level: readPayloadNumber(normalized, 'level'),
            xpReward: readPayloadNumber(normalized, 'xp_reward'),
          };
        })
      : [],
  };
}

function mapProcessedSessionMastery(entry: unknown): ProcessedSessionMastery | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }

  const payload = entry as Record<string, unknown>;
  const unlockedLevels = Array.isArray(payload.unlocked_levels)
    ? payload.unlocked_levels.flatMap((levelEntry) => {
        if (!levelEntry || typeof levelEntry !== 'object' || Array.isArray(levelEntry)) {
          return [];
        }

        const normalized = levelEntry as Record<string, unknown>;
        return [
          {
            level: readPayloadNumber(normalized, 'level'),
            xpReward: readPayloadNumber(normalized, 'xp_reward'),
          },
        ];
      })
    : [];

  return {
    entryId: typeof payload.entry_id === 'string' && payload.entry_id.length > 0 ? payload.entry_id : null,
    masteryId: String(payload.mastery_id || ''),
    masterySlug: String(payload.mastery_slug || ''),
    masteryName: String(payload.mastery_name || ''),
    inserted: Boolean(payload.inserted),
    insertedValue: readPayloadNumber(payload, 'inserted_value'),
    xpAwarded: readPayloadNumber(payload, 'xp_awarded'),
    currentLevel: readPayloadNumber(payload, 'current_level'),
    totalValue: readPayloadNumber(payload, 'total_value'),
    progressPercent: readPayloadNumber(payload, 'progress_percent'),
    unlockedLevels,
    contributingBlocks: Array.isArray(payload.contributing_blocks)
      ? payload.contributing_blocks.filter(
          (block): block is Record<string, unknown> =>
            Boolean(block) && typeof block === 'object' && !Array.isArray(block)
        )
      : [],
  };
}

function normalizeProcessSessionMasteriesResult(data: unknown): ProcessSessionMasteriesResult {
  const payload = (data || {}) as Record<string, unknown>;

  return {
    workoutHistoryId: String(payload.workout_history_id || ''),
    workoutId: typeof payload.workout_id === 'string' && payload.workout_id.length > 0 ? payload.workout_id : null,
    workoutName: String(payload.workout_name || ''),
    candidateMasteriesCount: readPayloadNumber(payload, 'candidate_masteries_count'),
    insertedEntriesCount: readPayloadNumber(payload, 'inserted_entries_count'),
    xpAwardedTotal: readPayloadNumber(payload, 'xp_awarded_total'),
    missingActualSets: Boolean(payload.missing_actual_sets),
    processedMasteries: Array.isArray(payload.processed_masteries)
      ? payload.processed_masteries
          .map(mapProcessedSessionMastery)
          .filter((entry): entry is ProcessedSessionMastery => Boolean(entry))
      : [],
    ignoredBlocks: Array.isArray(payload.ignored_blocks)
      ? payload.ignored_blocks.filter(
          (block): block is Record<string, unknown> =>
            Boolean(block) && typeof block === 'object' && !Array.isArray(block)
        )
      : [],
    incompatibleMappings: Array.isArray(payload.incompatible_mappings)
      ? payload.incompatible_mappings.filter(
          (mapping): mapping is Record<string, unknown> =>
            Boolean(mapping) && typeof mapping === 'object' && !Array.isArray(mapping)
        )
      : [],
  };
}

function mapProcessedActivityMastery(entry: unknown): ProcessedActivityMastery | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }

  const payload = entry as Record<string, unknown>;
  const unlockedLevels = Array.isArray(payload.unlocked_levels)
    ? payload.unlocked_levels.flatMap((levelEntry) => {
        if (!levelEntry || typeof levelEntry !== 'object' || Array.isArray(levelEntry)) {
          return [];
        }

        const normalized = levelEntry as Record<string, unknown>;
        return [
          {
            level: readPayloadNumber(normalized, 'level'),
            xpReward: readPayloadNumber(normalized, 'xp_reward'),
          },
        ];
      })
    : [];

  return {
    entryId: typeof payload.entry_id === 'string' && payload.entry_id.length > 0 ? payload.entry_id : null,
    masteryId: String(payload.mastery_id || ''),
    masterySlug: String(payload.mastery_slug || ''),
    masteryName: String(payload.mastery_name || ''),
    inserted: Boolean(payload.inserted),
    insertedValue: readPayloadNumber(payload, 'inserted_value'),
    xpAwarded: readPayloadNumber(payload, 'xp_awarded'),
    currentLevel: readPayloadNumber(payload, 'current_level'),
    totalValue: readPayloadNumber(payload, 'total_value'),
    progressPercent: readPayloadNumber(payload, 'progress_percent'),
    unlockedLevels,
  };
}

function normalizeProcessActivityMasteriesResult(data: unknown): ProcessActivityMasteriesResult {
  const payload = (data || {}) as Record<string, unknown>;

  return {
    activityId: String(payload.activity_id || ''),
    activitySport: String(payload.activity_sport || ''),
    normalizedSport:
      typeof payload.normalized_sport === 'string' && payload.normalized_sport.length > 0
        ? payload.normalized_sport
        : null,
    candidateMasteriesCount: readPayloadNumber(payload, 'candidate_masteries_count'),
    insertedEntriesCount: readPayloadNumber(payload, 'inserted_entries_count'),
    xpAwardedTotal: readPayloadNumber(payload, 'xp_awarded_total'),
    unsupportedSport: Boolean(payload.unsupported_sport),
    ignoredReason: typeof payload.ignored_reason === 'string' && payload.ignored_reason.length > 0 ? payload.ignored_reason : null,
    processedMasteries: Array.isArray(payload.processed_masteries)
      ? payload.processed_masteries
          .map(mapProcessedActivityMastery)
          .filter((entry): entry is ProcessedActivityMastery => Boolean(entry))
      : [],
  };
}

export async function addMasteryEntry({
  masteryId,
  value,
  metadata,
  performedAt,
}: {
  masteryId: string;
  value: number;
  metadata?: Record<string, unknown>;
  performedAt?: string;
}) {
  ensureSupabaseReady();

  const { data, error } = await supabase.rpc('add_mastery_entry', {
    p_mastery_id: masteryId,
    p_value: value,
    p_source: 'manual',
    p_source_ref_id: null,
    p_metadata: metadata || {},
    p_performed_at: performedAt || new Date().toISOString(),
  });

  if (error) {
    throw error;
  }

  return normalizeRpcResult(data);
}

export async function processSessionMasteries(workoutHistoryId: string) {
  ensureSupabaseReady();

  const { data, error } = await supabase.rpc('process_workout_masteries', {
    p_workout_history_id: workoutHistoryId,
  });

  if (error) {
    throw error;
  }

  return normalizeProcessSessionMasteriesResult(data);
}

export async function processActivityMasteries(activityId: string) {
  ensureSupabaseReady();

  const { data, error } = await supabase.rpc('process_activity_masteries', {
    p_activity_id: activityId,
  });

  if (error) {
    throw error;
  }

  return normalizeProcessActivityMasteriesResult(data);
}
