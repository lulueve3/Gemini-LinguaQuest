type Listener = (key: string, type: 'manual' | 'auto') => void;

const STORAGE_KEYS = 'apiKeys';
const STORAGE_ACTIVE_INDEX = 'activeApiKeyIndex';

const getStoredKeys = (): string[] => {
  const raw = localStorage.getItem(STORAGE_KEYS);
  return raw ? JSON.parse(raw) : [];
};

const setStoredKeys = (keys: string[]) => {
  localStorage.setItem(STORAGE_KEYS, JSON.stringify(keys));
};

const getActiveIndex = (): number => {
  const idx = parseInt(localStorage.getItem(STORAGE_ACTIVE_INDEX) || '0', 10);
  return isNaN(idx) ? 0 : idx;
};

const setActiveIndex = (index: number) => {
  localStorage.setItem(STORAGE_ACTIVE_INDEX, index.toString());
};

let listeners: Listener[] = [];

const notify = (key: string, type: 'manual' | 'auto') => {
  listeners.forEach(cb => cb(key, type));
};

const init = () => {
  const envKey = process.env.API_KEY;
  const keys = getStoredKeys();
  let changed = false;
  if (envKey && !keys.includes(envKey)) {
    keys.push(envKey);
    changed = true;
  }
  if (changed) {
    setStoredKeys(keys);
  }
  if (localStorage.getItem(STORAGE_ACTIVE_INDEX) === null && keys.length > 0) {
    setActiveIndex(0);
  }
  if (getActiveIndex() >= keys.length && keys.length > 0) {
    setActiveIndex(0);
  }
};

const getActiveKey = (): string | null => {
  const keys = getStoredKeys();
  const idx = getActiveIndex();
  return keys[idx] || null;
};

const addKey = (key: string) => {
  const keys = getStoredKeys();
  keys.push(key);
  setStoredKeys(keys);
  setActiveKey(keys.length - 1);
};

const setActiveKey = (index: number, type: 'manual' | 'auto' = 'manual') => {
  const keys = getStoredKeys();
  if (index < 0 || index >= keys.length) return;
  setActiveIndex(index);
  notify(keys[index], type);
};

const removeKey = (index: number) => {
  const keys = getStoredKeys();
  if (index < 0 || index >= keys.length) return;
  keys.splice(index, 1);
  setStoredKeys(keys);
  let activeIdx = getActiveIndex();
  if (index === activeIdx) {
    activeIdx = 0;
    setActiveIndex(activeIdx);
    if (keys[activeIdx]) notify(keys[activeIdx], 'manual');
  } else if (index < activeIdx) {
    activeIdx -= 1;
    setActiveIndex(activeIdx);
  }
};

const switchToNextKey = (): boolean => {
  const keys = getStoredKeys();
  if (keys.length <= 1) return false;
  const current = getActiveIndex();
  const next = (current + 1) % keys.length;
  if (next === current) return false;
  setActiveKey(next, 'auto');
  return true;
};

const onChange = (cb: Listener): (() => void) => {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
};

const offChange = (cb: Listener) => {
  listeners = listeners.filter((l) => l !== cb);
};

export default {
  init,
  getKeys: getStoredKeys,
  getActiveKey,
  addKey,
  setActiveKey,
  removeKey,
  switchToNextKey,
  onChange,
  offChange,
};
