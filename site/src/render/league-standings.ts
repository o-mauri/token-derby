import type { SeasonStandings, DivisionStandings, StandingRow } from '@token-derby/shared';

// League standings block: season header + progress bar + a responsive grid of
// per-division cards, shown above the fixtures for a league org. `showSeasonHeader`
// (default true) draws the "Season N · Round X/Y" line + progress bar; the
// end-of-race face suppresses it because it prints its own season/finale header.
export function renderLeagueStandings(
  doc: Document,
  s: SeasonStandings,
  opts: { showSeasonHeader?: boolean } = {},
): HTMLElement {
  const wrap = doc.createElement('div');
  wrap.className = 'org-standings';

  if (opts.showSeasonHeader !== false) {
    const head = doc.createElement('div');
    head.className = 'season-head';
    const line = doc.createElement('div');
    line.className = 'season-line';
    line.textContent = `Season ${s.season} · Round ${s.round}/${s.races_per_season}`;
    head.appendChild(line);
    const prog = doc.createElement('div');
    prog.className = 'season-prog';
    const bar = doc.createElement('i');
    const pct = s.races_per_season > 0 ? Math.max(0, Math.min(100, Math.round((s.round / s.races_per_season) * 100))) : 0;
    bar.style.width = `${pct}%`;
    prog.appendChild(bar);
    head.appendChild(prog);
    wrap.appendChild(head);
  }

  const eyebrow = doc.createElement('div');
  eyebrow.className = 'org-eyebrow';
  eyebrow.textContent = 'Standings';
  wrap.appendChild(eyebrow);

  const grid = doc.createElement('div');
  grid.className = 'div-grid';
  const total = s.divisions.length;
  s.divisions.forEach((d, i) => grid.appendChild(buildDivisionCard(doc, d, i, total)));
  wrap.appendChild(grid);
  return wrap;
}

function buildDivisionCard(doc: Document, d: DivisionStandings, index: number, total: number): HTMLElement {
  const card = doc.createElement('div');
  card.className = `div-card d${(index % 3) + 1}`;

  const h = doc.createElement('div');
  h.className = 'div-card-h';
  const name = doc.createElement('span');
  name.className = 'div-card-name';
  const chip = doc.createElement('span');
  chip.className = 'div-chip';
  chip.textContent = `DIV ${d.division}`;
  name.appendChild(chip);
  const nameText = doc.createElement('span');
  nameText.textContent = d.name;
  name.appendChild(nameText);
  h.appendChild(name);
  const flight = doc.createElement('span');
  flight.className = 'div-flight';
  flight.textContent = total <= 1 ? '' : index === 0 ? 'TOP' : index === total - 1 ? 'BOTTOM' : 'MID';
  h.appendChild(flight);
  card.appendChild(h);

  if (d.rows.length === 0) {
    const empty = doc.createElement('p');
    empty.className = 'div-empty';
    empty.textContent = 'No horses yet';
    card.appendChild(empty);
    return card;
  }

  const table = doc.createElement('table');
  const tbody = doc.createElement('tbody');
  const promoteN = d.rows.filter((r) => r.zone === 'promote').length;
  const relegateN = d.rows.filter((r) => r.zone === 'relegate').length;
  const relegateStart = d.rows.length - relegateN; // index of the first relegation row

  d.rows.forEach((row, i) => {
    if (relegateN > 0 && i === relegateStart) tbody.appendChild(zoneDivider(doc, 'down', '▼ relegation'));
    tbody.appendChild(standingRow(doc, row));
    if (promoteN > 0 && i === promoteN - 1) tbody.appendChild(zoneDivider(doc, 'up', '▲ promotion'));
  });
  table.appendChild(tbody);
  card.appendChild(table);
  return card;
}

function standingRow(doc: Document, row: StandingRow): HTMLElement {
  const tr = doc.createElement('tr');
  if (row.rank === 1) tr.classList.add('lead');
  if (row.zone) tr.classList.add(row.zone); // 'promote' | 'relegate'
  const rank = doc.createElement('td');
  rank.className = 'rank';
  rank.textContent = String(row.rank);
  const nm = doc.createElement('td');
  nm.className = 'nm';
  nm.appendChild(doc.createTextNode(`${row.horse_name} `));
  const small = doc.createElement('small');
  small.textContent = `(${row.user_name})`;
  nm.appendChild(small);
  const pts = doc.createElement('td');
  pts.className = 'pts';
  pts.textContent = String(row.points);
  tr.append(rank, nm, pts);
  return tr;
}

function zoneDivider(doc: Document, dir: 'up' | 'down', label: string): HTMLElement {
  const tr = doc.createElement('tr');
  tr.className = `zone ${dir}`;
  const td = doc.createElement('td');
  td.colSpan = 3;
  td.textContent = label;
  tr.appendChild(td);
  return tr;
}
