const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_MATCHING_REPORT = path.resolve(
  process.cwd(),
  'tmp/exercise-image-matching-live.json'
);
const DEFAULT_REPORT_OUTPUT = path.resolve(
  process.cwd(),
  'tmp/exercise-images-import-report.json'
);
const EXERCISE_IMAGE_BUCKET = 'exercise-images';
const ALLOWED_REVIEW_SLUGS = new Set([
  'etirement-ischios',
  'fentes-alternees',
  'mollets',
  'mollets-debout',
  'mountain-climbers-controles',
  'rowing-assis',
  'rowing-tirage-horizontal',
]);

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    matchingReport: DEFAULT_MATCHING_REPORT,
    reportOut: DEFAULT_REPORT_OUTPUT,
    exerciseExport: null,
    datasetRoot: path.resolve(process.cwd(), 'exercise-dataset-main'),
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
    if (arg === '--matching-report') {
      args.matchingReport = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--report-out') {
      args.reportOut = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--exercise-export') {
      args.exerciseExport = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--dataset-root') {
      args.datasetRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return args;
}

function parseCsv(text) {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      row.push(current);
      current = '';
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    return [];
  }

  const [headers, ...dataRows] = rows;

  return dataRows.map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[String(header).trim()] = values[index] ?? '';
    });
    return record;
  });
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

function ensureDirectory(filePath) {
  return fsp.mkdir(path.dirname(filePath), { recursive: true });
}

function normalizePathForStorage(value) {
  return value.replace(/^\/+/, '').replace(/^exercise-images\//i, '');
}

function parseExistingImagePath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
    return null;
  }
  return normalizePathForStorage(trimmed);
}

function shouldImportRow(row) {
  if (row.match_type === 'EXACT' || row.match_type === 'STRONG') {
    return true;
  }

  return row.match_type === 'REVIEW' && ALLOWED_REVIEW_SLUGS.has(row.actyv_slug);
}

function choosePrimarySourceImage(row, datasetRoot) {
  const preferred = row.image_2 || row.image_1;
  if (!preferred) {
    return null;
  }

  return path.resolve(datasetRoot, preferred);
}

async function objectExists(storageClient, objectPath) {
  const { data, error } = await storageClient.download(objectPath);
  if (error || !data) {
    return false;
  }

  if (typeof data.arrayBuffer === 'function') {
    await data.arrayBuffer();
  }

  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.exerciseExport) {
    throw new Error(
      'Missing required --exercise-export <path-to-exercise-library-export.csv> argument.'
    );
  }

  loadLocalEnv();

  const matchingReportRaw = await fsp.readFile(args.matchingReport, 'utf8');
  const matchingReport = JSON.parse(matchingReportRaw);
  const reportRows = Array.isArray(matchingReport)
    ? matchingReport
    : Array.isArray(matchingReport.reportRows)
      ? matchingReport.reportRows
      : [];

  const exerciseExportRaw = await fsp.readFile(args.exerciseExport, 'utf8');
  const exerciseRows = parseCsv(exerciseExportRaw);
  const exerciseById = new Map(exerciseRows.map((row) => [row.id, row]));

  const selectedRows = reportRows.filter(shouldImportRow);

  const summary = {
    selected: selectedRows.length,
    exact: selectedRows.filter((row) => row.match_type === 'EXACT').length,
    strong: selectedRows.filter((row) => row.match_type === 'STRONG').length,
    validatedReview: selectedRows.filter((row) => row.match_type === 'REVIEW').length,
    ready: 0,
    skipped: 0,
    failed: 0,
    uploaded: 0,
    dryRun: args.dryRun,
  };

  let supabaseAdmin = null;
  let storageClient = null;

  if (!args.dryRun) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for a real import.'
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    storageClient = supabaseAdmin.storage.from(EXERCISE_IMAGE_BUCKET);
  }

  const dryRunCanCheckStorage =
    args.dryRun &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (dryRunCanCheckStorage) {
    const { createClient } = await import('@supabase/supabase-js');
    supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    storageClient = supabaseAdmin.storage.from(EXERCISE_IMAGE_BUCKET);
  }

  const results = [];

  for (const row of selectedRows) {
    const exercise = exerciseById.get(row.actyv_id);
    const storagePath = `${row.actyv_id}/main.webp`;
    const sourceImage = choosePrimarySourceImage(row, args.datasetRoot);

    const result = {
      actyv_id: row.actyv_id,
      actyv_slug: row.actyv_slug,
      repdb_id: row.repdb_id,
      source_image: sourceImage,
      storage_path: storagePath,
      status: 'ready',
      error: null,
      notes: [],
    };

    if (!exercise) {
      result.status = 'failed';
      result.error = 'Exercise export row not found by id.';
      summary.failed += 1;
      results.push(result);
      continue;
    }

    if (!sourceImage || !fs.existsSync(sourceImage)) {
      result.status = 'failed';
      result.error = 'RepDB source image file missing.';
      summary.failed += 1;
      results.push(result);
      continue;
    }

    const existingImagePath = parseExistingImagePath(exercise.image_path);

    if (!args.force && existingImagePath && existingImagePath !== storagePath) {
      result.status = 'skipped';
      result.notes.push(`Existing image_path preserved: ${existingImagePath}`);
      summary.skipped += 1;
      results.push(result);
      continue;
    }

    if (!args.force && existingImagePath === storagePath && storageClient) {
      const exists = await objectExists(storageClient, storagePath);
      if (exists) {
        result.status = 'skipped';
        result.notes.push('Storage object already exists and image_path is already set.');
        summary.skipped += 1;
        results.push(result);
        continue;
      }
      result.notes.push('image_path exists but storage object was missing; object will be restored.');
    } else if (!args.force && existingImagePath === storagePath) {
      result.status = 'skipped';
      result.notes.push('image_path already set; storage object not verified in dry-run.');
      summary.skipped += 1;
      results.push(result);
      continue;
    }

    if (args.dryRun) {
      summary.ready += 1;
      results.push(result);
      continue;
    }

    try {
      const fileBuffer = await fsp.readFile(sourceImage);
      const uploadResponse = await storageClient.upload(storagePath, fileBuffer, {
        contentType: 'image/webp',
        upsert: Boolean(args.force),
      });

      if (uploadResponse.error) {
        throw new Error(uploadResponse.error.message);
      }

      const updateResponse = await supabaseAdmin
        .from('exercise_library')
        .update({ image_path: storagePath })
        .eq('id', row.actyv_id);

      if (updateResponse.error) {
        throw new Error(updateResponse.error.message);
      }

      result.status = 'uploaded';
      summary.uploaded += 1;
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      summary.failed += 1;
    }

    results.push(result);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    source: {
      exerciseExport: args.exerciseExport,
      matchingReport: args.matchingReport,
      datasetRoot: args.datasetRoot,
    },
    summary,
    results,
  };

  await ensureDirectory(args.reportOut);
  await fsp.writeFile(args.reportOut, JSON.stringify(output, null, 2));

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error('[import-exercise-images] fatal error');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
