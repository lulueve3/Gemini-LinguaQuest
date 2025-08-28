import React, { useEffect, useState } from 'react';
import apiKeyService from '../services/apiKeyService';

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

  const refresh = () => {
    const all = apiKeyService.getKeys();
    setKeys(all);
    const activeKey = apiKeyService.getActiveKey();
    const idx = all.findIndex(k => k === activeKey);
    setActiveIndex(idx === -1 ? 0 : idx);
  };

  useEffect(() => {
    refresh();
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
        <div className="text-center">
          <button onClick={onBack} className="underline">Back</button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyManager;

