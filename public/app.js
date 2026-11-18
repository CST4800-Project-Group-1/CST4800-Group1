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
const selectedOffers = new Map();
const enteredPrices = new Map();
let isSampleData = true;
const CATALOG_CACHE_KEY = 'buildlab-catalog-cache-v3';
const catalogCategories = Object.keys(labels);
let catalogLoading = false;
let socketCategoriesReady = new Set();
let socketExpiryTimer = null;
let loadedCategories = 0;
const PROVIDER_COOLDOWN_KEY = 'buildlab-provider-cooldown-v1';
let providerRetryUntil = 0;
try {
  const savedUntil = Number(localStorage.getItem(PROVIDER_COOLDOWN_KEY));
  if (Number.isFinite(savedUntil) && savedUntil > Date.now()) providerRetryUntil = savedUntil;
} catch {}
function recordProviderCooldown(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  providerRetryUntil = Math.max(providerRetryUntil, Date.now() + Math.min(seconds, 3600) * 1000);
  try { localStorage.setItem(PROVIDER_COOLDOWN_KEY, String(providerRetryUntil)); } catch {}
}
function cooldownMessage() {
  const seconds = Math.ceil(Math.max(0, providerRetryUntil - Date.now()) / 1000);
  return `Retailer service is rate limited. Retry in about ${seconds} seconds. Saved catalog prices may be outdated; socket checks remain unknown until verified.`;
}

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
    card.onclick = event => {
      if (!event.target.closest('button, a')) openPartDetails(part);
    };
    const art = node('div', 'art', icons[part.category] || '▦');
    art.setAttribute('aria-hidden', 'true');
    if (part.imageUrl?.startsWith('https://') && !part.imageIsPlaceholder) {
      const image = node('img', 'part-image');
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.onerror = () => {
        art.replaceChildren();
        art.textContent = icons[part.category] || '▦';
        art.classList.toggle('has-image', false);
      };
      image.src = part.imageUrl;
      art.textContent = '';
      art.append(image);
      art.classList.toggle('has-image', true);
    }
    const body = node('div', 'card-body');
    const details = node('button', 'part-details', 'View Details');
    details.setAttribute('aria-label', `View details for ${part.name}`);
    details.onclick = () => openPartDetails(part);
    body.append(
      node('span', 'badge', labels[part.category] || part.category),
      node('h3', '', part.name),
      node('div', 'maker', part.manufacturer || part.source || ''),
    );

    const bottom = node('div', 'card-bottom');
    bottom.append(details);
    body.append(bottom);
    card.append(art, body);
    grid.append(card);
  }
}

function selectedParts() {
  return Object.keys(labels)
    .map(key => parts.find(part => part.id === build[key] && part.category === key))
    .filter(Boolean)
    .map(part => ({...part, ...selectedOffers.get(part.id)}));
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
      const offer = selectedOffers.get(part.id) || part;
      info.append(node('div', 'slot-price', `${money(offer.priceCents)}${offer.source ? ` · ${offer.source}` : ''}`));
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

function validCategoryPayload(payload, categoryName) {
  return payload.status === 'success' && Array.isArray(payload.data?.parts)
    && payload.data.parts.every(part => part && part.category === categoryName
      && typeof part.id === 'string' && part.id.trim()
      && typeof part.name === 'string' && part.name.trim()
      && Number.isSafeInteger(part.priceCents) && part.priceCents > 0)
    && new Set(payload.data.parts.map(part => part.id)).size === payload.data.parts.length;
}

const socketRequestVersions = new Map();
async function loadSelectedSocket(categoryName) {
  if (categoryName !== 'cpu' && categoryName !== 'motherboard') return;
  const id = build[categoryName];
  const version = (socketRequestVersions.get(categoryName) || 0) + 1;
  socketRequestVersions.set(categoryName, version);
  socketCategoriesReady.delete(categoryName);
  renderCompatibility();
  const selected = parts.find(part => part.id === id && part.category === categoryName);
  if (!selected) return;
  const current = () => socketRequestVersions.get(categoryName) === version && build[categoryName] === id;
  const apply = specs => {
    if (!current()) return false;
    parts = parts.map(part => part.category === categoryName && part.id === id
      ? {...part, specs: {...part.specs, ...specs}} : part);
    socketCategoriesReady.add(categoryName);
    renderBuild();
    return true;
  };

  // Manufacturer-reviewed model facts do not need fresh retailer listings.
  // Always try this even if ZenRows is in a rate-limit cooldown.
  try {
    const params = new URLSearchParams({
      socketReference: '1', category: categoryName, socketPartId: id,
      socketModel: selected.model || '', sourceUrl: selected.sourceUrl || '',
    });
    const response = await fetch(`/v1/parts?${params}`, {cache: 'no-store'});
    if (response.ok) {
      const body = await response.json();
      if (!current()) return;
      const data = body?.data;
      if (body.status === 'success' && data?.id === id && data?.category === categoryName
          && data?.specs?.socket && data?.specs?.socketProvenance?.method === 'manufacturer_spec_reference') {
        apply(data.specs);
        return;
      }
    }
  } catch {
    // An unavailable manufacturer reference cannot establish compatibility.
  }
  if (!current() || Date.now() < providerRetryUntil) return;

  // Unknown models use the existing independently verified retailer detail path.
  try {
    const response = await fetch(`/v1/parts?category=${categoryName}&socketPartId=${encodeURIComponent(id)}`, {cache: 'no-store'});
    if (!response.ok) {
      if (response.status === 503) {
        const detail = await response.json().catch(() => ({}));
        recordProviderCooldown(detail.retryAfterSeconds);
      }
      throw new Error('Selected socket metadata unavailable');
    }
    const payload = await response.json();
    if (!validCategoryPayload(payload, categoryName)) throw new Error('Invalid socket metadata');
    if (!current()) return;
    const verified = payload.data.parts.find(part => part.id === id);
    if (!verified) throw new Error('Selected product missing from socket response');
    apply(verified.specs || {socket: null, socketProvenance: null});
  } catch {
    if (!current()) return;
    apply({socket: null, socketProvenance: null});
    socketCategoriesReady.delete(categoryName);
    renderCompatibility();
  }
}

async function load() {
  let cached = null;
  if (catalogLoading) return;
  catalogLoading = true;
  $('refresh-catalog').disabled = true;
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
  // Allow exact manufacturer socket checks even while ZenRows is rate limited.
  for (const categoryName of ['cpu', 'motherboard']) {
    if (build[categoryName]) await loadSelectedSocket(categoryName);
  }
  if (Date.now() < providerRetryUntil) {
    catalogLoading = false;
    $('refresh-catalog').disabled = false;
    renderParts();
    $('status').textContent = cooldownMessage();
    $('retry').hidden = false;
    return;
  }
  $('retry').hidden = true;

  const failedCategories = [];
  for (const categoryName of catalogCategories) {
    try {
      // List every category before spending provider requests on optional specs.
      const response = await fetch(`/v1/parts?category=${encodeURIComponent(categoryName)}&metadata=0`, {cache: 'no-store'});
      if (!response.ok) {
        // The provider explicitly requests a cooldown. Do not hammer every
        // remaining category with requests known to be rate limited.
        if (response.status === 503) {
          const detail = await response.json().catch(() => ({}));
          if (Number.isFinite(detail.retryAfterSeconds)) {
            const remainder = catalogCategories.slice(catalogCategories.indexOf(categoryName));
            failedCategories.push(...remainder);
            if (detail.retryAfterSeconds > 0) {
              recordProviderCooldown(detail.retryAfterSeconds);
            }
            break;
          }
        }
        throw new Error('Category request failed');
      }
      const payload = await response.json();
      if (!validCategoryPayload(payload, categoryName)) {
        throw new Error('Category response is invalid');
      }
      parts = [
        ...parts.filter(part => part.category !== categoryName),
        ...payload.data.parts.map(part => ({...part, priceUpdatedAt: payload.data.generatedAt})),
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

  // Only fetch details for the selected CPU and motherboard, not the
  // first three unrelated products in each category.
  for (const categoryName of ['cpu', 'motherboard']) {
    if (build[categoryName]) await loadSelectedSocket(categoryName);
  }
  catalogLoading = false;
  $('refresh-catalog').disabled = false;
  renderCompatibility();
  renderParts();
  if (failedCategories.length) {
    const failedLabels = failedCategories.map(name => labels[name]).join(', ');
    $('status').textContent = Date.now() < providerRetryUntil ? cooldownMessage()
      : parts.length
        ? `Some categories did not load (${failedLabels}). Try again to refresh them.`
        : 'The catalog could not load. Please try again.';
    $('retry').hidden = false;
    if (!parts.length) $('result-count').textContent = 'Catalog unavailable';
  }
}

$('search').oninput = renderParts;
$('sort').onchange = renderParts;
$('retry').onclick = load;
$('refresh-catalog').onclick = load;
$('clear').onclick = () => {
  build = {};
  save();
  renderBuild();
  renderParts();
};
$('export').onclick = () => {
  const chosen = selectedParts();
  const snapshot = socketSnapshot();
  renderCompatibility(snapshot);
  const data = {
    isSampleData,
    compatibilityChecked: false,
    socketCompatibility: snapshot.result,
    socketEvaluation: snapshot.evaluation,
    parts: chosen.map(part => ({...part,
      catalogSourceUrl: parts.find(item => item.id === part.id && item.category === part.category)?.sourceUrl || null,
    })),
    totalCents: chosen.reduce((sum, part) => sum + part.priceCents, 0),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = node('a');
  link.href = url;
  link.download = 'buildlab-build.json';
  link.click();
  URL.revokeObjectURL(url);
};

const retailerPriceCache = new Map();
const RETAILER_PRICE_CACHE_KEY = 'buildlab-retailer-prices-v1';
function storedRetailerPrices() {
  try {
    const saved = JSON.parse(localStorage.getItem(RETAILER_PRICE_CACHE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(item => item && item.expires > Date.now() && Array.isArray(item.offers)) : [];
  } catch { return []; }
}
function loadRetailerPrice(source, model, name) {
  if (Date.now() < providerRetryUntil) return Promise.resolve([]);
  const key = JSON.stringify([source, model, name]);
  const cached = retailerPriceCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const stored = storedRetailerPrices().find(item => item.key === key);
  if (stored && stored.offers.every(offer => offer.source === source && verifiedProductUrl(source, offer.sourceUrl))) {
    return Promise.resolve(stored.offers);
  }
  const entry = {expires: Date.now() + 120000};
  entry.promise = fetch(`/api/catalog?model=${encodeURIComponent(model)}&name=${encodeURIComponent(name)}&store=${encodeURIComponent(source)}&prices=direct-v3`)
    .then(response => { if (!response.ok) throw new Error('Unavailable'); return response.json(); })
    .then(data => {
      const offers = (data.offers || []).filter(offer => offer.source === source && verifiedProductUrl(source, offer.sourceUrl));
      entry.expires = Date.now() + (offers.some(offer => offer.priceCents || offer.priceIsAmbiguous) ? 300000 : 30000);
      if (offers.some(offer => offer.priceCents || offer.priceIsAmbiguous)) {
        try {
          const saved = storedRetailerPrices().filter(item => item.key !== key).slice(-79);
          saved.push({key, expires: entry.expires, offers});
          localStorage.setItem(RETAILER_PRICE_CACHE_KEY, JSON.stringify(saved));
        } catch {}
      }
      return offers;
    }).catch(error => { retailerPriceCache.delete(key); throw error; });
  retailerPriceCache.set(key, entry);
  return entry.promise;
}

function verifiedProductUrl(source, value) {
  const rules = {
    'B&H Photo': ['bhphotovideo.com', /^\/c\/product\/\d+/i],
    Amazon: ['amazon.com', /\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i],
    Newegg: ['newegg.com', /\/p\/[A-Z0-9]{8,}(?:\/|$)/i],
    'Best Buy': ['bestbuy.com', /(?:\/site\/.+\/\d+\.p$|\/product\/[^/]+\/[^/]+)/i],
  };
  try {
    const url = new URL(value);
    const rule = rules[source];
    if (rule && url.protocol === 'https:' && !url.username && !url.password && !url.port
        && (url.hostname === rule[0] || url.hostname.endsWith(`.${rule[0]}`)) && rule[1].test(url.pathname)) return url.href;
  } catch {}
  return null;
}

function retailerSearchUrl(source, part) {
  const searches = {
    'B&H Photo': ['https://www.bhphotovideo.com/c/search', 'Ntt'],
    Amazon: ['https://www.amazon.com/s', 'k'],
    Newegg: ['https://www.newegg.com/p/pl', 'd'],
    'Best Buy': ['https://www.bestbuy.com/site/searchpage.jsp', 'st'],
  };
  const search = searches[source];
  const query = (part.model || part.name || '').trim();
  if (!search || !query) return null;
  const url = new URL(search[0]);
  url.searchParams.set(search[1], query);
  return url.href;
}

function openPartDetails(part) {
  const dialog = $('part-dialog');
  const content = $('part-dialog-content');
  content.replaceChildren();
  content.append(node('span', 'badge', labels[part.category] || part.category));
  const title = node('h2', '', part.name);
  title.id = 'part-dialog-title';
  content.append(title, node('p', 'muted', `${part.manufacturer || 'Unknown manufacturer'} · Model: ${part.model || part.name}`));
  if (part.imageUrl?.startsWith('https://') && !part.imageIsPlaceholder) {
    const image = node('img', 'detail-image');
    image.src = part.imageUrl;
    image.alt = part.name;
    content.append(image);
  }
  const specs = node('dl', 'detail-specs');
  for (const [key, value] of Object.entries(part.specs || {})) {
    if (key === 'socketProvenance') {
      if (typeof value?.sourceUrl === 'string' && value.sourceUrl.startsWith('https://')) {
        const link = node('a', '', 'Product specification');
        link.href = value.sourceUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const source = node('dd');
        source.append(link);
        specs.append(node('dt', '', 'Socket source'), source);
      }
      continue;
    }
    specs.append(node('dt', '', key.replace(/([a-z])([A-Z0-9])/g, '$1 $2')),
      node('dd', '', value === null ? 'Unknown' : Array.isArray(value) ? value.join(', ') : String(value)));
  }
  content.append(node('h3', '', 'Specifications'), specs);
  if (!specs.children.length) content.append(node('p', 'muted', 'No specifications supplied by the retailer.'));
  content.append(node('h3', '', 'Retailer prices'));
  const offers = node('div', 'retailer-offers');
  const retailerRows = new Map();
  const updateOfferSelection = () => {
    const selected = selectedOffers.get(part.id)?.source || part.source;
    for (const [source, entry] of retailerRows) {
      const checked = build[part.category] === part.id && source === selected && !entry.select.disabled;
      entry.select.setAttribute('aria-checked', String(checked));
      entry.select.textContent = checked ? '✓' : '';
      entry.row.classList.toggle('offer-selected', checked);
    }
  };
  offers.setAttribute('role', 'radiogroup');
  offers.setAttribute('aria-label', 'Choose a retailer price');
  const addOffer = (offer, editing = false) => {
    const priceKey = JSON.stringify([part.id, offer.source]);
    const entered = enteredPrices.get(priceKey);
    if (entered) offer = {...offer, priceCents: entered.priceCents,
      priceIsManual: true, priceUpdatedAt: entered.priceUpdatedAt};
    const existing = retailerRows.get(offer.source);
    const productPage = verifiedProductUrl(offer.source, offer.sourceUrl)
      || verifiedProductUrl(offer.source, existing?.offer.sourceUrl)
      || (offer.source === part.source ? verifiedProductUrl(part.source, part.sourceUrl) : null);
    if (productPage) offer = {...offer, sourceUrl: productPage};
    if (existing?.offer.priceCents && !offer.priceCents && !offer.priceIsAmbiguous) {
      offer = {...existing.offer, ...offer, priceCents: existing.offer.priceCents,
        priceUpdatedAt: existing.offer.priceUpdatedAt};
    }
    const row = existing?.row || node('div', 'offer-row');
    row.replaceChildren();
    const info = node('div');
    const productUrl = verifiedProductUrl(offer.source, offer.sourceUrl);
    const searchUrl = productUrl ? null : retailerSearchUrl(offer.source, part);
    const destination = productUrl || searchUrl;
    const link = node(destination ? 'a' : 'span', 'offer-store', offer.source || 'Retailer');
    if (destination) {
      link.href = destination;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', productUrl
        ? `Open ${offer.source} product page for ${part.name}`
        : `Search ${offer.source} for ${part.name}`);
    } else {
      link.setAttribute('aria-disabled', 'true');
    }
    const retailerMessage = searchUrl
      ? 'Search results — confirm the exact model and current price.'
      : offer.priceIsAmbiguous
      ? 'Multiple prices available. Check the retailer’s website and enter your chosen price.'
      : !productUrl
        ? offer.priceLoading ? 'Finding a matching product page…' : 'No verified product page found for this model.'
      : productUrl && !offer.priceCents
        ? 'Check the retailer’s website for current prices and available offers.'
        : offer.availability?.replaceAll('_', ' ') || 'Availability unknown';
    info.append(link, node('div', 'fine', retailerMessage));
    const hasPrice = Number.isSafeInteger(offer.priceCents) && offer.priceCents > 0;
    const showPrice = hasPrice && !editing;
    const loading = !hasPrice && offer.priceLoading === true;
    const price = node(showPrice ? 'strong' : loading ? 'span' : 'label', showPrice ? 'detail-price' : loading ? 'muted' : 'manual-price', showPrice ? money(offer.priceCents) : loading ? 'Checking price...' : 'Enter the Price');
    let chosenOffer = {...offer};
    const select = node('button', 'offer-select');
    select.setAttribute('role', 'radio');
    select.setAttribute('aria-label', hasPrice ? `Select ${offer.source} at ${money(offer.priceCents)}` : `Enter a price to select ${offer.source}`);
    select.disabled = !hasPrice;
    select.onclick = () => {
      if (select.disabled) return;
      build[part.category] = part.id;
      save();
      if (part.category === 'cpu' || part.category === 'motherboard') {
        void loadSelectedSocket(part.category);
      }
      selectedOffers.set(part.id, {
        source: chosenOffer.source, sourceUrl: chosenOffer.sourceUrl, priceCents: chosenOffer.priceCents,
        priceUpdatedAt: chosenOffer.priceUpdatedAt, availability: chosenOffer.availability,
        priceIsManual: chosenOffer.priceIsManual === true,
      });
      updateOfferSelection();
      renderBuild();
      renderParts();
      if (chosenOffer.priceIsManual) addOffer(chosenOffer);
    };
    if (!showPrice && !loading) {
      const input = node('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.placeholder = 'USD 0.00';
      if (hasPrice) input.value = (offer.priceCents / 100).toFixed(2);
      input.setAttribute('aria-label', `Price in USD from ${offer.source}`);
      input.oninput = () => {
        const value = input.value.trim();
        const cents = /^\d+(?:\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : 0;
        const valid = Number.isSafeInteger(cents) && cents > 0;
        select.disabled = !valid;
        chosenOffer = {...offer, priceCents: cents, priceIsManual: true, priceUpdatedAt: new Date().toISOString()};
        select.setAttribute('aria-label', valid ? `Select ${offer.source} at ${money(cents)} (entered price)` : `Enter a price to select ${offer.source}`);
        if (valid) enteredPrices.set(priceKey, chosenOffer);
        if (valid && build[part.category] === part.id && selectedOffers.get(part.id)?.source === offer.source) {
          selectedOffers.set(part.id, {...chosenOffer});
          renderBuild();
        }
        updateOfferSelection();
      };
      const commit = () => {
        if (!select.disabled && chosenOffer.priceIsManual) addOffer(chosenOffer);
      };
      input.onblur = event => { if (event.relatedTarget !== select) commit(); };
      input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } };
      price.append(input, node('span', 'fine', 'Enter USD price from the retailer website.'));
    }
    const priceChoice = node('div', 'offer-price-choice');
    priceChoice.append(price, select);
    if (showPrice && offer.priceIsManual) {
      const edit = node('button', 'price-edit', '\u270e');
      edit.setAttribute('aria-label', `Edit entered price for ${offer.source}`);
      edit.title = 'Edit price';
      edit.onclick = () => {
        addOffer(offer, true);
        retailerRows.get(offer.source).price.children[0].focus();
      };
      priceChoice.append(edit);
    }
    row.append(info, priceChoice);
    if (!existing) offers.append(row);
    retailerRows.set(offer.source, {row, price, select, offer});
    updateOfferSelection();
  };
  addOffer(part);
  const popupRetailers = new Set([
    'Amazon', 'Newegg', 'Best Buy',
    ...Object.keys(part.retailerSearchUrls || {}),
    ...Object.keys(part.retailerProductUrls || {}),
  ]);
  popupRetailers.delete(part.source);
  for (const source of popupRetailers) {
    addOffer({source, priceLoading: true, availability: 'Looking for a matching product and price'});
  }
  for (const [source, sourceUrl] of Object.entries(part.retailerProductUrls || {})) {
    addOffer({source, sourceUrl, priceLoading: true, availability: 'Reading the product-page price'});
  }
  // Confirmed links resolve separately so blocked price scrapers cannot delay them.
  fetch(`/api/catalog?links=1&model=${encodeURIComponent(part.model || '')}&sourceUrl=${encodeURIComponent(part.sourceUrl || '')}`, {cache: 'no-store'})
    .then(response => { if (!response.ok) throw new Error('Links unavailable'); return response.json(); })
    .then(data => { for (const offer of data.offers || []) {
      const current = retailerRows.get(offer.source)?.offer;
      if (verifiedProductUrl(offer.source, offer.sourceUrl)) {
        addOffer({...current, ...offer, priceLoading: current ? current.priceLoading === true : true});
      }
    } })
    .catch(() => {});
  content.append(offers);
  const status = node('p', 'fine', 'Checking other retailers for this exact model...');
  content.append(status);
  const fetched = part.priceUpdatedAt ? new Date(part.priceUpdatedAt) : null;
  content.append(node('p', 'fine', fetched && !Number.isNaN(fetched.getTime())
    ? `${part.source || "Retailer"} price fetched ${fetched.toLocaleString()}. Prices may be cached for one hour. Confirm current prices at the retailer.`
    : 'Confirm current prices at the retailer.'));
  content.append(node('p', 'fine', 'Other retailer prices are cached for five minutes. Entered prices stay until you refresh the page.'));
  if (part.model || part.name) {
    const featureText = Object.values(part.specs || {}).join(' ');
    const memory = featureText.match(/\b(\d+)\s*GB\b/i);
    const generation = featureText.match(/\bGDDR\d+X?\b/i);
    const matchName = [part.name, memory ? `${memory[1]} GB` : '', generation?.[0] || ''].filter(Boolean).join(' ');
    const retailers = [...retailerRows.keys()].filter(source => source !== part.source);
    status.textContent = 'Checking retailer prices...';
    Promise.allSettled(retailers.map(source =>
      loadRetailerPrice(source, part.model || part.name, matchName).then(found => {
        // Product links are useful immediately, even while another price is pending.
        for (const offer of found) {
          const current = retailerRows.get(source)?.offer;
          if (current && verifiedProductUrl(source, offer.sourceUrl)) {
            addOffer({...current, sourceUrl: offer.sourceUrl});
          }
        }
        return found;
      })
    )).then(results => {
      // Commit the complete batch in one render turn so rows finish together.
      results.forEach((result, index) => {
        const source = retailers[index];
        if (result.status === 'fulfilled') {
          result.value.forEach(offer => addOffer({...offer, priceLoading: false}));
        }
        const current = retailerRows.get(source)?.offer;
        if (current?.priceLoading) addOffer({...current, priceLoading: false,
          availability: result.status === 'rejected'
            ? 'Price lookup failed; check the product page and enter its price'
            : 'Automatic price unavailable; check the product page and enter its price'});
      });
      status.textContent = 'Price checks complete. Confirm current prices at the retailer.';
    });
  } else {
    for (const entry of retailerRows.values()) {
      if (entry.offer.priceLoading) addOffer({...entry.offer, priceLoading: false,
        availability: 'A product name or model is needed to check prices'});
    }
    status.textContent = 'Additional prices require a manufacturer model number.';
  }
  if (!dialog.open) dialog.showModal();
}

$('part-dialog-close').onclick = () => $('part-dialog').close();
$('part-dialog').onclick = event => {
  if (event.target === $('part-dialog')) {
    const bounds = event.target.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.target.close();
  }
};

renderBuild();
load();

function socketSnapshot() {
  const cpu = parts.find(part => part.category === 'cpu' && part.id === build.cpu);
  const motherboard = parts.find(part => part.category === 'motherboard' && part.id === build.motherboard);
  const now = Date.now();
  const refreshState = socketCategoriesReady.has('cpu') && socketCategoriesReady.has('motherboard')
    ? 'ready' : catalogLoading ? 'loading' : 'failed';
  return {
    cpu, motherboard, now,
    result: evaluateSocketCompatibility(cpu, motherboard, {now, refreshState}),
    evaluation: {
      evaluatedAt: new Date(now).toISOString(), refreshState,
      cpuPartId: cpu?.id || null, motherboardPartId: motherboard?.id || null,
      cpuSourceUrl: cpu?.sourceUrl || null, motherboardSourceUrl: motherboard?.sourceUrl || null,
    },
  };
}

function renderCompatibility(snapshot = socketSnapshot()) {
  const {cpu, motherboard, now, result} = snapshot;
  clearTimeout(socketExpiryTimer);
  const nextExpiry = (result.status === 'match' || result.status === 'mismatch')
    ? Math.min(...[cpu, motherboard].map(part => Date.parse(part?.specs?.socketProvenance?.expiresAt))
      .filter(expiry => expiry > now && expiry - now <= 3600000))
    : Infinity;
  socketExpiryTimer = Number.isFinite(nextExpiry)
    ? setTimeout(renderCompatibility, nextExpiry - now + 1) : null;
  $('socket-compatibility').dataset.state = result.status;
  $('compatibility-title').textContent = {
    waiting: 'Waiting for selection', match: 'Sockets match',
    mismatch: 'Socket mismatch', unknown: 'Compatibility unknown',
  }[result.status];
  $('compatibility-message').textContent = result.message;
  $('compatibility-checked-at').textContent =
    `Socket result checked ${new Date(now).toLocaleTimeString()}. Downloads include this result and its check time.`;
  const evidence = $('compatibility-evidence');
  evidence.replaceChildren();
  for (const [label, part] of [['CPU', cpu], ['Motherboard', motherboard]]) {
    const provenance = part?.specs?.socketProvenance;
    if (!part || !provenance) continue;
    try {
      const url = new URL(provenance.sourceUrl);
      if (url.protocol !== 'https:' || url.username || url.password) continue;
      const link = node('a', 'socket-source', `${label} specification source`);
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      evidence.append(link);
    } catch {}
  }
  return result;
}
