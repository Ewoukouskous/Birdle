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

const el = {
  regionView: document.getElementById('region-view'),
  gameView: document.getElementById('game-view'),
  regions: document.getElementById('regions'),
  regionError: document.getElementById('region-error'),
  regionLabel: document.getElementById('region-label'),
  back: document.getElementById('back-btn'),
  scoreboard: document.getElementById('scoreboard'),
  img: document.getElementById('bird-img'),
  skeleton: document.getElementById('img-skeleton'),
  choices: document.getElementById('choices'),
  feedback: document.getElementById('feedback'),
  next: document.getElementById('next-btn'),
  error: document.getElementById('error'),
  score: document.getElementById('score'),
  streak: document.getElementById('streak'),
};

const state = { score: 0, streak: 0, region: '', question: null, locked: false };

function frRegion(name) {
  return REGION_FR[String(name).toLowerCase()] || name;
}

function showError(node, msg) {
  if (!msg) { node.classList.add('hidden'); return; }
  node.textContent = msg;
  node.classList.remove('hidden');
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
  btn.addEventListener('click', () => startGame(region, displayLabel));
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

function startGame(region, displayLabel) {
  state.region = region;
  state.score = 0;
  state.streak = 0;
  el.score.textContent = '0';
  el.streak.textContent = '0';
  el.regionLabel.textContent = displayLabel ? `(${displayLabel})` : '';
  el.regionView.classList.add('hidden');
  el.regionView.classList.remove('flex');
  el.gameView.classList.remove('hidden');
  el.gameView.classList.add('flex');
  el.back.classList.remove('hidden');
  el.scoreboard.classList.remove('hidden');
  el.scoreboard.classList.add('flex');
  loadQuestion();
}

function backToRegions() {
  el.gameView.classList.add('hidden');
  el.gameView.classList.remove('flex');
  el.regionView.classList.remove('hidden');
  el.regionView.classList.add('flex');
  el.back.classList.add('hidden');
  el.scoreboard.classList.add('hidden');
  el.scoreboard.classList.remove('flex');
  loadRegions();
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
  state.locked = false;
  showError(el.error, null);
  el.feedback.classList.add('hidden');
  el.next.classList.add('hidden');
  el.choices.innerHTML = '';
  el.img.classList.add('opacity-0');
  el.skeleton.classList.remove('hidden');

  try {
    const res = await fetch('/api/quiz?region=' + encodeURIComponent(state.region));
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

  buttons[answerIndex].className =
    'w-full rounded-2xl border-2 border-emerald-500 bg-emerald-500/15 px-4 py-2.5 text-left font-semibold text-emerald-300';

  const right = index === answerIndex;
  if (right) {
    state.score += 1;
    state.streak += 1;
  } else {
    state.streak = 0;
    buttons[index].className =
      'w-full rounded-2xl border-2 border-red-500 bg-red-500/15 px-4 py-2.5 text-left font-semibold text-red-300';
  }
  el.score.textContent = state.score;
  el.streak.textContent = state.streak;

  const sci = correct.sciName ? ` <i>${correct.sciName}</i>` : '';
  el.feedback.innerHTML = right
    ? `<span class="font-semibold">Bravo !</span> C'était bien le <span class="font-semibold">${correct.name}</span>${sci}.`
    : `<span class="font-semibold">Raté.</span> C'était le <span class="font-semibold">${correct.name}</span>${sci}.`;
  el.feedback.className =
    'mt-3 rounded-2xl px-4 py-2 text-sm ' +
    (right ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300');

  el.next.classList.remove('hidden');
  el.next.focus();
}

el.next.addEventListener('click', loadQuestion);
el.back.addEventListener('click', backToRegions);
loadRegions();
