import { supabase } from '@/lib/supabase';
import {
  type AddMasteryEntryResult,
  type Mastery,
  type MasteryCategory,
  type MasteryDashboardData,
  type MasteryDetailData,
  type MasteryEntry,
  type MasteryLevel,
  type MasteryMeasurementType,
  type MasterySource,
  type MasteryUnlock,
  MASTERY_CATEGORY_FALLBACKS,
  buildMasteryRecord,
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

type MasteryLevelRow = {
  mastery_id: string;
  level: number;
  threshold: number;
  xp_reward: number;
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

async function fetchMasteryBaseData() {
  ensureSupabaseReady();

  const [categoriesResponse, masteriesResponse, levelsResponse] = await Promise.all([
    supabase
      .from('mastery_categories')
      .select('id, slug, name, sort_order, active')
      .eq('active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('masteries')
      .select('id, slug, name, category_id, measurement_type, unit, description, active, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('mastery_levels')
      .select('mastery_id, level, threshold, xp_reward')
      .order('mastery_id', { ascending: true })
      .order('level', { ascending: true }),
  ]);

  if (categoriesResponse.error) throw categoriesResponse.error;
  if (masteriesResponse.error) throw masteriesResponse.error;
  if (levelsResponse.error) throw levelsResponse.error;

  return {
    categories: (categoriesResponse.data as MasteryCategoryRow[] | null) || [],
    masteries: (masteriesResponse.data as MasteryRow[] | null) || [],
    levels: (levelsResponse.data as MasteryLevelRow[] | null) || [],
  };
}

function buildDashboardFromRows({
  categories,
  masteries,
  levels,
  entries,
}: {
  categories: MasteryCategoryRow[];
  masteries: MasteryRow[];
  levels: MasteryLevelRow[];
  entries: MasteryEntryRow[];
}): MasteryDashboardData {
  const levelsByMasteryId = new Map<string, MasteryLevel[]>();
  for (const level of levels) {
    const bucket = levelsByMasteryId.get(level.mastery_id) || [];
    bucket.push({
      masteryId: level.mastery_id,
      level: level.level,
      threshold: normalizeMasteryNumber(level.threshold),
      xpReward: normalizeMasteryNumber(level.xp_reward),
    });
    levelsByMasteryId.set(level.mastery_id, bucket);
  }

  const entriesByMasteryId = new Map<string, MasteryEntryRow[]>();
  for (const entry of entries) {
    const bucket = entriesByMasteryId.get(entry.mastery_id) || [];
    bucket.push(entry);
    entriesByMasteryId.set(entry.mastery_id, bucket);
  }

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

  const masteryRecords: Mastery[] = masteries
    .map((mastery) => {
      const category = categoriesByDbId.get(mastery.category_id);
      if (!category) return null;

      const masteryEntries = entriesByMasteryId.get(mastery.id) || [];
      const totalValue = masteryEntries.reduce((sum, entry) => sum + normalizeMasteryNumber(entry.value), 0);
      const fifteenDaysAgoIso = getFifteenDaysAgoIso();
      const last15DaysValue = masteryEntries.reduce((sum, entry) => {
        return entry.performed_at >= fifteenDaysAgoIso ? sum + normalizeMasteryNumber(entry.value) : sum;
      }, 0);
      const bestSessionValue = masteryEntries.reduce(
        (best, entry) => Math.max(best, normalizeMasteryNumber(entry.value)),
        0
      );

      return buildMasteryRecord({
        dbId: mastery.id,
        slug: mastery.slug,
        categorySlug: category.id,
        categoryDbId: category.dbId || mastery.category_id,
        name: mastery.name,
        unit: mastery.unit,
        measurementType: mastery.measurement_type as MasteryMeasurementType,
        description: mastery.description,
        totalValue,
        last15DaysValue,
        bestSessionValue,
        levels: levelsByMasteryId.get(mastery.id) || [],
      });
    })
    .filter((mastery): mastery is Mastery => Boolean(mastery));

  const categoryList = sortCategories([...categoriesByDbId.values()]);
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
  const baseData = await fetchMasteryBaseData();
  const entriesResponse = await supabase
    .from('mastery_entries')
    .select('id, user_id, mastery_id, value, source, source_ref_id, metadata, performed_at, created_at')
    .eq('user_id', userId)
    .order('performed_at', { ascending: false });

  if (entriesResponse.error) {
    throw entriesResponse.error;
  }

  return buildDashboardFromRows({
    ...baseData,
    entries: (entriesResponse.data as MasteryEntryRow[] | null) || [],
  });
}

export async function loadMasteryDetail(userId: string, masterySlug: string): Promise<MasteryDetailData | null> {
  const baseData = await fetchMasteryBaseData();
  const targetMastery = baseData.masteries.find((mastery) => mastery.slug === masterySlug);

  if (!targetMastery) {
    return null;
  }

  const [entriesResponse, unlocksResponse] = await Promise.all([
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
  ]);

  if (entriesResponse.error) throw entriesResponse.error;
  if (unlocksResponse.error) throw unlocksResponse.error;

  const dashboard = buildDashboardFromRows({
    ...baseData,
    entries: (entriesResponse.data as MasteryEntryRow[] | null) || [],
  });
  const mastery = dashboard.masteries.find((entry) => entry.dbId === targetMastery.id) || null;

  if (!mastery) {
    return null;
  }

  return {
    mastery,
    history: ((entriesResponse.data as MasteryEntryRow[] | null) || []).map(mapEntryRowToModel),
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
