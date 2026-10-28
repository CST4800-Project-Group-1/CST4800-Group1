import {evaluateSocketCompatibility} from './socket-compatibility.js';
const labels = {
  cpu: 'CPU',
  motherboard: 'Motherboard',
  graphics_card: 'Graphics card',
  ram: 'Memory',
  storage: 'Storage',
  power_supply: 'Power supply',
  case: 'Case',
};
const icons = {
  cpu: '▦', motherboard: '▤', graphics_card: '◈', ram: '▥',
  storage: '▣', power_supply: '◉', case: '▱',
};
let parts = [];
let category = 'all';
let build = {};
let isSampleData = true;
const CATALOG_CACHE_KEY = 'buildlab-catalog-cache-v1';
const catalogCategories = Object.keys(labels);
let catalogLoading = false;
let socketCategoriesReady = new Set();
let loadedCategories = 0;

const $ = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
}).format(cents / 100);
const node = (tag, cls, text) => {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text !== undefined) element.textContent = text;
  return element;
};

try {
  const saved = JSON.parse(localStorage.getItem('buildlab-build') || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) build = saved;
} catch {}

function save() {
  try { localStorage.setItem('buildlab-build', JSON.stringify(build)); } catch {}
}

function renderCategories() {
  const nav = $('categories');
  nav.replaceChildren();
  for (const [key, label] of [['all', 'All parts'], ...Object.entries(labels)]) {
    const button = node('button', '', label);
    button.setAttribute('aria-pressed', String(category === key));
    button.onclick = () => {
      category = key;
      renderCategories();
      renderParts();
    };
    nav.append(button);
  }
}

function renderParts() {
  const query = $('search').value.trim().toLowerCase();
  const visible = parts.filter(part =>
    (category === 'all' || part.category === category) &&
    [part.name, part.manufacturer, part.model].join(' ').toLowerCase().includes(query));
  visible.sort((a, b) => $('sort').value === 'low'
    ? a.priceCents - b.priceCents
    : $('sort').value === 'high'
      ? b.priceCents - a.priceCents
      : a.name.localeCompare(b.name));

  $('result-count').textContent = `${visible.length} ${visible.length === 1 ? 'part' : 'parts'}`;
  const grid = $('parts');
  grid.replaceChildren();
  $('status').textContent = visible.length
    ? (catalogLoading ? `Loading live prices (${loadedCategories}/${catalogCategories.length} categories)…` : '')
    : (catalogLoading ? 'Loading catalog…' : 'No parts match your search. Try another name or category.');

  for (const part of visible) {
    const card = node('article', 'card');
    const art = node('div', 'art', icons[part.category] || '▦');
    art.setAttribute('aria-hidden', 'true');
    const body = node('div', 'card-body');
    body.append(
      node('span', 'badge', labels[part.category] || part.category),
      node('h3', '', part.name),
      node('div', 'maker', part.manufacturer || part.source || ''),
    );

    if (part.sourceUrl) {
      const source = node('a', 'source-link', `View at ${part.source || 'retailer'}`);
      source.href = part.sourceUrl;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      body.append(source);
    }

    const specs = node('div', 'specs');
    Object.entries(part.specs || {}).slice(0, 3).forEach(([key, value]) => {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
      specs.append(node('div', '', `${label}: ${Array.isArray(value) ? value.join(', ') : value}`));
    });
    body.append(specs);

    const bottom = node('div', 'card-bottom');
    const selected = build[part.category] === part.id;
    const add = node('button', `add${selected ? ' selected' : ''}`, selected ? 'Added ✓' : '+ Add');
    add.setAttribute('aria-label', `${selected ? 'Remove' : 'Add'} ${part.name} ${selected ? 'from' : 'to'} build`);
    add.onclick = () => {
      if (selected) delete build[part.category];
      else build[part.category] = part.id;
      save();
      renderBuild();
      renderParts();
    };
    bottom.append(node('span', 'price', money(part.priceCents)), add);
    body.append(bottom);
    card.append(art, body);
    grid.append(card);
  }
}

function selectedParts() {
  return Object.keys(labels)
    .map(key => parts.find(part => part.id === build[key] && part.category === key))
    .filter(Boolean);
}

function renderBuild() {
  const list = $('build-items');
  list.replaceChildren();
  for (const [key, label] of Object.entries(labels)) {
    const part = parts.find(item => item.id === build[key] && item.category === key);
    const row = node('div', 'slot');
    const info = node('div');
    info.append(node('div', 'slot-label', label), node('div', 'slot-name', part ? part.name : 'Not selected'));
    if (part) {
      info.append(node('div', 'slot-price', money(part.priceCents)));
      const remove = node('button', 'remove', '×');
      remove.setAttribute('aria-label', `Remove ${part.name}`);
      remove.onclick = () => {
        delete build[key];
        save();
        renderBuild();
        renderParts();
      };
      row.append(info, remove);
    } else {
      row.append(info);
    }
    list.append(row);
  }
  const chosen = selectedParts();
  $('total').textContent = money(chosen.reduce((sum, part) => sum + part.priceCents, 0));
  $('build-count').textContent = chosen.length;
  $('export').disabled = $('clear').disabled = !chosen.length;
  renderCompatibility();
}

async function load() {
  let cached = null;
  if (catalogLoading) return;
  catalogLoading = true;
  socketCategoriesReady.clear();
  renderCompatibility();
  loadedCategories = 0;
  try {
    const stored = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || 'null');
    if (Array.isArray(stored?.data?.parts)) cached = stored;
  } catch {}

  if (cached) {
    parts = cached.data.parts;
    isSampleData = cached.data.isSampleData === true;
    save();
    renderCategories();
    renderBuild();
    renderParts();
  }
  $('retry').hidden = true;

  const failedCategories = [];
  for (const categoryName of catalogCategories) {
    try {
      const response = await fetch(`/v1/parts?category=${encodeURIComponent(categoryName)}`);
      if (!response.ok) throw new Error('Category request failed');
      const payload = await response.json();
      if (payload.status !== 'success' || !Array.isArray(payload.data?.parts)
          || !payload.data.parts.every(part => part && part.category === categoryName
            && typeof part.id === 'string' && part.id.trim()
            && typeof part.name === 'string' && part.name.trim()
            && Number.isSafeInteger(part.priceCents) && part.priceCents > 0)
          || new Set(payload.data.parts.map(part => part.id)).size !== payload.data.parts.length) {
        throw new Error('Category response is invalid');
      }
      parts = [
        ...parts.filter(part => part.category !== categoryName),
        ...payload.data.parts,
      ];
      isSampleData = payload.data.isSampleData === true;
      loadedCategories += 1;
      socketCategoriesReady.add(categoryName);
      for (const key of Object.keys(build)) {
        if (key === categoryName && !parts.some(part => part.category === key && part.id === build[key])) {
          delete build[key];
        }
      }
      save();
      try {
        localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({
          data: {
            schemaVersion: 1,
            isSampleData,
            source: payload.data.source,
            generatedAt: payload.data.generatedAt,
            parts,
          },
          savedAt: Date.now(),
        }));
      } catch {}
      renderCategories();
      renderBuild();
      renderParts();
    } catch {
      failedCategories.push(categoryName);
    }
  }

  catalogLoading = false;
  renderParts();
  if (failedCategories.length) {
    const failedLabels = failedCategories.map(name => labels[name]).join(', ');
    $('status').textContent = parts.length
      ? `Some categories did not load (${failedLabels}). Try again to refresh them.`
      : 'The catalog could not load. Please try again.';
    $('retry').hidden = false;
    if (!parts.length) $('result-count').textContent = 'Catalog unavailable';
  }
}

$('search').oninput = renderParts;
$('sort').onchange = renderParts;
$('retry').onclick = load;
$('clear').onclick = () => {
  build = {};
  save();
  renderBuild();
  renderParts();
};
$('export').onclick = () => {
  const chosen = selectedParts();
  const data = {
    isSampleData,
    compatibilityChecked: false,
    socketCompatibility: renderCompatibility(),
    parts: chosen,
    totalCents: chosen.reduce((sum, part) => sum + part.priceCents, 0),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = node('a');
  link.href = url;
  link.download = 'buildlab-build.json';
  link.click();
  URL.revokeObjectURL(url);
};

renderBuild();
load();

function renderCompatibility(){
  const cpu=parts.find(p=>p.category==='cpu'&&p.id===build.cpu);
  const motherboard=parts.find(p=>p.category==='motherboard'&&p.id===build.motherboard);
  const result=(socketCategoriesReady.has('cpu') && socketCategoriesReady.has('motherboard'))?evaluateSocketCompatibility(cpu,motherboard):{
    ruleId:'cpu-motherboard-socket',status:'unknown',cpuSocket:null,motherboardSocket:null,
    message:'Socket check unavailable until the catalog loads successfully. Saved selections have not been verified.'
  };
  $('socket-compatibility').dataset.state=result.status;
  $('compatibility-title').textContent={waiting:'Waiting for selection',match:'Sockets match',mismatch:'Socket mismatch',unknown:'Compatibility unknown'}[result.status];
  $('compatibility-message').textContent=result.message;
  return result;
}

