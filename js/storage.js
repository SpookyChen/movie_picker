import { normalizeFilters } from './filters.js';

const STORAGE_KEY = 'moviePicker';
export const LIST_NAMES = ['watched', 'notInterested', 'watchlist'];

function emptyState() {
  return {
    version: 1,
    apiKey: '',
    lists: { watched: {}, notInterested: {}, watchlist: {} },
    presets: [],
  };
}

function memoryBackend() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeMovie(id, movie) {
  const numId = Number(id);
  if (!Number.isInteger(numId) || !isPlainObject(movie)) return null;
  return {
    id: numId,
    title: typeof movie.title === 'string' ? movie.title : '',
    poster: typeof movie.poster === 'string' ? movie.poster : null,
    year: Number.isInteger(movie.year) ? movie.year : null,
    addedAt: typeof movie.addedAt === 'string' ? movie.addedAt : '',
  };
}

function sanitizePreset(preset) {
  if (!isPlainObject(preset) || typeof preset.id !== 'string' || typeof preset.name !== 'string' || !isPlainObject(preset.filters)) {
    return null;
  }
  return { id: preset.id, name: preset.name, filters: normalizeFilters(preset.filters) };
}

function sanitizeState(raw) {
  const state = emptyState();
  if (!isPlainObject(raw)) return state;
  if (typeof raw.apiKey === 'string') state.apiKey = raw.apiKey;
  const lists = isPlainObject(raw.lists) ? raw.lists : {};
  for (const name of LIST_NAMES) {
    if (!isPlainObject(lists[name])) continue;
    for (const [id, movie] of Object.entries(lists[name])) {
      const clean = sanitizeMovie(id, movie);
      if (clean) state.lists[name][clean.id] = clean;
    }
  }
  if (Array.isArray(raw.presets)) state.presets = raw.presets.map(sanitizePreset).filter(Boolean);
  return state;
}

export function createStorage(backend, now = () => new Date()) {
  const store = backend ?? memoryBackend();
  let state;
  try {
    const text = store.getItem(STORAGE_KEY);
    state = sanitizeState(text ? JSON.parse(text) : null);
  } catch {
    state = emptyState();
  }

  function save() {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 無法寫入（私密瀏覽、容量已滿）時只保留在記憶體
    }
  }

  function assertList(name) {
    if (!LIST_NAMES.includes(name)) throw new Error(`未知的清單：${name}`);
  }

  function removeEverywhere(id) {
    for (const name of LIST_NAMES) delete state.lists[name][id];
  }

  function addToList(name, movie) {
    assertList(name);
    const clean = sanitizeMovie(movie.id, { ...movie, addedAt: now().toISOString() });
    if (!clean) throw new Error('電影資料不正確');
    removeEverywhere(clean.id);
    state.lists[name][clean.id] = clean;
    save();
  }

  let presetSeq = 0;

  return {
    getApiKey: () => state.apiKey,

    setApiKey(key) {
      state.apiKey = String(key).replace(/\s+/g, '');
      save();
    },

    addToList,

    removeFromList(name, id) {
      assertList(name);
      delete state.lists[name][id];
      save();
    },

    moveToList(from, to, id) {
      assertList(from);
      assertList(to);
      const movie = state.lists[from][id];
      if (movie) addToList(to, movie);
    },

    getList(name) {
      assertList(name);
      return Object.values(state.lists[name])
        .map((m) => ({ ...m }))
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    },

    isExcluded: (id) => LIST_NAMES.some((name) => id in state.lists[name]),

    listOf: (id) => LIST_NAMES.find((name) => id in state.lists[name]) ?? null,

    getPresets: () => structuredClone(state.presets),

    savePreset(name, filters) {
      presetSeq += 1;
      const preset = {
        id: `p_${now().getTime().toString(36)}_${presetSeq}_${Math.random().toString(36).slice(2, 6)}`,
        name: String(name).trim(),
        filters: normalizeFilters(filters),
      };
      state.presets.push(preset);
      save();
      return structuredClone(preset);
    },

    renamePreset(id, name) {
      const preset = state.presets.find((p) => p.id === id);
      if (!preset) return;
      preset.name = String(name).trim();
      save();
    },

    deletePreset(id) {
      state.presets = state.presets.filter((p) => p.id !== id);
      save();
    },

    exportJson() {
      const { apiKey, ...rest } = state;
      return JSON.stringify(rest, null, 2);
    },

    importJson(text) {
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error('備份檔格式不正確');
      }
      if (!isPlainObject(raw) || raw.version !== 1 || !isPlainObject(raw.lists)) {
        throw new Error('備份檔格式不正確');
      }
      const incoming = sanitizeState(raw);
      for (const name of LIST_NAMES) {
        for (const movie of Object.values(incoming.lists[name])) {
          removeEverywhere(movie.id);
          state.lists[name][movie.id] = movie;
        }
      }
      for (const preset of incoming.presets) {
        const index = state.presets.findIndex((p) => p.id === preset.id);
        if (index >= 0) state.presets[index] = preset;
        else state.presets.push(preset);
      }
      save();
    },
  };
}
