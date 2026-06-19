import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const API_KEY = process.env.NUTHATCH_API_KEY;
const PORT = Number(process.env.PORT) || 3000;
const REGION_FILTER = (process.env.REGION_FILTER || 'europe').toLowerCase().trim();
const CACHE_TTL_MS = (Number(process.env.CACHE_TTL_HOURS) || 12) * 60 * 60 * 1000;
const NUTHATCH_URL = 'https://nuthatch.lastelm.software/v2/birds';
const CHOICES = 4; // nombre de propositions par question

if (!API_KEY) {
  console.error('[birdle] NUTHATCH_API_KEY manquante. Renseigne-la dans .env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Cache des oiseaux (en mémoire) — la clé API ne quitte jamais le serveur.
// ---------------------------------------------------------------------------
let birdPool = [];      // oiseaux filtrés (région + image)
let lastFetch = 0;      // timestamp du dernier chargement réussi
let refreshing = null;  // promesse en cours, évite les chargements concurrents

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
    if (entities.length < pageSize) break; // dernière page
  }
  return out;
}

// Récupère les noms vernaculaires français via Wikidata (P225 = nom de taxon),
// en une requête SPARQL groupée par lots. Aucune clé requise. En cas d'échec,
// on retombera simplement sur le nom anglais.
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

function matchesRegion(bird) {
  if (!REGION_FILTER) return true;
  const regions = Array.isArray(bird.region) ? bird.region : [];
  return regions.some((r) => String(r).toLowerCase().includes(REGION_FILTER));
}

async function refreshPool() {
  const all = await fetchAllBirds();
  const filtered = all.filter(
    (b) => matchesRegion(b) && Array.isArray(b.images) && b.images.length > 0 && b.name,
  );
  // On déduplique par nom pour éviter les doublons dans les propositions.
  const seen = new Set();
  const unique = filtered.filter((b) => {
    if (seen.has(b.name)) return false;
    seen.add(b.name);
    return true;
  });
  if (unique.length < CHOICES) {
    throw new Error(`Pool trop petit (${unique.length}) pour le filtre "${REGION_FILTER}"`);
  }
  const pool = unique.map((b) => ({
    name: b.name,
    sciName: b.sciName || '',
    status: b.status || '',
    region: Array.isArray(b.region) ? b.region : [],
    image: b.images[0],
  }));

  // Traduction française (nom scientifique → nom FR), fallback sur l'anglais.
  const frMap = await fetchFrenchNames(pool.map((b) => b.sciName));
  let translated = 0;
  pool.forEach((b) => {
    const fr = frMap.get(b.sciName);
    b.frName = fr || b.name;
    if (fr) translated++;
  });

  birdPool = pool;
  lastFetch = Date.now();
  console.log(
    `[birdle] Pool chargé : ${birdPool.length} oiseaux (filtre "${REGION_FILTER}"), ` +
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

// Tirage aléatoire de n éléments distincts (Fisher–Yates partiel).
function sample(arr, n) {
  const copy = arr.slice();
  const res = [];
  for (let i = 0; i < n && copy.length; i++) {
    const j = Math.floor(Math.random() * copy.length);
    res.push(copy.splice(j, 1)[0]);
  }
  return res;
}

function buildQuestion() {
  const [correct, ...decoys] = sample(birdPool, CHOICES);
  const options = [correct, ...decoys];
  // Mélange des positions.
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

// ---------------------------------------------------------------------------
// App Express
// ---------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // utile derrière un reverse-proxy / Docker

// En-têtes de sécurité + CSP. Tailwind est chargé via le CDN officiel.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.tailwindcss.com', "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'], // photos d'oiseaux hébergées sur divers CDN
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

// Limite de débit sur l'API (anti-abus + protège le quota Nuthatch).
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Santé
app.get('/api/health', (req, res) => {
  res.json({ ok: true, pool: birdPool.length, lastFetch });
});

// Une question de quiz
app.get('/api/quiz', async (req, res) => {
  try {
    await ensurePool();
    res.set('Cache-Control', 'no-store');
    res.json(buildQuestion());
  } catch (err) {
    console.error('[birdle] /api/quiz', err.message);
    res.status(502).json({ error: 'Impossible de charger les oiseaux pour le moment.' });
  }
});

// Frontend statique
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.listen(PORT, () => {
  console.log(`[birdle] En écoute sur http://localhost:${PORT}`);
  // Préchargement du pool (sans bloquer le démarrage).
  ensurePool().catch((e) => console.error('[birdle] préchargement échoué :', e.message));
});
