/* 0/1 Knapsack Branch-and-Bound visualizer.
   Part 1: algorithm (no DOM).  Part 2: user interface. */

// ---------- Part 1: algorithm ----------
let items = [];          // sorted by profit/weight, highest first
let capacity = 0;
let nodes = [];          // every node ever generated (the tree)
let queue = [];          // live nodes waiting to be explored
let best = 0, bestId = 0, currentId = null, selectedId = 0;
let finished = false, ready = false;
let stats = { generated: 0, explored: 0, pruned: 0 };

const fmt = (x) => Number(x.toFixed(2));

// Sort by ratio so the fractional bound can fill the knapsack greedily.
function prepareItems(weights, profits) {
  return weights
    .map((w, i) => ({ id: i + 1, w, p: profits[i], ratio: profits[i] / w }))
    .sort((a, b) => b.ratio - a.ratio);
}

// Upper bound = node profit + greedy fill of the remaining items,
// taking a fraction of the first item that does not fit.
function computeBound(node) {
  const rows = [];
  if (node.weight > capacity) return { bound: 0, rows, remaining: capacity - node.weight };
  let weight = node.weight, bound = node.profit, j = node.level;
  while (j < items.length) {
    const it = items[j];
    if (weight + it.w <= capacity) {
      weight += it.w; bound += it.p;
      rows.push({ item: it, fraction: 1, gain: it.p, total: bound });
      j++;
    } else {
      const room = capacity - weight;
      if (room > 0) {
        const gain = room * it.p / it.w;
        bound += gain;
        rows.push({ item: it, fraction: room / it.w, room, gain, total: bound });
      }
      break;
    }
  }
  return { bound, rows, remaining: capacity - node.weight };
}

function makeNode(parent, decision) {
  const level = parent ? parent.level + 1 : 0;
  const item = parent ? items[parent.level] : null;
  const node = {
    id: nodes.length, parent: parent ? parent.id : null, children: [], level, decision,
    choices: parent ? [...parent.choices, decision] : [],
    weight: parent ? parent.weight + (decision ? item.w : 0) : 0,
    profit: parent ? parent.profit + (decision ? item.p : 0) : 0,
    bound: 0, status: 'live', reason: ''
  };
  node.bound = computeBound(node).bound;
  nodes.push(node);
  if (parent) parent.children.push(node.id);
  stats.generated++;
  return node;
}

function initAlgorithm(weights, profits, cap) {
  items = prepareItems(weights, profits);
  capacity = cap;
  nodes = []; queue = [];
  best = 0; bestId = 0; currentId = null; selectedId = 0;
  finished = false; ready = true;
  stats = { generated: 0, explored: 0, pruned: 0 };
  queue.push(makeNode(null, null));   // root
}

// One step of best-first Branch-and-Bound. Returns a message describing the step.
function algorithmStep() {
  if (!ready || finished) return '';
  const previous = nodes[currentId];
  if (previous && previous.status === 'active') previous.status = 'explored';

  // 1. Select the most promising live node (highest bound).
  queue.sort((a, b) => b.bound - a.bound || b.level - a.level);
  const node = queue.shift();
  currentId = selectedId = node.id;
  const info = `Node ${node.id} (level ${node.level}, weight ${node.weight}, profit ${node.profit}, bound ${fmt(node.bound)}) selected. `;
  let message;

  if (node.id === bestId && node.bound <= best && node.id !== 0) {
    // This node is the best complete solution so far and nothing above it can beat it.
    node.status = 'active'; stats.explored++;
    message = info + `It is the best solution so far, so there is nothing to branch.`;
  } else if (node.bound <= best) {
    // 2. Prune: even the optimistic bound cannot beat the best profit.
    node.status = 'pruned'; node.reason = 'bound'; stats.pruned++;
    message = info + `Bound ${fmt(node.bound)} <= best profit ${best}, so it is PRUNED.`;
  } else {
    node.status = 'active'; stats.explored++;
    message = info + `Bound ${fmt(node.bound)} > best profit ${best}, so it is promising. `;
    if (node.level < items.length) {
      const item = items[node.level];
      const include = makeNode(node, 1);
      const exclude = makeNode(node, 0);
      if (include.weight > capacity) {
        include.status = 'pruned'; include.reason = 'weight'; include.bound = 0; stats.pruned++;
        message += `Include Item ${item.id} exceeds capacity (pruned). `;
      } else {
        if (include.profit > best) { best = include.profit; bestId = include.id; }
        queue.push(include);
        message += `Include Item ${item.id}: profit ${include.profit}, bound ${fmt(include.bound)}. `;
      }
      queue.push(exclude);
      message += `Exclude Item ${item.id}: bound ${fmt(exclude.bound)}.`;
    }
  }

  if (queue.length === 0) message += ' ' + finishAlgorithm();
  return message;
}

function finishAlgorithm() {
  finished = true;
  nodes.forEach((n) => { if (n.status === 'active') n.status = 'explored'; });
  nodes[bestId].status = 'optimal';
  return 'No live nodes remain: optimal solution found.';
}

function selectedItemsOf(node) {
  return node.choices.map((c, i) => (c ? items[i].id : null)).filter((x) => x !== null).sort((a, b) => a - b);
}

// ---------- Part 2: user interface ----------
const $ = (id) => document.getElementById(id);
let timer = null;

function initUI() {
  $('btn-generate').onclick = generateTree;
  $('btn-next').onclick = () => { if (ensureReady()) { pauseRun(); doStep(); } };
  $('btn-start').onclick = () => { if (ensureReady()) { startRun(); } };
  $('btn-pause').onclick = pauseRun;
  $('btn-resume').onclick = () => { if (ready && !finished) startRun(); };
  $('btn-reset').onclick = resetAll;
  $('btn-example').onclick = useExample;
  $('speed').oninput = () => { if (timer) startRun(); };
  $('tree-svg').addEventListener('click', (e) => {
    const g = e.target.closest('.node');
    if (g) { selectedId = Number(g.dataset.id); renderAll(); }
  });
  resetAll();
}

function showMessages(list) {
  $('message').innerHTML = list.map((m) => `<p class="${m.type}">${m.text}</p>`).join('');
}

// Returns {weights, profits, cap} or null after showing errors.
function readInput() {
  const problems = [], warnings = [];
  const parseList = (text) => text.split(/[\s,]+/).filter((t) => t !== '').map(Number);
  const nText = $('n-input').value.trim(), cText = $('c-input').value.trim();
  const weights = parseList($('w-input').value), profits = parseList($('p-input').value);
  const n = Number(nText), cap = Number(cText);

  if (!nText || !$('w-input').value.trim() || !$('p-input').value.trim() || !cText) problems.push('Fill in every field.');
  else {
    if (!Number.isInteger(n) || n < 1) problems.push('Number of items must be a whole number of at least 1.');
    if (weights.some((x) => !Number.isFinite(x)) || profits.some((x) => !Number.isFinite(x))) problems.push('Weights and profits must be numbers separated by commas.');
    else {
      if (weights.length !== profits.length) problems.push(`You entered ${weights.length} weights but ${profits.length} profits. The counts must match.`);
      else if (Number.isInteger(n) && weights.length !== n) problems.push(`Number of items is ${n} but ${weights.length} weights/profits were entered.`);
      if (weights.some((x) => x < 0)) problems.push('Weights cannot be negative.');
      else if (weights.some((x) => x === 0)) problems.push('Weights must be greater than 0.');
      if (profits.some((x) => x <= 0)) problems.push('Profits must be greater than 0.');
    }
    if (!Number.isFinite(cap)) problems.push('Capacity must be a number.');
    else if (cap < 0) problems.push('Capacity cannot be negative.');
    else if (cap === 0) problems.push('Capacity must be greater than 0.');
  }
  if (n > 30) problems.push('At most 30 items are supported.');
  else if (n > 10) warnings.push('With many items the tree can become very large and slow to draw.');
  if (weights.length && weights.every((w) => w > cap)) warnings.push('No item fits in the knapsack, so the answer will be 0.');

  showMessages([...problems.map((text) => ({ type: 'error', text })), ...warnings.map((text) => ({ type: 'warn', text }))]);
  return problems.length ? null : { weights, profits, cap };
}

function generateTree() {
  pauseRun();
  const input = readInput();
  if (!input) return false;
  initAlgorithm(input.weights, input.profits, input.cap);
  $('step-message').textContent = 'Root created. Press Next Step or Start Algorithm.';
  renderAll();
  return true;
}

function ensureReady() { return ready || generateTree(); }
function doStep() {
  if (finished) return pauseRun();
  $('step-message').textContent = algorithmStep();
  renderAll();
  if (finished) pauseRun();
}
function startRun() {
  clearInterval(timer);
  timer = setInterval(doStep, Number($('speed').value));
  updateButtons();
}
function pauseRun() { clearInterval(timer); timer = null; updateButtons(); }

function resetAll() {
  pauseRun();
  ready = false; finished = false; items = []; nodes = []; queue = [];
  best = 0; bestId = 0; currentId = null; selectedId = 0;
  stats = { generated: 0, explored: 0, pruned: 0 };
  $('step-message').textContent = 'Press Generate Tree to begin.';
  showMessages([]);
  renderAll();
}
function useExample() {
  $('n-input').value = 4; $('w-input').value = '2, 3, 4, 5';
  $('p-input').value = '40, 50, 65, 70'; $('c-input').value = 8;
  resetAll();
}

function updateButtons() {
  const running = timer !== null;
  $('btn-next').disabled = finished;
  $('btn-start').disabled = running || finished;
  $('btn-pause').disabled = !running;
  $('btn-resume').disabled = running || !ready || finished;
}

// ----- rendering -----
function renderAll() {
  renderItems(); renderTree(); renderBound(); renderDetail(); renderQueue(); renderStats(); renderResult(); updateButtons();
}

function renderItems() {
  const shown = ready ? items : [];
  $('item-table').tBodies[0].innerHTML = shown.length
    ? shown.map((it) => `<tr><td>Item ${it.id}</td><td>${it.w}</td><td>${it.p}</td><td>${fmt(it.ratio)}</td></tr>`).join('')
    : '<tr><td colspan="4">Generate the tree to see the sorted items.</td></tr>';
}

// Leaves get consecutive x slots; every parent is centred above its children.
function layoutTree() {
  const pos = {}; let nextSlot = 0;
  (function place(id, depth) {
    const n = nodes[id];
    if (!n.children.length) pos[id] = { x: nextSlot++, y: depth };
    else {
      n.children.forEach((c) => place(c, depth + 1));
      pos[id] = { x: (pos[n.children[0]].x + pos[n.children[n.children.length - 1]].x) / 2, y: depth };
    }
  })(0, 0);
  return pos;
}

function renderTree() {
  const svg = $('tree-svg');
  if (!nodes.length) { svg.setAttribute('width', 300); svg.setAttribute('height', 60); svg.innerHTML = '<text x="12" y="34" fill="#5b6a79">The tree appears here.</text>'; return; }
  const SLOT = 142, ROW = 108, W = 124, H = 62, PAD = 20;
  const pos = layoutTree();
  const maxX = Math.max(...Object.values(pos).map((p) => p.x)), maxY = Math.max(...Object.values(pos).map((p) => p.y));
  const cx = (id) => PAD + pos[id].x * SLOT + W / 2, top = (id) => PAD + pos[id].y * ROW;
  let edges = '', boxes = '';
  nodes.forEach((n) => {
    if (n.parent === null) return;
    const x1 = cx(n.parent), y1 = top(n.parent) + H, x2 = cx(n.id), y2 = top(n.id);
    const label = n.decision ? 'Include (1)' : 'Exclude (0)';
    const anchor = n.decision ? 'end' : 'start';
    edges += `<line class="edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` +
      `<text class="edge-label" x="${(x1 + x2) / 2 + (n.decision ? -4 : 4)}" y="${(y1 + y2) / 2 - 2}" text-anchor="${anchor}">${label}</text>`;
  });
  nodes.forEach((n) => {
    const x = cx(n.id) - W / 2, y = top(n.id);
    const status = n.status.charAt(0).toUpperCase() + n.status.slice(1);
    boxes += `<g class="node ${n.status}${n.id === selectedId ? ' selected' : ''}" data-id="${n.id}">` +
      `<title>Node ${n.id}: ${describeDecisions(n)}</title>` +
      `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="8"/>` +
      `<text x="${x + 8}" y="${y + 16}">Node ${n.id} · Level ${n.level}</text>` +
      `<text x="${x + 8}" y="${y + 31}">W: ${n.weight}  P: ${n.profit}</text>` +
      `<text x="${x + 8}" y="${y + 45}">UB: ${fmt(n.bound)}</text>` +
      `<text x="${x + 8}" y="${y + 58}" font-weight="600">${status}</text></g>`;
  });
  svg.setAttribute('width', PAD * 2 + (maxX + 1) * SLOT);
  svg.setAttribute('height', PAD * 2 + maxY * ROW + H);
  svg.innerHTML = edges + boxes;
  const sel = svg.querySelector('.selected');
  if (sel && currentId === selectedId) { // keep the node being explored in view
    const box = sel.getBoundingClientRect(), area = $('tree-scroll').getBoundingClientRect();
    if (box.left < area.left || box.right > area.right) $('tree-scroll').scrollLeft += box.left - area.left - area.width / 2;
  }
}

function describeDecisions(n) {
  if (!n.choices.length) return 'Root: no items decided yet';
  return n.choices.map((c, i) => `Item ${items[i].id} → ${c ? 'Include' : 'Exclude'}`).join(', ');
}

function renderBound() {
  const el = $('bound-panel');
  if (!nodes.length) { el.textContent = 'No node selected.'; return; }
  const n = nodes[selectedId], calc = computeBound(n);
  let html = `<p>Node ${n.id}: Current Profit = <b>${n.profit}</b>, Current Weight = <b>${n.weight}</b>, Remaining Capacity = <b>${calc.remaining}</b></p>`;
  if (n.weight > capacity) {
    html += `<p>The weight exceeds the capacity, so this branch is infeasible and its bound is 0.</p>`;
  } else {
    html += `<p>Bound = current profit + best possible profit from the remaining capacity (fractional knapsack over items ${n.level + 1} to ${items.length}).</p>`;
    if (!calc.rows.length) html += `<p>No remaining items can be added, so Bound = ${n.profit}.</p>`;
    else {
      html += `<div class="scroll"><table><thead><tr><th>Item</th><th>Weight</th><th>Profit</th><th>Taken</th><th>Gain</th><th>Running bound</th></tr></thead><tbody>` +
        calc.rows.map((r) => `<tr><td>Item ${r.item.id}</td><td>${r.item.w}</td><td>${r.item.p}</td>` +
          `<td>${r.fraction === 1 ? 'whole' : `${r.room}/${r.item.w} (fraction)`}</td><td>+${fmt(r.gain)}</td><td>${fmt(r.total)}</td></tr>`).join('') + '</tbody></table></div>';
    }
    html += `<p class="formula">Bound = ${n.profit}${calc.rows.map((r) => ` + ${fmt(r.gain)}`).join('')} = <b>${fmt(calc.bound)}</b></p>`;
    const verdict = calc.bound <= best ? 'is not greater than' : 'is greater than';
    html += `<p>Compare: bound ${fmt(calc.bound)} ${verdict} the current best profit ${best}. ` +
      (calc.bound <= best ? 'No solution below this node can beat the best, so it can safely be pruned.' : 'A better solution may exist below this node, so it is worth exploring.') + '</p>';
  }
  el.innerHTML = html;
}

function explanationFor(n) {
  if (n.status === 'optimal') return 'This node holds the optimal solution: no other node had a bound high enough to beat its profit.';
  if (n.status === 'pruned') return n.reason === 'weight'
    ? 'This node was pruned because including the item makes the weight exceed the capacity.'
    : 'This node was pruned because its upper bound is less than or equal to the current best profit.';
  if (n.status === 'explored') return 'The node is explored because its upper bound is greater than the current best profit.';
  if (n.status === 'active') return 'This is the node being explored right now: it had the highest bound among live nodes and its bound beat the best profit.';
  return 'This node is live: it is waiting in the priority queue and will be examined when its bound is the highest.';
}

function renderDetail() {
  const el = $('detail-panel');
  if (!nodes.length) { el.textContent = 'Click a node in the tree.'; return; }
  const n = nodes[selectedId];
  el.innerHTML = `<p><b>Node ${n.id} at Level ${n.level}</b></p>` +
    `<p>Decision:<br>${n.choices.length ? n.choices.map((c, i) => `Item ${items[i].id} → ${c ? 'Include' : 'Exclude'}`).join('<br>') : 'Root (no decisions yet)'}</p>` +
    `<p>Weight: ${n.weight}<br>Profit: ${n.profit}<br>Bound: ${fmt(n.bound)}</p>` +
    `<p>Status: <b>${n.status.charAt(0).toUpperCase() + n.status.slice(1)}</b></p><p>Explanation: ${explanationFor(n)}</p>`;
}

function renderQueue() {
  const rows = [];
  const current = nodes[currentId];
  if (current && current.status === 'active') rows.push(current);
  [...queue].sort((a, b) => b.bound - a.bound || b.level - a.level).forEach((n) => rows.push(n));
  $('queue-table').tBodies[0].innerHTML = rows.length
    ? rows.map((n) => `<tr class="${n === current && n.status === 'active' ? 'current' : ''}"><td>Node ${n.id}</td><td>${n.level}</td><td>${n.weight}</td><td>${n.profit}</td><td>${fmt(n.bound)}</td><td>${n.status === 'active' ? 'Active' : 'Live'}</td></tr>`).join('')
    : '<tr><td colspan="6">No live nodes.</td></tr>';
}

function renderStats() {
  const bestNode = nodes[bestId];
  const cards = [
    ['Nodes Generated', stats.generated], ['Nodes Explored', stats.explored], ['Nodes Pruned', stats.pruned],
    ['Current Best Profit', best], ['Current Best Weight', bestNode ? bestNode.weight : 0],
    ['Total Items Selected', bestNode ? selectedItemsOf(bestNode).length : 0]
  ];
  $('stats').innerHTML = cards.map(([label, value]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`).join('');
}

function renderResult() {
  const el = $('result');
  el.hidden = !finished;
  if (!finished) return;
  const n = nodes[bestId], chosen = selectedItemsOf(n);
  el.innerHTML = `<h2>Optimal Solution Found</h2>` +
    `<p><b>Maximum Profit:</b> ${n.profit}<br><b>Total Weight:</b> ${n.weight}<br>` +
    `<b>Selected Items:</b> ${chosen.length ? chosen.map((i) => 'Item ' + i).join(', ') : 'none'}<br>` +
    `<b>Nodes explored:</b> ${stats.explored}<br><b>Nodes pruned:</b> ${stats.pruned}</p>`;
}

if (typeof document !== 'undefined') initUI();
if (typeof module !== 'undefined') {
  module.exports = { initAlgorithm, algorithmStep, get state() { return { best, bestId, nodes, stats, items, finished }; } };
}
