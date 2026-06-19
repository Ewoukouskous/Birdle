'use strict';

const REGION_FR = {
  'north america': 'Amérique du Nord',
  'central america': 'Amérique centrale',
  'south america': 'Amérique du Sud',
  'western europe': 'Europe de l’Ouest',
  'europe': 'Europe',
  'eurasia': 'Eurasie',
  'asia': 'Asie',
  'africa': 'Afrique',
  'australia': 'Australie',
  'oceania': 'Océanie',
};

const DIFFICULTY_FR = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' };
const MODE_FR = { classic: 'Classique', lives: '3 vies', timed: 'Contre-la-montre' };
const MAX_LIVES = 3;
const TIME_LIMIT = 60;

const CORRECT_CLASS =
  'w-full rounded-2xl border-2 border-emerald-500 bg-emerald-500/15 px-4 py-2.5 text-left font-semibold text-emerald-300';
const WRONG_CLASS =
  'w-full rounded-2xl border-2 border-red-500 bg-red-500/15 px-4 py-2.5 text-left font-semibold text-red-300';

const el = {
  regionView: document.getElementById('region-view'),
  modeView: document.getElementById('mode-view'),
  difficultyView: document.getElementById('difficulty-view'),
  gameView: document.getElementById('game-view'),
  regions: document.getElementById('regions'),
  regionError: document.getElementById('region-error'),
  modeSub: document.getElementById('mode-sub'),
  difficultySub: document.getElementById('difficulty-sub'),
  gameLabel: document.getElementById('game-label'),
  back: document.getElementById('back-btn'),
  scoreboard: document.getElementById('scoreboard'),
  streakBox: document.getElementById('streak-box'),
  livesBox: document.getElementById('lives-box'),
  lives: document.getElementById('lives'),
  timerBox: document.getElementById('timer-box'),
  timer: document.getElementById('timer'),
  img: document.getElementById('bird-img'),
  skeleton: document.getElementById('img-skeleton'),
  choices: document.getElementById('choices'),
  feedback: document.getElementById('feedback'),
  next: document.getElementById('next-btn'),
  error: document.getElementById('error'),
  score: document.getElementById('score'),
  streak: document.getElementById('streak'),
};

const state = {
  score: 0, streak: 0, lives: MAX_LIVES, timeLeft: TIME_LIMIT,
  region: '', regionLabel: '', mode: 'classic', difficulty: 'medium',
  view: 'region', question: null, locked: false, gameOver: false,
  tickTimer: null, advanceTimer: null,
};

function frRegion(name) {
  return REGION_FR[String(name).toLowerCase()] || name;
}

function showError(node, msg) {
  if (!msg) { node.classList.add('hidden'); return; }
  node.textContent = msg;
  node.classList.remove('hidden');
}

function showView(view) {
  state.view = view;
  for (const v of ['region', 'mode', 'difficulty', 'game']) {
    const node = el[v + 'View'];
    const active = v === view;
    node.classList.toggle('hidden', !active);
    node.classList.toggle('flex', active);
  }
  el.back.classList.toggle('hidden', view === 'region');
  el.scoreboard.classList.toggle('hidden', view !== 'game');
  el.scoreboard.classList.toggle('flex', view === 'game');
}

function clearTimers() {
  if (state.tickTimer) { clearInterval(state.tickTimer); state.tickTimer = null; }
  if (state.advanceTimer) { clearTimeout(state.advanceTimer); state.advanceTimer = null; }
}

function renderLives() {
  el.lives.textContent = '❤️'.repeat(state.lives) + '🤍'.repeat(MAX_LIVES - state.lives);
}

function renderTimer() {
  el.timer.textContent = state.timeLeft + 's';
  el.timer.classList.toggle('text-red-400', state.timeLeft <= 10);
  el.timer.classList.toggle('text-stone-100', state.timeLeft > 10);
}

function regionButton(label, sub, region, displayLabel) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className =
    'flex items-center justify-between rounded-2xl border border-stone-700 bg-stone-800 px-4 py-3 ' +
    'text-left font-medium text-stone-200 transition hover:border-moss-400 hover:bg-stone-700 ' +
    'focus:outline-none focus:ring-2 focus:ring-moss-400';
  const count = sub ? `<span class="ml-3 shrink-0 text-xs text-stone-500">${sub}</span>` : '';
  btn.innerHTML = `<span>${label}</span>${count}`;
  btn.addEventListener('click', () => chooseRegion(region, displayLabel));
  return btn;
}

async function loadRegions() {
  showError(el.regionError, null);
  el.regions.innerHTML = '';
  try {
    const res = await fetch('/api/regions');
    if (!res.ok) throw new Error('Réponse ' + res.status);
    const data = await res.json();
    el.regions.appendChild(
      regionButton('🌍 Toutes les régions', `${data.total} oiseaux`, 'all', 'Toutes les régions'),
    );
    data.regions.forEach((r) => {
      const label = frRegion(r.name);
      el.regions.appendChild(regionButton(label, `${r.count} oiseaux`, r.name, label));
    });
  } catch (err) {
    showError(el.regionError, 'Impossible de charger les régions. Vérifie que le serveur tourne.');
  }
}

function chooseRegion(region, displayLabel) {
  state.region = region;
  state.regionLabel = displayLabel;
  el.modeSub.textContent = `Région : ${displayLabel}`;
  showView('mode');
}

function chooseMode(mode) {
  state.mode = mode;
  el.difficultySub.textContent = `${state.regionLabel} · ${MODE_FR[mode]}`;
  showView('difficulty');
}

function chooseDifficulty(difficulty) {
  state.difficulty = difficulty;
  el.gameLabel.textContent = `(${state.regionLabel} · ${MODE_FR[state.mode]} · ${DIFFICULTY_FR[difficulty]})`;
  el.streakBox.classList.toggle('hidden', state.mode !== 'classic');
  el.livesBox.classList.toggle('hidden', state.mode !== 'lives');
  el.timerBox.classList.toggle('hidden', state.mode !== 'timed');
  showView('game');
  startRound();
}

function startRound() {
  clearTimers();
  state.score = 0;
  state.streak = 0;
  state.lives = MAX_LIVES;
  state.timeLeft = TIME_LIMIT;
  state.gameOver = false;
  el.score.textContent = '0';
  el.streak.textContent = '0';
  renderLives();
  renderTimer();
  if (state.mode === 'timed') {
    state.tickTimer = setInterval(tick, 1000);
  }
  loadQuestion();
}

function tick() {
  state.timeLeft -= 1;
  renderTimer();
  if (state.timeLeft <= 0) endTimed();
}

function endTimed() {
  clearTimers();
  state.gameOver = true;
  if (!state.locked) {
    state.locked = true;
    const buttons = [...el.choices.querySelectorAll('button')];
    buttons.forEach((b) => { b.disabled = true; b.classList.add('cursor-default'); });
    if (state.question && buttons[state.question.answerIndex]) {
      buttons[state.question.answerIndex].className = CORRECT_CLASS;
    }
  }
  el.feedback.innerHTML = `<span class="font-semibold">Temps écoulé !</span> Score : ${state.score}.`;
  el.feedback.className = 'mt-3 rounded-2xl px-4 py-2 text-sm bg-amber-500/15 text-amber-300';
  el.feedback.classList.remove('hidden');
  el.next.textContent = 'Rejouer ↺';
  el.next.classList.remove('hidden');
  el.next.focus();
}

function goBack() {
  if (state.view === 'game') {
    clearTimers();
    showView('difficulty');
  } else if (state.view === 'difficulty') {
    showView('mode');
  } else if (state.view === 'mode') {
    showView('region');
    loadRegions();
  }
}

function onNext() {
  if (state.gameOver) {
    startRound();
  } else {
    loadQuestion();
  }
}

function makeButton(option, index) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.index = String(index);
  const sci = option.sci
    ? `<span class="mt-0.5 block text-xs font-normal italic text-stone-400">${option.sci}</span>`
    : '';
  btn.innerHTML = `<span class="block leading-tight">${option.name}</span>${sci}`;
  btn.className =
    'w-full rounded-2xl border border-stone-700 bg-stone-800 px-4 py-2.5 text-left font-medium ' +
    'text-stone-200 transition hover:border-moss-400 hover:bg-stone-700 ' +
    'focus:outline-none focus:ring-2 focus:ring-moss-400';
  btn.addEventListener('click', () => onAnswer(index));
  return btn;
}

async function loadQuestion() {
  showError(el.error, null);
  el.feedback.classList.add('hidden');
  el.next.classList.add('hidden');
  el.next.textContent = 'Oiseau suivant →';
  el.choices.innerHTML = '';
  el.img.classList.add('opacity-0');
  el.skeleton.classList.remove('hidden');
  state.locked = false;

  try {
    const url = '/api/quiz?region=' + encodeURIComponent(state.region) +
      '&difficulty=' + encodeURIComponent(state.difficulty);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Réponse ' + res.status);
    const q = await res.json();
    state.question = q;

    const tmp = new Image();
    tmp.onload = () => {
      el.img.src = q.image;
      el.img.classList.remove('opacity-0');
      el.skeleton.classList.add('hidden');
    };
    tmp.onerror = () => { el.skeleton.classList.add('hidden'); };
    tmp.src = q.image;

    q.options.forEach((opt, i) => el.choices.appendChild(makeButton(opt, i)));
  } catch (err) {
    showError(el.error, 'Impossible de charger un oiseau. Réessaie.');
    el.skeleton.classList.add('hidden');
  }
}

function onAnswer(index) {
  if (state.locked || !state.question) return;
  state.locked = true;
  const { answerIndex, correct } = state.question;
  const buttons = [...el.choices.querySelectorAll('button')];

  buttons.forEach((b) => { b.disabled = true; b.classList.add('cursor-default'); });
  buttons[answerIndex].className = CORRECT_CLASS;

  const right = index === answerIndex;
  if (right) {
    state.score += 1;
    state.streak += 1;
  } else {
    state.streak = 0;
    if (state.mode === 'lives') {
      state.lives = Math.max(0, state.lives - 1);
      renderLives();
    }
    buttons[index].className = WRONG_CLASS;
  }
  el.score.textContent = state.score;
  el.streak.textContent = state.streak;

  const sci = correct.sciName ? ` <i>${correct.sciName}</i>` : '';
  const lead = right
    ? `<span class="font-semibold">Bravo !</span> C'était bien le <span class="font-semibold">${correct.name}</span>${sci}.`
    : `<span class="font-semibold">Raté.</span> C'était le <span class="font-semibold">${correct.name}</span>${sci}.`;

  el.feedback.className =
    'mt-3 rounded-2xl px-4 py-2 text-sm ' +
    (right ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300');
  el.feedback.classList.remove('hidden');

  if (state.mode === 'lives' && state.lives <= 0) {
    state.gameOver = true;
    el.feedback.innerHTML = `${lead}<br /><span class="font-semibold">Partie terminée !</span> Score final : ${state.score}.`;
    el.next.textContent = 'Rejouer ↺';
    el.next.classList.remove('hidden');
    el.next.focus();
  } else if (state.mode === 'timed') {
    el.feedback.innerHTML = lead;
    state.advanceTimer = setTimeout(() => { if (!state.gameOver) loadQuestion(); }, 800);
  } else {
    el.feedback.innerHTML = lead;
    el.next.classList.remove('hidden');
    el.next.focus();
  }
}

document.querySelectorAll('.mode-btn').forEach((b) => {
  b.addEventListener('click', () => chooseMode(b.dataset.mode));
});
document.querySelectorAll('.diff-btn').forEach((b) => {
  b.addEventListener('click', () => chooseDifficulty(b.dataset.difficulty));
});
el.next.addEventListener('click', onNext);
el.back.addEventListener('click', goBack);
showView('region');
loadRegions();
