'use strict';

const el = {
  img: document.getElementById('bird-img'),
  skeleton: document.getElementById('img-skeleton'),
  choices: document.getElementById('choices'),
  feedback: document.getElementById('feedback'),
  next: document.getElementById('next-btn'),
  error: document.getElementById('error'),
  score: document.getElementById('score'),
  streak: document.getElementById('streak'),
};

const state = { score: 0, streak: 0, question: null, locked: false };

function setError(msg) {
  if (!msg) { el.error.classList.add('hidden'); return; }
  el.error.textContent = msg;
  el.error.classList.remove('hidden');
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
  setError(null);
  el.feedback.classList.add('hidden');
  el.next.classList.add('hidden');
  el.choices.innerHTML = '';
  el.img.classList.add('opacity-0');
  el.skeleton.classList.remove('hidden');

  try {
    const res = await fetch('/api/quiz');
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
    setError("Impossible de charger un oiseau. Vérifie que le serveur tourne, puis réessaie.");
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
loadQuestion();
