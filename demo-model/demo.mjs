// The demo model: a stand-in for an LLM, so the demo runs without an API key. It is not a language
// model. It looks for keywords in the question and maps them to the semantic layer, which it reads
// from the system prompt, exactly as a real model gets it. Every answer says so.
//
// Words for measures and dimensions -> querySales with groupBy, values from the data -> filters,
// "top 10" -> limit and order, "trend" -> per year, a product model or "look like" -> findProducts,
// "pin" -> pinToDashboard with the last view, people -> a refusal. Anything it does not understand
// gets an honest "I can't answer that" and revenue per year instead.
import { serve } from './server.mjs';

const NOTE = 'Demo mode, no real LLM:';

/** Keywords per dimension, English and German. The more specific phrases come first. */
const DIMENSION_WORDS = {
  resellerBusinessType: ['business type', 'geschäftstyp', 'geschäftsart'],
  productSubcategory: ['product subcategor', 'subcategor', 'unterkategorie'],
  productCategory: ['product categor', 'categor', 'kategorie'],
  channel: ['sales channel', 'channel', 'vertriebsweg', 'kanal', 'kanälen'],
  territoryGroup: ['territory group', 'territor', 'continent', 'kontinent'],
  country: ['countr', 'länder', 'land'],
  region: ['region'],
  reseller: ['reseller', 'händler', 'shops'],
  product: ['product', 'produkt', 'artikel'],
  year: ['year', 'annual', 'jahr', 'jährlich'],
  quarter: ['quarter', 'quartal'],
  month: ['month', 'monat'],
};
const TIME = ['year', 'quarter', 'month'];
const TREND = ['trend', 'develop', 'over time', 'entwick', 'verlauf', 'zeitlich'];

const MEASURE_WORDS = {
  margin: ['gross margin', 'margin', 'profit', 'marge', 'gewinn', 'rohertrag'],
  cost: ['cost', 'kosten'],
  quantity: ['units sold', 'units', 'quantity', 'how many', 'stück', 'menge', 'anzahl'],
  orders: ['orders', 'order count', 'bestellung', 'aufträge'],
  revenue: ['revenue', 'sales', 'turnover', 'bought', 'sold', 'umsatz', 'verkauf', 'gekauft'],
};

const PEOPLE = ['manager', 'employee', 'salesperson', 'sales rep', 'representative', 'contact person', 'salary', 'salaries', 'mitarbeiter', 'gehalt', 'gehälter', 'ansprechpartner', 'vertriebler'];
const PIN = ['pin', 'dashboard', 'anpinnen', 'merken'];
const LOOKS = ['look like', 'looks like', 'photo', 'picture', 'image', 'variant', 'aussehen', 'aussieht', 'foto', 'bild', 'show me the', 'zeig mir die'];
const PRODUCT_WORDS = ['helmet', 'jersey', 'glove', 'bottle', 'tire', 'tube', 'shorts', 'sock', 'cap', 'vest', 'light', 'lock', 'pump', 'rack', 'saddle', 'pedal', 'frame', 'wheel', 'fender', 'cage', 'stand', 'bike'];
const MOST = ['top', 'most', 'biggest', 'largest', 'best', 'highest', 'meiste', 'größte', 'beste', 'höchste'];
const LEAST = ['least', 'lowest', 'smallest', 'worst', 'wenigste', 'kleinste', 'schlechteste', 'niedrigste'];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A keyword at the start of a word; "categor" also finds "categories". */
const wordAt = (text, word) => text.search(new RegExp(`(?<![\\p{L}\\d])${escape(word)}`, 'u'));
const has = (text, words) => words.some((w) => wordAt(text, w) >= 0);
const humanize = (name) => name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/**
 * The semantic layer from the system prompt: the lines "- name (type): description Values: …."
 * under "Dimensions:" and "- name (unit): description" under "Measures:".
 */
export function readSchema(system) {
  const section = (title, end) => system.split(`${title}:\n`)[1]?.split(end)[0] ?? '';
  const lines = (text) => text.split('\n').filter((line) => line.startsWith('- '));
  const dimensions = lines(section('Dimensions', '\n\n')).map((line) => {
    const name = line.match(/^- (\w+)/)?.[1];
    const valuesText = line.match(/ Values: (.*)\.$/)?.[1];
    let values = [];
    try {
      values = valuesText ? JSON.parse(`[${valuesText}]`) : [];
    } catch {
      // A line in another format: the dimension stays without values.
    }
    return { name, values };
  }).filter((d) => d.name);
  const measures = lines(section('Measures', '\n\n')).map((line) => line.match(/^- (\w+)/)?.[1]).filter(Boolean);
  return { dimensions, measures };
}

/** Finds keywords in order of appearance; each match blanks its words, so "sales channel" is not also "sales". */
function take(state, wordsByName) {
  const found = [];
  for (const [name, words] of Object.entries(wordsByName)) {
    for (const word of words) {
      const at = wordAt(state.text, word);
      if (at < 0) continue;
      found.push({ name, at });
      const end = state.text.slice(at).search(/[^\p{L}\d-]|$/u);
      state.text = state.text.slice(0, at) + ' '.repeat(Math.max(end, word.length)) + state.text.slice(at + Math.max(end, word.length));
      break;
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.name);
}

/** Values of the data that appear in the question: the longest first, so "Mountain Bikes" wins over "Bikes". */
function takeFilters(state, dimensions) {
  const keywords = Object.values(DIMENSION_WORDS).flat();
  const candidates = dimensions
    .flatMap((d) => d.values.map((value) => ({ dimension: d.name, value, text: String(value).toLowerCase() })))
    // Numbers only as years: a quarter 1 or a month 10 is more likely a "top 10".
    .filter((c) => (typeof c.value === 'number' ? c.value >= 1000 : c.text.length >= 2) && !keywords.some((k) => c.text.startsWith(k)))
    .sort((a, b) => b.text.length - a.text.length);
  const filters = new Map();
  for (const candidate of candidates) {
    const at = state.text.search(new RegExp(`(?<![\\p{L}\\d])${escape(candidate.text)}(?![\\p{L}\\d])`, 'u'));
    if (at < 0) continue;
    state.text = state.text.slice(0, at) + ' '.repeat(candidate.text.length) + state.text.slice(at + candidate.text.length);
    filters.set(candidate.dimension, [...(filters.get(candidate.dimension) ?? []), candidate.value]);
  }
  return [...filters].map(([dimension, values]) => (values.length === 1 ? { dimension, operator: 'eq', values } : { dimension, operator: 'in', values }));
}

/** The view for a question, or null if no keyword matched. */
export function viewFor(question, schema) {
  const state = { text: ` ${question.toLowerCase()} ` };
  const known = new Set(schema.dimensions.map((d) => d.name));
  const filters = takeFilters(state, schema.dimensions);
  const filtered = new Set(filters.filter((f) => f.values.length === 1).map((f) => f.dimension));
  const limitMatch = state.text.match(/(?<![\p{L}\d])(\d{1,3})(?![\p{L}\d])/u);
  const most = has(state.text, MOST);
  const least = has(state.text, LEAST);
  const table = has(state.text, ['table', 'tabelle', 'list', 'liste']);
  const trend = has(state.text, TREND);
  let groupBy = take(state, Object.fromEntries(Object.entries(DIMENSION_WORDS).filter(([name]) => known.has(name)))).filter((d) => !filtered.has(d));
  const measures = take(state, Object.fromEntries(Object.entries(MEASURE_WORDS).filter(([name]) => schema.measures.includes(name))));
  if (groupBy.length === 0 && measures.length === 0 && filters.length === 0 && !trend) return null;

  // Time first, so it becomes the x-axis; quarters and months of several years need the year.
  if (trend && !groupBy.some((d) => TIME.includes(d))) groupBy.unshift('year');
  groupBy = [...groupBy.filter((d) => TIME.includes(d)), ...groupBy.filter((d) => !TIME.includes(d))];
  if (groupBy.some((d) => d === 'quarter' || d === 'month') && !groupBy.includes('year') && !filtered.has('year')) groupBy.unshift('year');
  groupBy = groupBy.slice(0, 3);
  if (measures.length === 0) measures.push(schema.measures[0] ?? 'revenue');

  const query = { measures };
  if (groupBy.length) query.groupBy = groupBy;
  if (filters.length) query.filters = filters;
  const isTime = groupBy.length > 0 && TIME.includes(groupBy[0]);
  if (groupBy.length && !isTime && (most || least || limitMatch)) {
    query.orderBy = { field: measures[0], direction: least ? 'asc' : 'desc' };
    query.limit = limitMatch ? Number(limitMatch[1]) : 10;
  }
  const chart = table || groupBy.length === 3 && !isTime ? 'table' : groupBy.length === 0 ? 'kpi' : isTime ? 'line' : 'bar';
  const where = filters.flatMap((f) => f.values).map(String);
  const title = `${list(measures.map(humanize))}${groupBy.length ? ` per ${list(groupBy.map(humanize))}` : ''}${where.length ? `, ${where.join(', ')}` : ''}`;
  return { title: title[0].toUpperCase() + title.slice(1), chart, query };
}

function productSearch(question) {
  const model = question.match(/\b([A-Z][a-z]+-\d{2,4})\b/)?.[1];
  if (model) return model;
  const lower = question.toLowerCase();
  if (!has(lower, LOOKS)) return null;
  return PRODUCT_WORDS.find((w) => wordAt(lower, w) >= 0) ?? null;
}

const describe = (view) => `I matched your words to "${view.title}" (${view.chart}).`;

/** What the tool result says about the call: an error, or how much came back. */
function afterTool(name, output) {
  let result;
  try {
    result = JSON.parse(output);
  } catch {
    result = null;
  }
  if (result?.error) return `The backend rejected the request: ${result.error} A real model would correct it; I can only match keywords, so please try other words.`;
  if (name === 'findProducts') return result?.products?.length ? 'These are the matching products from the catalogue.' : 'The catalogue has no product with that name.';
  if (name === 'pinToDashboard') return 'The view is on the dashboard now. It asks the backend directly, without any model.';
  return 'The numbers come straight from the database. A real model would now comment on what stands out; I cannot read them.';
}

/** The answer to a conversation. */
export function demoAnswer({ system, tools, messages }) {
  const last = messages.at(-1);
  if (last?.role === 'tool') return { text: afterTool(last.name, last.output) };
  const question = last?.role === 'user' ? last.text : '';
  const lower = question.toLowerCase();
  const schema = readSchema(system);

  if (has(lower, PEOPLE)) {
    return { text: `${NOTE} I recognised a question about people. Personal data such as sales representatives, key account managers or contact persons is deliberately not part of the data model. I can show figures per reseller, product or region instead.` };
  }
  if (has(lower, PIN) && tools.includes('pinToDashboard')) {
    const view = messages.flatMap((m) => (m.role === 'assistant' ? m.toolCalls : [])).filter((c) => c.name === 'querySales').at(-1)?.input;
    if (!view) return { text: `${NOTE} There is no chart in this chat yet that I could pin. Ask for one first, e.g. "revenue per year".` };
    return { text: `${NOTE} I pin the last chart.`, tool: 'pinToDashboard', input: view };
  }
  const search = productSearch(question);
  if (search && tools.includes('findProducts')) {
    return { text: `${NOTE} I search the catalogue for "${search}".`, tool: 'findProducts', input: { search, limit: 8 } };
  }
  const view = viewFor(question, schema);
  if (view && tools.includes('querySales')) return { text: `${NOTE} ${describe(view)}`, tool: 'querySales', input: view };
  const fallback = { title: 'Revenue per year', chart: 'line', query: { measures: ['revenue'], groupBy: ['year'] } };
  return {
    text: `${NOTE} I only match a few keywords and cannot answer that. Here is revenue per year instead. Try words like revenue, margin, per quarter, channel, Germany or top 10 resellers.`,
    ...(tools.includes('querySales') ? { tool: 'querySales', input: fallback } : {}),
  };
}

if (import.meta.main) serve(demoAnswer, { name: 'Demo model' });
