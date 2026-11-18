// Browser-native BuildLab PDF export. No external services, fonts or dependencies.
// Text is encoded as WinAnsi-safe ASCII, and source URLs become clickable PDF links.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 42;
const RIGHT = PAGE_W - MARGIN;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TITLE = [0.12, 0.15, 0.19];
const MUTED = [0.35, 0.40, 0.44];
const LIME = [0.79, 0.96, 0.40];

function ascii(value) {
  return String(value ?? '')
    .replace(/[–—−]/g, '-').replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"').replace(/…/g, '...')
    .replace(/×/g, 'x').replace(/•/g, '-')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
}
function literal(value) {
  return '(' + ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
}
function rgb(color) {
  return color.map(n => n.toFixed(3)).join(' ');
}
function approxWidth(value, size, bold = false) {
  return [...ascii(value)].reduce((width, c) => {
    if ('il.,:;|!\' '.includes(c)) return width + 0.26 * size;
    if ('MW@%'.includes(c)) return width + 0.85 * size;
    if ('0123456789'.includes(c)) return width + 0.54 * size;
    return width + (bold ? 0.59 : 0.52) * size;
  }, 0);
}
function linesFor(value, maxWidth, size, bold = false) {
  const text = ascii(value);
  const result = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { result.push(''); continue; }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? line + ' ' + word : word;
      if (approxWidth(candidate, size, bold) <= maxWidth) { line = candidate; continue; }
      if (line) { result.push(line); line = ''; }
      for (const char of word) {
        if (approxWidth(line + char, size, bold) > maxWidth && line) {
          result.push(line); line = '';
        }
        line += char;
      }
    }
    if (line) result.push(line);
  }
  return result;
}
function formatPrice(cents) {
  const amount = Number.isSafeInteger(cents) ? cents / 100 : 0;
  return '$' + amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
function dateLabel(date) {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}
function isSafeLink(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && url.length < 1800;
  } catch { return false; }
}
class Document {
  constructor() { this.pages = []; this.newPage(); }
  newPage() {
    this.page = {content: [], links: []};
    this.pages.push(this.page);
    this.y = 102;
    this.rect(0, 0, PAGE_W, 9, LIME);
    this.rect(0, 9, PAGE_W, 79, TITLE);
    this.text('BUILDLAB', MARGIN, 43, 23, true, [1, 1, 1]);
    this.text('PC BUILD REPORT  /  CST 4800 GROUP 1', MARGIN, 66, 8, false, LIME);
  }
  rect(x, y, w, h, color) {
    this.page.content.push(rgb(color) + ' rg ' + x.toFixed(2) + ' ' +
      (PAGE_H - y - h).toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re f');
  }
  rule(y, color = [0.85, 0.87, 0.88]) { this.rect(MARGIN, y, CONTENT_W, 0.8, color); }
  text(str, x, baseline, size = 10, bold = false, color = TITLE) {
    this.page.content.push('BT ' + rgb(color) + ' rg /' + (bold ? 'F2' : 'F1') +
      ' ' + size.toFixed(2) + ' Tf 1 0 0 1 ' + x.toFixed(2) + ' ' +
      (PAGE_H - baseline).toFixed(2) + ' Tm ' + literal(str) + ' Tj ET');
  }
  rightText(str, x, baseline, size, bold = false, color = TITLE) {
    this.text(str, x - approxWidth(str, size, bold), baseline, size, bold, color);
  }
  wrap(str, x, baseline, width, size = 9.5, spacing = 13, bold = false, color = TITLE) {
    const lines = linesFor(str, width, size, bold);
    lines.forEach((line, i) => this.text(line, x, baseline + i * spacing, size, bold, color));
    return baseline + Math.max(lines.length, 1) * spacing;
  }
  hyperlink(label, url, x, baseline, size = 8.8) {
    if (!isSafeLink(url)) return baseline;
    const width = Math.min(approxWidth(label, size), CONTENT_W);
    this.text(label, x, baseline, size, false, [0.10, 0.34, 0.47]);
    this.page.links.push({url, rect: [x, PAGE_H - baseline - 3, x + width, PAGE_H - baseline + size]});
    return baseline + 14;
  }
  ensure(height) {
    if (this.y + height > 736) this.newPage();
  }
  sectionTitle(name) {
    this.ensure(33);
    this.text(name.toUpperCase(), MARGIN, this.y + 16, 10, true, MUTED);
    this.rule(this.y + 24);
    this.y += 38;
  }
  render() {
    this.pages.forEach((page, index) => {
      page.content.push(rgb([0.65, 0.68, 0.69]) + ' rg');
      this.page = page;
      this.rule(750, [0.88, 0.90, 0.91]);
      this.text('BUILDLAB  |  Estimated prices; verify retailer totals before purchasing.', MARGIN, 766, 7.5, false, MUTED);
      this.rightText('PAGE ' + (index + 1) + ' / ' + this.pages.length, RIGHT, 766, 7.5, false, MUTED);
    });

    const encoder = new TextEncoder();
    const objects = [null];
    const add = body => { objects.push(body); return objects.length - 1; };
    const regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pagesId = add('');
    const pageIds = [];
    for (const page of this.pages) {
      const stream = page.content.join('\n') + '\n';
      const streamId = add('<< /Length ' + encoder.encode(stream).length + ' >>\nstream\n' + stream + 'endstream');
      const annotationIds = page.links.map(link => add(
        '<< /Type /Annot /Subtype /Link /Rect [' +
          link.rect.map(value => value.toFixed(2)).join(' ') +
          '] /Border [0 0 0] /A << /S /URI /URI ' + literal(link.url) + ' >> >>'
      ));
      const pageId = add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 612 792] ' +
        '/Resources << /Font << /F1 ' + regular + ' 0 R /F2 ' + bold + ' 0 R >> >> ' +
        '/Contents ' + streamId + ' 0 R /Annots [' +
        annotationIds.map(id => id + ' 0 R').join(' ') + '] >>');
      pageIds.push(pageId);
    }
    objects[pagesId] = '<< /Type /Pages /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') +
      '] /Count ' + pageIds.length + ' >>';
    const catalog = add('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');
    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [0];
    for (let i = 1; i < objects.length; i++) {
      offsets.push(encoder.encode(pdf).length);
      pdf += i + ' 0 obj\n' + objects[i] + '\nendobj\n';
    }
    const startxref = encoder.encode(pdf).length;
    pdf += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
    for (let i = 1; i < objects.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    pdf += 'trailer\n<< /Size ' + objects.length + ' /Root ' + catalog +
      ' 0 R >>\nstartxref\n' + startxref + '\n%%EOF';
    return new Blob([encoder.encode(pdf)], {type: 'application/pdf'});
  }
}

/**
 * All data is taken from the user's selected build and its current socket
 * evaluation, never from a replacement sample catalog.
 */
export function createBuildPdf({parts = [], labels = {}, totalCents = 0,
  socketCompatibility = {}, socketEvaluation = {}, isSampleData = false,
  generatedAt = new Date().toISOString()}) {
  const pdf = new Document();
  const generated = dateLabel(generatedAt);
  const chosen = Array.isArray(parts) ? parts : [];
  pdf.text('YOUR PC BUILD', MARGIN, pdf.y + 20, 18, true);
  pdf.text('Generated ' + generated, MARGIN, pdf.y + 39, 9, false, MUTED);
  pdf.y += 58;

  pdf.rect(MARGIN, pdf.y, CONTENT_W, 67, [0.95, 0.96, 0.96]);
  pdf.text('ESTIMATED BUILD TOTAL', MARGIN + 16, pdf.y + 23, 9, true, MUTED);
  pdf.text(formatPrice(totalCents), MARGIN + 16, pdf.y + 49, 20, true, TITLE);
  pdf.rightText(chosen.length + ' of 7 categories selected', RIGHT - 16, pdf.y + 43, 9, false, MUTED);
  pdf.y += 82;

  pdf.sectionTitle('CPU and motherboard socket check');
  const status = ['match', 'mismatch', 'waiting', 'unknown'].includes(socketCompatibility.status)
    ? socketCompatibility.status : 'unknown';
  const colors = {
    match: [0.11, 0.38, 0.27], mismatch: [0.67, 0.21, 0.19],
    unknown: [0.53, 0.40, 0.13], waiting: [0.36, 0.40, 0.46],
  };
  const headings = {
    match: 'SOCKETS MATCH', mismatch: 'SOCKET MISMATCH',
    unknown: 'NOT VERIFIED', waiting: 'AWAITING SELECTION',
  };
  const color = colors[status];
  const detail = socketCompatibility.message ||
    'No confirmed socket compatibility result is available.';
  const lines = linesFor(detail, CONTENT_W - 28, 9.5);
  const compHeight = 72 + lines.length * 13;
  pdf.ensure(compHeight + 20);
  pdf.rect(MARGIN, pdf.y, CONTENT_W, compHeight, [0.97, 0.97, 0.97]);
  pdf.rect(MARGIN, pdf.y, 4, compHeight, color);
  pdf.text(headings[status], MARGIN + 16, pdf.y + 22, 12, true, color);
  pdf.text('CPU: ' + (socketCompatibility.cpuSocket || 'Not verified') +
    '   |   Motherboard: ' + (socketCompatibility.motherboardSocket || 'Not verified'),
    MARGIN + 16, pdf.y + 42, 9, true, TITLE);
  pdf.wrap(detail, MARGIN + 16, pdf.y + 60, CONTENT_W - 32, 9.5, 13, false, TITLE);
  pdf.y += compHeight + 13;
  pdf.text('Checked: ' + dateLabel(socketEvaluation.evaluatedAt || generatedAt), MARGIN, pdf.y, 8, false, MUTED);
  pdf.y += 17;

  pdf.sectionTitle('Selected components and prices');
  const order = Object.keys(labels);
  const sorted = [...chosen].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  for (const part of sorted) {
    const title = ascii(part.name || 'Unnamed component');
    const category = ascii(labels[part.category] || part.category || 'Component');
    const model = ascii(part.model || 'Model not provided');
    const store = ascii(part.source || 'Retailer not specified');
    const titleLines = linesFor(title, CONTENT_W - 164, 10.6, true);
    const height = Math.max(75, 56 + titleLines.length * 14);
    pdf.ensure(height + 5);
    const top = pdf.y;
    pdf.rect(MARGIN, top, CONTENT_W, height, [0.965, 0.971, 0.972]);
    pdf.rect(MARGIN, top, 3, height, LIME);
    pdf.text(category.toUpperCase(), MARGIN + 14, top + 17, 8, true, MUTED);
    pdf.wrap(title, MARGIN + 14, top + 34, CONTENT_W - 164, 10.6, 14, true);
    pdf.rightText(formatPrice(part.priceCents), RIGHT - 14, top + 34, 12, true, TITLE);
    pdf.rightText(part.priceIsManual ? 'MANUALLY ENTERED PRICE' : 'LISTED PRICE',
      RIGHT - 14, top + 49, 7, false, MUTED);
    pdf.text('Model: ' + model.slice(0, 60), MARGIN + 14, top + height - 23, 8, false, MUTED);
    pdf.text('Retailer: ' + store.slice(0, 48), MARGIN + 14, top + height - 10, 8, false, MUTED);
    pdf.y += height + 6;
    const url = part.sourceUrl || part.catalogSourceUrl;
    if (isSafeLink(url)) {
      pdf.ensure(16);
      pdf.hyperlink('View ' + category + ' product listing', url, MARGIN + 10, pdf.y + 4);
      pdf.y += 18;
    }
  }

  pdf.ensure(54);
  pdf.rule(pdf.y + 6);
  pdf.text('TOTAL ESTIMATE', MARGIN, pdf.y + 30, 11, true);
  pdf.rightText(formatPrice(totalCents), RIGHT, pdf.y + 30, 17, true);
  pdf.y += 51;

  const missing = order.filter(key => !chosen.some(part => part.category === key));
  if (missing.length) {
    pdf.ensure(46);
    const after = pdf.wrap('Not selected: ' + missing.map(key => labels[key]).join(', '),
      MARGIN, pdf.y + 10, CONTENT_W, 8.8, 13, false, MUTED);
    pdf.y = after + 10;
  }

  pdf.sectionTitle('Socket specification sources');
  const selectedCpu = chosen.find(p => p.category === 'cpu');
  const selectedBoard = chosen.find(p => p.category === 'motherboard');
  for (const [label, part] of [['CPU', selectedCpu], ['Motherboard', selectedBoard]]) {
    if (!part) continue;
    pdf.ensure(35);
    pdf.text(label + ': ' + ascii(part.specs?.socket || 'Not verified'), MARGIN, pdf.y + 11, 9, true);
    const source = part.specs?.socketProvenance?.sourceUrl;
    if (isSafeLink(source)) {
      pdf.hyperlink('Open ' + label + ' specification source', source, MARGIN + 18, pdf.y + 28, 8.5);
      pdf.y += 42;
    } else pdf.y += 24;
  }

  pdf.sectionTitle('Important notes');
  const notes = [
    'Socket match does not guarantee BIOS support, memory, GPU, case clearance, power delivery, or full-build compatibility.',
    'Prices shown are estimates from the selected retailer offers; they may have changed since loading and exclude tax and shipping.',
    'A manually entered price is not an automatically verified retailer price.',
    ...(isSampleData ? ['This report includes sample catalog data; do not use it as a live purchase quote.'] : []),
  ];
  for (const note of notes) {
    pdf.ensure(40);
    const after = pdf.wrap('- ' + note, MARGIN, pdf.y + 8, CONTENT_W, 8.5, 12, false, MUTED);
    pdf.y = after + 5;
  }
  return pdf.render();
}
