const { createServer } = require('node:http');
const { randomInt, randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');
const deck = require('./deck');

const port = Number(process.env.PORT || 3000);
const rooms = new Map();
const lifetime = 6 * 60 * 60 * 1000;
const teamColors = ['mint', 'purple', 'orange', 'pink', 'blue', 'yellow'];
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const assets = new Map([
  ['/', ['text/html', 'index.html']],
  ['/app.js', ['text/javascript', 'app.js']],
  ['/style.css', ['text/css', 'style.css']],
].map(([url, [type, file]]) => [
  url, [type, readFileSync(path.join(__dirname, 'public', file))],
]));

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function check(condition, status, message) {
  if (!condition) throw new RequestError(status, message);
}

function send(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type + '; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function json(res, status, body) {
  send(res, status, 'application/json', JSON.stringify(body));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    check(body.length <= 4096, 413, 'Dit verzoek is te groot.');
  }
  let data;
  try { data = JSON.parse(body); } catch { throw new RequestError(400, 'Ongeldige gegevens.'); }
  check(data && typeof data === 'object' && !Array.isArray(data), 400, 'Ongeldige gegevens.');
  return data;
}

function shuffle(cards) {
  const result = cards.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const other = randomInt(i + 1);
    [result[i], result[other]] = [result[other], result[i]];
  }
  return result;
}

function createRoom(count) {
  check(Number.isInteger(count) && count >= 2 && count <= 6, 400, 'Kies 2 tot 6 teams.');
  check(rooms.size < 500, 503, 'Er zijn te veel actieve lobby’s. Probeer het later opnieuw.');
  let code;
  do {
    code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join('');
  } while (rooms.has(code));
  const room = {
    code, host: randomUUID(), touched: Date.now(), version: 0,
    teams: Array.from({ length: count }, (_, i) => ({
      id: i, color: teamColors[i], tokens: 1, cards: [{ year: 2010 }, { year: 2015 }],
    })),
    players: new Map(), cards: shuffle(deck), phase: 'lobby', round: 0,
  };
  rooms.set(code, room);
  return room;
}

function publish(room) {
  room.version++;
  room.touched = Date.now();
}

function seat(room, data) {
  check(room.phase === 'lobby', 409, 'Dit spel is al begonnen.');
  check(Number.isInteger(data.team) && room.teams[data.team], 400, 'Kies een team.');
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  check(name.length >= 1 && name.length <= 24, 400, 'Vul een naam van 1 tot 24 tekens in.');
  check(room.players.size < 48, 409, 'Deze lobby zit vol.');
  const token = randomUUID();
  room.players.set(token, { name, team: data.team });
  publish(room);
  return token;
}

function startRound(room) {
  room.phase = 'place';
  room.round++;
  room.card = room.cards.pop();
  room.roundTimeline = room.teams[room.turn].cards.slice();
  room.placements = [];
  room.deadline = null;
  room.result = null;
}

function insertionSlot(timeline, year) {
  const slot = timeline.findIndex(card => card.year >= year);
  return slot === -1 ? timeline.length : slot;
}

function resolveRound(room) {
  if (room.phase !== 'challenge' || Date.now() < room.deadline) return;
  const { year, title } = room.card;
  const correctSlot = insertionSlot(room.roundTimeline, year);
  const winner = room.placements.find(placement => placement.slot === correctSlot)?.team ?? null;
  room.result = { correctSlot, winner };
  if (winner !== null) {
    const team = room.teams[winner];
    const awardedSlot = insertionSlot(team.cards, year);
    team.cards.splice(awardedSlot, 0, { year, title });
    room.result.awardedSlot = awardedSlot;
    if (winner !== room.turn) team.tokens++;
  }
  room.phase = 'reveal';
  publish(room);
}

function view(room, token) {
  const you = room.players.get(token);
  const reveal = room.phase === 'reveal';
  return {
    version: room.version, code: room.code, host: room.host === token,
    you, teams: room.teams.map(team => ({
      ...team, players: [...room.players.values()].filter(player => player.team === team.id)
        .map(player => player.name),
    })),
    phase: room.phase, turn: room.turn, round: room.round, total: deck.length,
    roundTimeline: room.roundTimeline, placements: room.placements,
    deadline: room.deadline, now: Date.now(),
    result: room.result,
    card: room.card && {
      clue: room.card.clue, video: room.card.video,
      ...(reveal ? { year: room.card.year, title: room.card.title } : {}),
    },
  };
}

function action(room, token, data) {
  const host = room.host === token;
  const you = room.players.get(token);
  if (data.action === 'start') {
    check(host && room.phase === 'lobby', 409, 'Je kunt het spel nu niet starten.');
    check(room.teams.every(team => [...room.players.values()].some(player => player.team === team.id)),
      409, 'Elk team heeft minstens één speler nodig.');
    room.turn = 0;
    startRound(room);
  } else {
    check(data.round === room.round, 409, 'Deze ronde is voorbij.');
    if (data.action === 'next') {
      check(host && room.phase === 'reveal', 409, 'De volgende ronde is nog niet beschikbaar.');
      if (room.cards.length) {
        room.turn = (room.turn + 1) % room.teams.length;
        startRound(room);
      } else {
        room.phase = 'finished';
      }
    } else {
      const timeline = room.roundTimeline;
      check(Number.isInteger(data.slot) && data.slot >= 0 && data.slot <= timeline?.length,
        400, 'Kies een vakje op de tijdlijn.');
      if (data.action === 'lock') {
        check(you && you.team === room.turn && room.phase === 'place', 409, 'Je team kan nu niet vastzetten.');
        room.placements.push({ team: you.team, slot: data.slot });
        room.phase = 'challenge';
        room.deadline = Date.now() + 7000;
        const timer = setTimeout(() => resolveRound(room), 7000);
        timer.unref();
      } else if (data.action === 'move') {
        check(you && you.team !== room.turn && room.phase === 'challenge' && Date.now() < room.deadline,
          409, 'De herplaatstijd is voorbij of je team is aan de beurt.');
        check(!room.placements.some(placement => placement.team === you.team), 409, 'Je team heeft al herlegd.');
        const team = room.teams[you.team];
        check(team.tokens > 0, 409, 'Je team heeft geen herlegtokens meer.');
        check(!room.placements.some(placement => placement.slot === data.slot), 409, 'Dit vakje is al bezet.');
        team.tokens--;
        room.placements.push({ team: you.team, slot: data.slot });
      } else {
        throw new RequestError(400, 'Onbekende actie.');
      }
    }
  }
  publish(room);
}

setInterval(() => {
  const cutoff = Date.now() - lifetime;
  for (const [code, room] of rooms) if (room.touched < cutoff) rooms.delete(code);
}, 60_000).unref();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const asset = assets.get(url.pathname);
    if (req.method === 'GET' && asset) return send(res, 200, ...asset);
    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const room = createRoom((await readJson(req)).count);
      return json(res, 201, { code: room.code, token: room.host });
    }

    const route = /^\/api\/rooms\/([A-Z2-9]{5})\/(join|state|action|qr|leave)$/.exec(url.pathname);
    check(route, 404, 'Deze pagina bestaat niet.');
    const [, code, endpoint] = route;
    const room = rooms.get(code);
    check(room, 404, 'Deze lobby bestaat niet meer.');
    if (req.method === 'POST' && endpoint === 'join') {
      return json(res, 201, { code, token: seat(room, await readJson(req)) });
    }
    if (req.method === 'GET' && endpoint === 'state' && url.searchParams.get('preview') === '1') {
      return json(res, 200, { phase: room.phase, teams: room.teams.map(({ id, color }) => ({ id, color })) });
    }
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    check(token === room.host || room.players.has(token), 401, 'Je sessie is verlopen.');
    if (req.method === 'POST' && endpoint === 'leave') {
      if (room.phase === 'lobby') {
        if (token === room.host) rooms.delete(code);
        else {
          room.players.delete(token);
          publish(room);
        }
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && endpoint === 'qr' && token === room.host) {
      const joinUrl = new URL(url.searchParams.get('url') || '', 'http://localhost');
      check(['http:', 'https:'].includes(joinUrl.protocol) && joinUrl.searchParams.get('join') === code
        && joinUrl.href.length <= 512, 400, 'Ongeldige uitnodigingslink.');
      const svg = await QRCode.toString(joinUrl.href, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' });
      return send(res, 200, 'image/svg+xml', svg);
    }
    if (req.method === 'POST' && endpoint === 'action') {
      const data = await readJson(req);
      resolveRound(room);
      action(room, token, data);
      return json(res, 200, view(room, token));
    }
    if (req.method === 'GET' && endpoint === 'state') {
      resolveRound(room);
      room.touched = Date.now();
      return json(res, 200, view(room, token));
    }
    throw new RequestError(404, 'Deze pagina bestaat niet.');
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent && !res.destroyed) {
      json(res, error.status || 500, { error: error.status ? error.message : 'Er ging iets mis.' });
    }
  }
});

server.listen(port, '0.0.0.0', () => console.log('Memester luistert op poort ' + server.address().port));
