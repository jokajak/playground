/* Lichess public API: recent games for a user, or a single game by link/ID.
   Both endpoints allow cross-origin requests and need no token. */

const API = 'https://lichess.org';

// Accepts a bare 8-char game ID, a 12-char player ID, or any lichess.org game
// URL ("…/abcdEFGH", "…/abcdEFGH/black", "…/abcdEFGHijkl"). Returns
// { id, color } or null. `color` is only known from a /black or /white URL
// or a player ID, and is left null otherwise.
export function parseGameRef(input) {
  const s = input.trim();
  let m = s.match(/^(?:https?:\/\/)?(?:www\.)?lichess\.org\/([A-Za-z0-9]{8})([A-Za-z0-9]{4})?(?:\/(white|black))?\b/);
  if (!m) m = s.match(/^([A-Za-z0-9]{8})([A-Za-z0-9]{4})?$/);
  if (!m) return null;
  const color = m[3] ? m[3][0] : null;
  return { id: m[1], color };
}

async function get(url, accept) {
  let res;
  try {
    res = await fetch(url, { headers: { Accept: accept } });
  } catch {
    throw new Error("Couldn't reach Lichess. Check your connection and try again.");
  }
  if (res.status === 404) throw new Error('Lichess has no such user or game.');
  if (res.status === 429) throw new Error('Lichess is rate-limiting requests. Wait a minute and try again.');
  if (!res.ok) throw new Error('Lichess returned an error (' + res.status + ').');
  return res;
}

const QUERY = 'opening=true&pgnInJson=true&clocks=false&evals=false&literate=false';

// The user's most recent finished standard games, newest first.
export async function fetchUserGames(username, max = 20) {
  const url = `${API}/api/games/user/${encodeURIComponent(username)}?max=${max}&${QUERY}&finished=true`;
  const text = await (await get(url, 'application/x-ndjson')).text();
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter(reviewable);
}

export async function fetchGame(id) {
  const res = await get(`${API}/game/export/${id}?${QUERY}`, 'application/json');
  const game = await res.json();
  if (!reviewable(game)) throw new Error('Only standard chess games can be reviewed (this one is ' + game.variant + ').');
  return game;
}

// chess.js plays standard rules only (from the start or a set-up position).
function reviewable(g) {
  return (g.variant === 'standard' || g.variant === 'fromPosition') && g.moves;
}

export function playerName(side) {
  if (!side) return '?';
  if (side.user) return (side.user.title ? side.user.title + ' ' : '') + side.user.name;
  if (side.aiLevel) return 'Stockfish level ' + side.aiLevel;
  return 'Anonymous';
}

// Which colour `username` played in `game`, or null.
export function colorOf(game, username) {
  const u = (username || '').toLowerCase();
  for (const c of ['white', 'black']) {
    const side = game.players[c];
    if (side && side.user && side.user.id === u) return c[0];
  }
  return null;
}
