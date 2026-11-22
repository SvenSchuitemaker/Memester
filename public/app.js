const root = document.querySelector('#app');
const notice = document.querySelector('#notice');
const leave = document.querySelector('#leave');
const joinParam = new URLSearchParams(location.search).get('join')?.toUpperCase();
let session;
try { session = JSON.parse(sessionStorage.getItem('memester')); } catch { session = null; }
if (joinParam && session?.code !== joinParam) session = null;

let state = null;
let clockOffset = 0;
let selection = null;
let chosenCount = 2;
let preview = null;
let joinCode = joinParam || '';
let pending = false;
let noticeTimer;
let qrUrl;
let qrCode;
let renderedView;
let renderedRound;

function safe(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function tell(message) {
  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 5500);
}

async function request(path, { body, token, timeout = 5000, raw = false } = {}) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: 'Bearer ' + token }),
    },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  if (raw && response.ok) return response.blob();
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status });
  return data;
}

function endpoint(name) {
  return '/api/rooms/' + encodeURIComponent(session.code) + '/' + name;
}

function accept(next) {
  if (state && next.version < state.version) return;
  clockOffset = next.now - Date.now();
  if (!state || state.round !== next.round || state.phase !== next.phase) selection = null;
  const redraw = !state || next.version !== state.version;
  state = next;
  if (redraw) render();
}

function setSession(value) {
  session = value;
  state = null;
  selection = null;
  sessionStorage.setItem('memester', JSON.stringify(value));
  render();
}

async function poll() {
  const current = session;
  if (current) {
    try {
      const next = await request(endpoint('state'), { token: current.token });
      if (current === session) {
        accept(next);
        if (notice.textContent === 'Verbinding verbroken. We proberen opnieuw te verbinden.') notice.hidden = true;
      }
    } catch (error) {
      if (current === session) {
        if (error.status === 401 || error.status === 404) {
          clearSession();
          tell(error.message);
        } else {
          tell('Verbinding verbroken. We proberen opnieuw te verbinden.');
        }
      }
    }
  }
  setTimeout(poll, 280);
}

function clearSession() {
  sessionStorage.removeItem('memester');
  session = null;
  state = null;
  preview = null;
  joinCode = '';
  history.replaceState(null, '', '/');
  render();
}

function teamName(id) {
  return 'Team ' + (id + 1);
}

function home() {
  return `<section class="home">
    <div class="hero">
      <div class="hero-art" aria-hidden="true">
        <span class="art-card art-one">2010</span>
        <span class="art-card art-two">?</span>
        <span class="art-card art-three">2015</span>
      </div>
      <h1>Memester<span>.</span></h1>
      <p>Hoe goed ken jij het internet?<br>Leg memes op de juiste plek in de tijd.</p>
    </div>
    <div class="entry-grid">
      <form class="panel entry" id="host-form">
        <h2>Spel hosten</h2>
        <p>Open de lobby op je laptop.</p>
        <fieldset><legend>Aantal teams</legend><div class="count-options">
        ${[2, 3, 4, 5, 6].map(count => `<label><input type="radio" name="count" value="${count}"
          ${count === chosenCount ? 'checked' : ''}><span>${count}</span></label>`).join('')}
        </div></fieldset>
        <button class="primary" type="submit">Maak lobby <span aria-hidden="true">↗</span></button>
      </form>
      <form class="panel entry" id="code-form">
        <h2>Meespelen</h2>
        <p>Scan de QR-code of vul de lobbycode in.</p>
        <label for="code">Lobbycode</label>
        <input id="code" name="code" value="${safe(joinCode)}" placeholder="ABC23" maxlength="5"
          minlength="5" pattern="[A-Za-z2-9]{5}" autocapitalize="characters" autocomplete="off" required>
        <button class="secondary" type="submit">Ga naar lobby <span aria-hidden="true">→</span></button>
      </form>
    </div>
  </section>`;
}

function joinScreen() {
  return `<section class="panel join-screen">
    <p class="eyebrow">Lobby ${safe(joinCode)}</p>
    <h1>Kies je team.</h1>
    <form id="join-form">
      <label for="player-name">Jouw naam</label>
      <input id="player-name" name="name" maxlength="24" placeholder="Bijv. Sven" autocomplete="nickname" required>
      <fieldset><legend>Team</legend><div class="team-options">
        ${preview.teams.map(({ id, color }) => `<label class="team-${color}">
          <input type="radio" name="team" value="${id}" required><span><i></i>${teamName(id)}</span>
        </label>`).join('')}
      </div></fieldset>
      <button class="primary" type="submit">Doe mee <span aria-hidden="true">→</span></button>
      <button type="button" class="text-button" data-command="back">Andere lobbycode</button>
    </form>
  </section>`;
}

function inviteLink() {
  const url = new URL('/', location.origin);
  url.searchParams.set('join', session.code);
  return url.href;
}

function teamTiles(teams, showScore = false) {
  return `<div class="team-tiles">${teams.map(team => `<article class="team-tile team-${team.color}">
    <h3><i></i>${teamName(team.id)}${showScore ? `<span>${team.cards.length - 2}</span>` : ''}</h3>
    <p>${team.players.length ? team.players.map(safe).join(', ') : 'Wacht op spelers'}</p>
  </article>`).join('')}</div>`;
}

function lobby() {
  const ready = state.teams.every(team => team.players.length);
  return `<section class="stage lobby">
    <div class="stage-title"><p class="eyebrow">Lobby ${state.code}</p>
      <h1>${state.host ? 'Verzamel je teams.' : 'Je zit in de lobby.'}</h1>
      <p>${state.host ? 'Laat spelers de QR-code scannen of de lobbycode invoeren.'
        : 'Je speelt in ' + teamName(state.you.team) + '. De host start zodra iedereen klaar is.'}</p>
    </div>
    <div class="lobby-grid ${state.host ? '' : 'solo'}">
      ${state.host ? `<section class="panel invite">
        <div class="qr">${qrCode === state.code && qrUrl ? `<img src="${qrUrl}" alt="QR-code om mee te doen">` : ''}</div>
        <div><p class="eyebrow">Lobbycode</p><p class="room-code">${state.code}</p>
        <button class="text-button" data-command="copy">Kopieer uitnodigingslink</button></div>
      </section>` : ''}
      <section class="panel roster"><h2>Teams</h2>${teamTiles(state.teams)}
        ${state.host ? `<button class="primary" data-command="start" ${ready ? '' : 'disabled'}>Start spel <span aria-hidden="true">→</span></button>
        ${ready ? '' : '<p class="hint">Elk team heeft minstens één speler nodig.</p>'}` : ''}
      </section>
    </div>
  </section>`;
}

function endScreen() {
  const highest = Math.max(...state.teams.map(team => team.cards.length));
  const winners = state.teams.filter(team => team.cards.length === highest).map(team => teamName(team.id));
  return `<section class="panel join-screen end-screen">
    <p class="eyebrow">Eindstand</p>
    <h1>${winners.length > 1 ? 'Gelijkspel!' : winners[0] + ' wint!'}</h1>
    <p>${winners.length > 1 ? winners.join(' en ') + ' eindigen bovenaan.' : 'Met ' + (highest - 2) + ' verdiende ' + (highest === 3 ? 'kaart.' : 'kaarten.')}</p>
    ${teamTiles([...state.teams].sort((a, b) => b.cards.length - a.cards.length), true)}
    <button class="primary" data-command="back">Terug naar start</button>
  </section>`;
}

function yearCard(card, earned = false) {
  return `<div class="year-card ${earned ? 'earned' : ''}">
    <strong>${card.year}</strong><span>${safe(card.title || 'Startkaart')}</span></div>`;
}

function timeline() {
  const team = state.teams[state.turn];
  const you = state.you && state.teams[state.you.team];
  const cards = state.roundTimeline;
  const reveal = state.phase === 'reveal';
  const challenge = state.phase === 'challenge';
  const canPlace = state.phase === 'place' && you?.id === team.id;
  const hasPlaced = state.placements.some(placement => placement.team === you?.id);
  const canMove = challenge && you && you.id !== team.id && you.tokens > 0 && !hasPlaced;
  const slot = index => {
    const label = index === 0 ? 'Vóór ' + cards[0].year : index === cards.length
      ? 'Na ' + cards[index - 1].year
      : 'Tussen ' + cards[index - 1].year + ' en ' + cards[index].year;
    const placement = state.placements.find(attempt => attempt.slot === index);
    if (placement) {
      const owner = state.teams[placement.team];
      if (reveal && state.result.winner === owner.id && owner.id === team.id) return yearCard(state.card, true);
      const mark = reveal ? (state.result.winner === owner.id ? '✓' : '×') : '?';
      return `<span class="slot placed-card team-${owner.color}" aria-label="${teamName(owner.id)}: ${label}${reveal ? (mark === '✓' ? ', goed' : ', fout') : ''}">
        <strong aria-hidden="true">${mark}</strong><small>${teamName(owner.id)}</small></span>`;
    }
    if (canPlace || canMove) {
      const selected = canPlace && selection === index;
      return `<button class="slot ${selected ? 'active-slot' : ''}" data-slot="${index}" aria-label="${label}"
        aria-pressed="${selected}">${selected ? '?' : '+'}</button>`;
    }
    const correct = reveal && state.result.correctSlot === index;
    return `<span class="slot ${correct ? 'right-slot' : ''}" title="${label}"
      aria-label="${label}${correct ? ', juiste plek' : ''}">${correct ? '✓' : '·'}</span>`;
  };
  let hint = 'Wacht tot ' + teamName(team.id) + ' de kaart vastzet.';
  if (canPlace) hint = 'Kies een vakje. Bij een gelijk jaartal leg je de kaart vóór dat jaar.';
  if (challenge) {
    hint = 'Andere teams kunnen een vrij vakje kiezen.';
    if (canMove) hint = 'Tik op een vrij vakje om één herlegtoken in te zetten.';
    else if (you && you.id !== team.id) {
      hint = hasPlaced ? 'Je team heeft een kaart herlegd.' : 'Je team heeft geen herlegtokens meer.';
    }
  }
  if (reveal) {
    const { winner } = state.result;
    hint = winner === null ? 'Geen team heeft de kaart goed geplaatst.'
      : winner === team.id ? teamName(winner) + ' krijgt de kaart.'
      : teamName(winner) + ' krijgt de kaart en het herlegtoken terug.';
    if (you && hasPlaced && you.id !== team.id && winner !== you.id) hint += ' Je team is het herlegtoken kwijt.';
  }
  return `<section class="panel timeline-panel team-${team.color}">
    <div class="timeline-heading"><div><p class="eyebrow">Tijdlijn</p><h2><i></i>${teamName(team.id)}</h2></div>
      ${challenge ? '<strong id="timer" class="timer" aria-label="Seconden over">7</strong>' : ''}
    </div>
    <p class="hint">${hint}</p>
    ${you ? `<p class="token-count team-${you.color}"><i></i>Herlegtokens van jouw team<strong>${you.tokens}</strong></p>` : ''}
    <div class="timeline" tabindex="0" aria-label="Kaarten en plaatsingsvakjes">
      ${cards.map((card, index) => slot(index) + yearCard(card)).join('')}
      ${slot(cards.length)}
    </div>
    ${canPlace ? `<button class="primary" data-command="lock" ${selection === null ? 'disabled' : ''}>Lock kaart <span aria-hidden="true">→</span></button>` : ''}
    ${reveal && state.host ? `<button class="primary" data-command="next">${state.round === state.total ? 'Bekijk eindstand' : 'Volgende meme'} <span aria-hidden="true">→</span></button>` : ''}
  </section>`;
}

function awardedTimeline() {
  const winner = state.result?.winner;
  if (winner == null || winner === state.turn) return '';
  const team = state.teams[winner];
  return `<section class="panel awarded-timeline team-${team.color}">
    <h2><i></i> Tijdlijn ${teamName(winner)}</h2>
    <div class="timeline" tabindex="0" aria-label="Kaarten van ${teamName(winner)}">
      ${team.cards.map((card, index) => yearCard(card, index === state.result.awardedSlot)).join('')}
    </div>
  </section>`;
}

function game() {
  const reveal = state.phase === 'reveal';
  return `<section class="stage game">
    <div class="stage-title"><p class="eyebrow">Ronde ${state.round} / ${state.total}</p>
      <h1>${state.you?.team === state.turn ? 'Jouw team is aan de beurt.' : teamName(state.turn) + ' is aan de beurt.'}</h1>
    </div>
    <div class="game-grid">
      <section class="panel meme-panel ${reveal ? 'revealed' : ''}">
        <p class="eyebrow">${reveal ? (state.result.winner === null ? 'Verkeerd geplaatst' : 'Goed geplaatst') : 'De meme'}</p>
        <div class="meme-art" role="img" aria-label="Emoji-aanwijzing">${safe(state.card.clue)}</div>
        ${reveal ? `<h2>${safe(state.card.title)}</h2><p class="meme-year">${state.card.year}</p>`
          : state.host && state.card.video ? '<div id="media"><button class="secondary" data-command="video">▶ Speel clip af</button></div>'
          : '<p class="hint">In welk jaar werd deze meme bekend?</p>'}
      </section>
      <div>${timeline()}${reveal ? awardedTimeline() : ''}</div>
    </div>
  </section>`;
}

function render() {
  leave.hidden = !session;
  const activeGame = state && ['place', 'challenge', 'reveal'].includes(state.phase);
  const sameRound = activeGame && renderedView === 'game' && renderedRound === state.round;
  const scroll = sameRound ? root.querySelector('.timeline').scrollLeft : 0;
  if (sameRound && state.phase !== 'reveal') {
    const activeSlot = document.activeElement?.dataset.slot;
    root.querySelector('.timeline-panel').outerHTML = timeline();
    const newTimeline = root.querySelector('.timeline');
    if (activeSlot !== undefined) newTimeline.querySelector('[data-slot="' + activeSlot + '"]')?.focus({ preventScroll: true });
  } else {
    root.innerHTML = session ? (!state ? '<p class="loading">Lobby laden…</p>'
      : activeGame ? game() : state.phase === 'finished' ? endScreen() : lobby())
      : preview ? joinScreen() : home();
  }
  if (sameRound) root.querySelector('.timeline').scrollLeft = scroll;
  renderedView = activeGame ? 'game' : state?.phase;
  renderedRound = state?.round;
  if (state?.host && state.phase === 'lobby' && qrCode !== state.code) loadQr();
  updateTimer();
}

async function loadQr() {
  const current = session;
  qrCode = current.code;
  if (qrUrl) URL.revokeObjectURL(qrUrl);
  qrUrl = null;
  try {
    const image = await request(endpoint('qr') + '?url=' + encodeURIComponent(inviteLink()), {
      token: current.token, raw: true,
    });
    if (current !== session) return;
    qrUrl = URL.createObjectURL(image);
    render();
  } catch {
    if (current === session) tell('De QR-code kon niet laden. Gebruik de lobbycode.');
  }
}

function updateTimer() {
  const timer = document.querySelector('#timer');
  if (!timer) return;
  const seconds = Math.max(0, Math.ceil((state.deadline - Date.now() - clockOffset) / 1000));
  timer.textContent = seconds;
  timer.style.setProperty('--progress', (seconds / 7) * 100 + '%');
}

async function openJoin(code) {
  joinCode = code.toUpperCase();
  preview = await request('/api/rooms/' + encodeURIComponent(joinCode) + '/state?preview=1');
  if (preview.phase !== 'lobby') {
    preview = null;
    throw new Error('Dit spel is al begonnen.');
  }
  render();
  document.querySelector('#player-name')?.focus();
}

async function guarded(callback, button) {
  if (pending) return;
  pending = true;
  if (button) button.disabled = true;
  try { await callback(); } catch (error) { tell(error.message); }
  finally {
    pending = false;
    if (button?.isConnected) button.disabled = false;
  }
}

root.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  guarded(async () => {
    if (form.id === 'code-form') return openJoin(String(data.get('code')).trim());
    if (form.id === 'host-form') {
      chosenCount = Number(data.get('count'));
      return setSession(await request('/api/rooms', { body: { count: chosenCount } }));
    }
    setSession(await request('/api/rooms/' + encodeURIComponent(joinCode) + '/join', {
      body: { name: data.get('name'), team: Number(data.get('team')) },
    }));
  }, event.submitter);
});

function playVideo() {
  const media = document.querySelector('#media');
  const iframe = document.createElement('iframe');
  iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(state.card.video) + '?autoplay=1';
  iframe.title = 'Memeclip';
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
  iframe.allowFullscreen = true;
  media.replaceChildren(iframe);
}

function sendAction(action, slot, button) {
  const current = session;
  return guarded(async () => {
    const next = await request(endpoint('action'), {
      token: current.token, body: { action, round: state.round, slot },
    });
    if (current === session) accept(next);
  }, button);
}

root.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.slot !== undefined) {
    const slot = Number(button.dataset.slot);
    if (state.phase === 'place') {
      selection = slot;
      render();
    } else if (state.phase === 'challenge') {
      sendAction('move', slot, button);
    }
    return;
  }
  const command = button.dataset.command;
  if (command === 'back') clearSession();
  else if (command === 'video') playVideo();
  else if (command === 'copy') {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(inviteLink()).then(() => tell('Uitnodigingslink gekopieerd.'))
        .catch(() => window.prompt('Kopieer de uitnodigingslink', inviteLink()));
    } else window.prompt('Kopieer de uitnodigingslink', inviteLink());
  } else if (['start', 'next', 'lock'].includes(command)) {
    sendAction(command, command === 'lock' ? selection : undefined, button);
  }
});

leave.addEventListener('click', () => {
  if (!confirm('Wil je deze lobby verlaten?')) return;
  guarded(async () => {
    if (state?.phase === 'lobby') {
      await request(endpoint('leave'), { body: {}, token: session.token });
    }
    clearSession();
  }, leave);
});

render();
if (joinParam && !session) openJoin(joinParam).catch(error => tell(error.message));
setInterval(updateTimer, 120);
poll();
