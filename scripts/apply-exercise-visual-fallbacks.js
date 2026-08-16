const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const EXERCISE_VISUAL_FALLBACKS = {
  RUNNING: [
    'accelerations-courtes',
    'course-en-cote',
    'course-tapis',
    'echauffement-footing',
    'footing-facile',
    'seuil',
    'tapis-incline',
  ],
  WALKING: [
    'echauffement-marche',
    'echauffement-marche-rapide',
    'marche-active',
    'marche-inclinee-lente',
    'marche-tranquille',
  ],
  MOBILITY: [
    'cercles-d-epaules',
    'echauffement-dynamique',
    'mobilite-dynamique',
    'mobilite-hanches',
    'mobilite-hanches-chevilles-respiration',
    'ouverture-de-hanches',
    'ouverture-thoracique',
    'rotation-du-buste',
    'rotation-thoracique',
  ],
  RECOVERY: [
    'etirements-doux',
    'respiration-calme',
    'respiration-diaphragmatique',
    'retour-au-calme',
    'retour-calme-assis',
  ],
};

const REVIEW_SLUGS = new Set([
  '45min',
  'echauffement',
  'papillon',
  'presse',
  'rowing',
  'seance-cote',
]);

const DEFAULT_REPORT_PATH = path.resolve(process.cwd(), 'tmp/exercise-visual-fallback-report.json');

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    reportOut: DEFAULT_REPORT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--force') {
      args.force = true;
      continue;
    }
    if (arg === '--report-out') {
      args.reportOut = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  loadEnvFile(path.resolve(process.cwd(), '.env'));
  loadEnvFile(path.resolve(process.cwd(), '.env.local'));
}

async function ensureDirectory(filePath) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

function flattenFallbacks() {
  return Object.entries(EXERCISE_VISUAL_FALLBACKS).flatMap(([category, slugs]) =>
    slugs.map((slug) => ({ slug, category }))
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadLocalEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const targets = flattenFallbacks();
  const targetSlugs = targets.map((target) => target.slug);

  if (targetSlugs.some((slug) => REVIEW_SLUGS.has(slug))) {
    throw new Error('A review slug leaked into the fallback target list.');
  }

  const { data: rows, error } = await supabase
    .from('exercise_library')
    .select('id, slug, name, image_path, metadata')
    .in('slug', targetSlugs)
    .order('slug', { ascending: true });

  if (error) {
    throw error;
  }

  const rowsBySlug = new Map((rows || []).map((row) => [row.slug, row]));
  const missingSlugs = targetSlugs.filter((slug) => !rowsBySlug.has(slug));

  if (missingSlugs.length > 0) {
    throw new Error(`Missing exercise_library rows for slugs: ${missingSlugs.join(', ')}`);
  }

  const results = [];

  for (const target of targets) {
    const row = rowsBySlug.get(target.slug);
    const currentMetadata =
      row && row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata
        : {};

    const nextMetadata = {
      ...currentMetadata,
      visual_source_type: 'actyv_category_icon',
      visual_category: target.category,
    };

    const alreadyApplied =
      currentMetadata.visual_source_type === 'actyv_category_icon' &&
      currentMetadata.visual_category === target.category;

    const hasImagePath = typeof row.image_path === 'string' && row.image_path.trim().length > 0;
    const shouldSkipForImage = hasImagePath && !args.force;

    const entry = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: target.category,
      image_path: row.image_path,
      status: 'ready',
      updated: false,
    };

    if (alreadyApplied) {
      entry.status = 'already-applied';
      results.push(entry);
      continue;
    }

    if (shouldSkipForImage) {
      entry.status = 'skipped-has-image';
      results.push(entry);
      continue;
    }

    if (!args.dryRun) {
      const { error: updateError } = await supabase
        .from('exercise_library')
        .update({ metadata: nextMetadata })
        .eq('id', row.id);

      if (updateError) {
        entry.status = 'failed';
        entry.error = updateError.message;
        results.push(entry);
        continue;
      }
    }

    entry.status = args.dryRun ? 'dry-run' : 'updated';
    entry.updated = !args.dryRun;
    results.push(entry);
  }

  const summary = results.reduce(
    (accumulator, entry) => {
      accumulator.total += 1;
      accumulator.byStatus[entry.status] = (accumulator.byStatus[entry.status] || 0) + 1;
      return accumulator;
    },
    { total: 0, byStatus: {} }
  );

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    force: args.force,
    targetCount: targets.length,
    reviewSlugsUntouched: Array.from(REVIEW_SLUGS),
    summary,
    results,
  };

  await ensureDirectory(args.reportOut);
  await fsp.writeFile(args.reportOut, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
