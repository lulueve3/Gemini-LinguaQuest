import React, { useEffect, useState } from 'react';
import apiKeyService from '../services/apiKeyService';
import deepAiService from '../services/deepAiService';
import klingAiService from '../services/klingAiService';

interface Props {
  onBack: () => void;
  onToast: (msg: string, type?: 'error' | 'success') => void;
}

const maskKey = (key: string) => {
  const head = key.slice(0, 6);
  const tail = key.slice(-4);
  return `${head}...${tail}`;
};

const ApiKeyManager: React.FC<Props> = ({ onBack, onToast }) => {
  const [keys, setKeys] = useState<string[]>([]);
  const [newKey, setNewKey] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  // DeepAI state
  const [deepAiKey, setDeepAiKey] = useState<string>('');
  const [deepAiExisting, setDeepAiExisting] = useState<string | null>(null);
  // KlingAI state
  const [klingAccessKey, setKlingAccessKey] = useState<string>('');
  const [klingSecretKey, setKlingSecretKey] = useState<string>('');
  const [klingAccessExisting, setKlingAccessExisting] = useState<string | null>(null);

  const refresh = () => {
    const all = apiKeyService.getKeys();
    setKeys(all);
    const activeKey = apiKeyService.getActiveKey();
    const idx = all.findIndex(k => k === activeKey);
    setActiveIndex(idx === -1 ? 0 : idx);
  };

  useEffect(() => {
    refresh();
    try {
      const existing = deepAiService.getApiKey();
      setDeepAiExisting(existing || null);
      setDeepAiKey(existing || '');
    } catch {}
    try {
      const kk = klingAiService.getAccessKey();
      const ks = klingAiService.getSecretKey();
      setKlingAccessExisting(kk || null);
      setKlingAccessKey(kk || '');
      setKlingSecretKey(ks || '');
    } catch {}
  }, []);

  const handleAdd = () => {
    const trimmed = newKey.trim();
    if (!trimmed) {
      onToast('Please enter an API key.', 'error');
      return;
    }
    apiKeyService.addKey(trimmed);
    setNewKey('');
    refresh();
    onToast('API key added.', 'success');
  };

  const handleUse = (index: number) => {
    apiKeyService.setActiveKey(index);
    refresh();
    const key = apiKeyService.getActiveKey();
    if (key) {
      onToast(`Switched to API key ${maskKey(key)}`, 'success');
    }
  };

  const handleRemove = (index: number) => {
    apiKeyService.removeKey(index);
    refresh();
  };

  const handleSaveDeepAi = () => {
    const k = deepAiKey.trim();
    if (!k) {
      onToast('Please enter a DeepAI API key.', 'error');
      return;
    }
    try {
      deepAiService.setApiKey(k);
      setDeepAiExisting(k);
      onToast('DeepAI API key saved.', 'success');
    } catch (e) {
      onToast('Failed to save DeepAI API key.', 'error');
    }
  };

  const handleClearDeepAi = () => {
    try {
      deepAiService.clearApiKey();
      setDeepAiExisting(null);
      setDeepAiKey('');
      onToast('DeepAI API key cleared.', 'success');
    } catch (e) {
      onToast('Failed to clear DeepAI API key.', 'error');
    }
  };

  const handleSaveKling = () => {
    if (!klingAccessKey.trim()) {
      onToast('Please enter a KlingAI Access Key.', 'error');
      return;
    }
    if (!klingSecretKey.trim()) {
      onToast('Please enter a KlingAI Secret Key.', 'error');
      return;
    }
    try {
      klingAiService.setAccessKey(klingAccessKey.trim());
      klingAiService.setSecretKey(klingSecretKey.trim());
      setKlingAccessExisting(klingAccessKey.trim());
      onToast('KlingAI settings saved.', 'success');
    } catch {
      onToast('Failed to save KlingAI settings.', 'error');
    }
  };

  const handleClearKling = () => {
    try {
      klingAiService.clearAccessKey();
      klingAiService.clearSecretKey();
      setKlingAccessExisting(null);
      setKlingAccessKey('');
      setKlingSecretKey('');
      onToast('KlingAI settings cleared.', 'success');
    } catch {
      onToast('Failed to clear KlingAI settings.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 p-4">
      <div className="max-w-xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-center text-purple-300">API Key Management</h2>
        {keys.length === 0 ? (
          <p className="mb-4">No API keys available.</p>
        ) : (
          <ul className="space-y-2 mb-6">
            {keys.map((key, idx) => (
              <li key={idx} className="flex items-center justify-between bg-gray-800 p-3 rounded">
                <span>{maskKey(key)}{idx === activeIndex && ' (active)'}</span>
                <div className="space-x-2">
                  {idx !== activeIndex && (
                    <button onClick={() => handleUse(idx)} className="bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded text-sm">Use</button>
                  )}
                  <button onClick={() => handleRemove(idx)} className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-sm">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            placeholder="Enter new API key"
            className="flex-grow bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button onClick={handleAdd} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">Add</button>
        </div>

        <div className="mb-8 border-t border-gray-700 pt-6">
          <h3 className="text-xl font-semibold mb-3 text-purple-300">DeepAI API Key</h3>
          <p className="text-sm text-gray-400 mb-3">Used when selecting image model "deepai-text2img".</p>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={deepAiKey}
              onChange={e => setDeepAiKey(e.target.value)}
              placeholder="Enter DeepAI API key"
              className="flex-grow bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button onClick={handleSaveDeepAi} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Save</button>
            <button onClick={handleClearDeepAi} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Clear</button>
          </div>
          {deepAiExisting && (
            <div className="text-sm text-gray-400">Current: {maskKey(deepAiExisting)}</div>
          )}
        </div>

        <div className="mb-8 border-t border-gray-700 pt-6">
          <h3 className="text-xl font-semibold mb-3 text-purple-300">KlingAI Settings</h3>
          <p className="text-sm text-gray-400 mb-3">Used when selecting image model "kling-v2-1". Enter your Access Key and Secret Key. Endpoint is preconfigured.</p>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={klingAccessKey}
              onChange={e => setKlingAccessKey(e.target.value)}
              placeholder="Enter KlingAI Access Key"
              className="flex-grow bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex gap-2 mb-2">
            <input
              type="password"
              value={klingSecretKey}
              onChange={e => setKlingSecretKey(e.target.value)}
              placeholder="Enter KlingAI Secret Key"
              className="flex-grow bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex gap-2 mb-2">
            <button onClick={handleSaveKling} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Save</button>
            <button onClick={handleClearKling} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Clear</button>
          </div>
          {(klingAccessExisting) && (
            <div className="text-sm text-gray-400">
              {klingAccessExisting && <>Access Key: {maskKey(klingAccessExisting)}<br/></>}
            </div>
          )}
        </div>
        <div className="text-center">
          <button onClick={onBack} className="underline">Back</button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyManager;

