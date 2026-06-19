# 🐦 Birdle

Mini-jeu pour apprendre à reconnaître les oiseaux : une photo, quatre noms, devine le bon.
Données et images fournies par l'[API Nuthatch](https://nuthatch.lastelm.software/).

Stack : **Node + Express** (backend proxy) · **HTML + Tailwind + JS vanilla** (frontend) · **Docker**.

---

## ⚠️ Sécurité — à lire en premier

La clé API a été saisie dans une conversation : **considère-la comme compromise**.
1. Régénère une clé sur https://nuthatch.lastelm.software/getKey.html
2. Remplace la valeur dans `.env`

La clé vit **uniquement côté serveur** (fichier `.env`, jamais committé grâce à `.gitignore`).
Le navigateur ne parle qu'à `/api/...` ; il ne voit jamais la clé ni l'URL de Nuthatch.

---

## Démarrage

### En local (Node ≥ 20)

```bash
cp .env.example .env   # puis renseigne NUTHATCH_API_KEY (déjà fait si tu utilises le .env fourni)
npm install
npm start
```

Ouvre http://localhost:3000

### Avec Docker

```bash
docker compose up --build
```

Ouvre http://localhost:3000

---

## Comment ça marche

Au démarrage, le serveur télécharge la liste des oiseaux avec photo, ne garde que ceux
dont la région contient `REGION_FILTER` (par défaut `europe`), puis met le tout en cache
mémoire (rafraîchi toutes les `CACHE_TTL_HOURS`). Chaque appel à `/api/quiz` tire un oiseau
au hasard + 3 leurres, sans recontacter Nuthatch — ça protège ton quota (500 req/h).

Les noms sont affichés **en français** : au chargement du pool, le serveur interroge **Wikidata** (une requête SPARQL groupée par nom scientifique, sans clé) pour récupérer le nom vernaculaire français, mis en cache avec le reste. Le nom scientifique latin est affiché en sous-titre. Si un oiseau n'a pas de nom français connu, on retombe sur l'anglais.

### Endpoints

| Méthode | Route          | Rôle                                            |
|---------|----------------|-------------------------------------------------|
| GET     | `/api/quiz`    | Une question : image, 4 propositions, réponse   |
| GET     | `/api/health`  | État + taille du pool                           |

---

## Configuration (`.env`)

| Variable           | Défaut    | Description                                            |
|--------------------|-----------|--------------------------------------------------------|
| `NUTHATCH_API_KEY` | —         | Ta clé Nuthatch (obligatoire)                          |
| `PORT`             | `3000`    | Port d'écoute                                          |
| `REGION_FILTER`    | `europe`  | Sous-chaîne de région à conserver (insensible casse)   |
| `CACHE_TTL_HOURS`  | `12`      | Durée de vie du cache des oiseaux                      |

Pour ajouter d'autres régions plus tard : `REGION_FILTER=` (vide) garde **tous** les oiseaux,
ou mets `north america`, etc.

---

## Mesures de sécurité en place

- Clé API confinée au backend (proxy), jamais exposée au client.
- `helmet` : en-têtes de sécurité + Content-Security-Policy.
- `express-rate-limit` : 60 req/min/IP sur `/api`.
- Conteneur durci : utilisateur non-root, `read_only`, `no-new-privileges`, `cap_drop: ALL`, limites mémoire/PID.
- `.env` exclu de Git et du contexte Docker.

> Note CSP : Tailwind est chargé via son CDN officiel (`cdn.tailwindcss.com`), ce qui impose
> `'unsafe-eval'` dans `script-src`. Pour une CSP plus stricte en production, remplace le CDN
> par un build Tailwind précompilé servi en statique.

## La suite (idées)

- Plus de régions / familles, niveaux de difficulté.
- Indices (nom scientifique, statut de conservation, déjà renvoyés par l'API).
- Mode chronométré, classement, son du chant de l'oiseau.
