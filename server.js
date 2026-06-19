import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.NUTHATCH_API_KEY;
const PORT = Number(process.env.PORT) || 3000;
const DEFAULT_REGION = (process.env.REGION_FILTER || '').toLowerCase().trim();
const CACHE_TTL_MS = (Number(process.env.CACHE_TTL_HOURS) || 12) * 60 * 60 * 1000;
const NUTHATCH_URL = 'https://nuthatch.lastelm.software/v2/birds';
const CHOICES = 4;

if (!API_KEY) {
  console.error('[birdle] NUTHATCH_API_KEY manquante. Renseigne-la dans .env');
  process.exit(1);
}

let birdPool = [];
let regionList = [];
let lastFetch = 0;
let refreshing = null;

async function fetchAllBirds() {
  const out = [];
  const pageSize = 100;
  for (let page = 1; page <= 50; page++) {
    const url = `${NUTHATCH_URL}?hasImg=true&pageSize=${pageSize}&page=${page}`;
    const res = await fetch(url, { headers: { 'api-key': API_KEY } });
    if (!res.ok) {
      throw new Error(`Nuthatch a répondu ${res.status} (page ${page})`);
    }
    const data = await res.json();
    const entities = Array.isArray(data.entities) ? data.entities : [];
    out.push(...entities);
    if (entities.length < pageSize) break;
  }
  return out;
}

async function fetchFrenchNames(sciNames) {
  const map = new Map();
  const unique = [...new Set(sciNames.filter(Boolean))];
  const CHUNK = 120;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const batch = unique.slice(i, i + CHUNK);
    const values = batch.map((n) => `"${n.replace(/["\\]/g, '\\$&')}"`).join(' ');
    const query =
      `SELECT ?n ?label WHERE { VALUES ?n { ${values} } ` +
      `?taxon wdt:P225 ?n . ?taxon rdfs:label ?label . FILTER(LANG(?label)="fr") }`;
    try {
      const res = await fetch('https://query.wikidata.org/sparql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/sparql-results+json',
          'User-Agent': 'Birdle/0.1 (bird-learning game; https://github.com/)',
        },
        body: 'query=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`Wikidata ${res.status}`);
      const data = await res.json();
      for (const b of data.results.bindings) {
        const sci = b.n.value;
        if (!map.has(sci)) map.set(sci, b.label.value);
      }
    } catch (err) {
      console.error('[birdle] traduction (lot) échouée :', err.message);
    }
  }
  return map;
}

function buildRegionList(pool) {
  const counts = new Map();
  for (const bird of pool) {
    for (const region of bird.region) {
      const label = String(region).trim();
      if (!label) continue;
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= CHOICES)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

async function refreshPool() {
  const all = await fetchAllBirds();
  const filtered = all.filter(
    (b) => Array.isArray(b.images) && b.images.length > 0 && b.name,
  );
  const seen = new Set();
  const unique = filtered.filter((b) => {
    if (seen.has(b.name)) return false;
    seen.add(b.name);
    return true;
  });
  if (unique.length < CHOICES) {
    throw new Error(`Pool trop petit (${unique.length})`);
  }
  const pool = unique.map((b) => ({
    name: b.name,
    sciName: b.sciName || '',
    status: b.status || '',
    region: Array.isArray(b.region) ? b.region : [],
    image: b.images[0],
  }));

  const frMap = await fetchFrenchNames(pool.map((b) => b.sciName));
  let translated = 0;
  pool.forEach((b) => {
    const fr = frMap.get(b.sciName);
    b.frName = fr || b.name;
    if (fr) translated++;
  });

  birdPool = pool;
  regionList = buildRegionList(pool);
  lastFetch = Date.now();
  console.log(
    `[birdle] Pool chargé : ${birdPool.length} oiseaux, ${regionList.length} régions, ` +
    `${translated} traduits en français.`,
  );
}

async function ensurePool() {
  const stale = Date.now() - lastFetch > CACHE_TTL_MS;
  if (birdPool.length > 0 && !stale) return;
  if (!refreshing) {
    refreshing = refreshPool().finally(() => { refreshing = null; });
  }
  await refreshing;
}

function poolForRegion(region) {
  const q = String(region || DEFAULT_REGION).toLowerCase().trim();
  if (!q || q === 'all') return birdPool;
  return birdPool.filter((b) => b.region.some((r) => String(r).toLowerCase().includes(q)));
}

function sample(arr, n) {
  const copy = arr.slice();
  const res = [];
  for (let i = 0; i < n && copy.length; i++) {
    const j = Math.floor(Math.random() * copy.length);
    res.push(copy.splice(j, 1)[0]);
  }
  return res;
}

function buildQuestion(pool) {
  const [correct, ...decoys] = sample(pool, CHOICES);
  const options = [correct, ...decoys];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return {
    image: correct.image,
    options: options.map((o) => ({ name: o.frName, sci: o.sciName })),
    answerIndex: options.indexOf(correct),
    correct: {
      name: correct.frName,
      sciName: correct.sciName,
      status: correct.status,
      region: correct.region,
    },
  };
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.tailwindcss.com', "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(compression());

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, pool: birdPool.length, regions: regionList.length, lastFetch });
});

app.get('/api/regions', async (req, res) => {
  try {
    await ensurePool();
    res.json({ regions: regionList, total: birdPool.length, defaultRegion: DEFAULT_REGION });
  } catch (err) {
    console.error('[birdle] /api/regions', err.message);
    res.status(502).json({ error: 'Impossible de charger les régions pour le moment.' });
  }
});

app.get('/api/quiz', async (req, res) => {
  try {
    await ensurePool();
    const pool = poolForRegion(req.query.region);
    if (pool.length < CHOICES) {
      return res.status(400).json({ error: "Pas assez d'oiseaux dans cette region." });
    }
    res.set('Cache-Control', 'no-store');
    res.json(buildQuestion(pool));
  } catch (err) {
    console.error('[birdle] /api/quiz', err.message);
    res.status(502).json({ error: 'Impossible de charger les oiseaux pour le moment.' });
  }
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.listen(PORT, () => {
  console.log(`[birdle] En écoute sur http://localhost:${PORT}`);
  ensurePool().catch((e) => console.error('[birdle] préchargement échoué :', e.message));
});
