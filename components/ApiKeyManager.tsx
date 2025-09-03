import React, { useEffect, useState } from 'react';
import apiKeyService from '../services/apiKeyService';
import deepAiService from '../services/deepAiService';
import klingAiService from '../services/klingAiService';
import imageFxService from '../services/imageFxService';

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
  // ImageFX state
  const [imageFxToken, setImageFxToken] = useState<string>('');
  const [imageFxExisting, setImageFxExisting] = useState<string | null>(null);
  // Test loading states
  const [testingDeepAi, setTestingDeepAi] = useState(false);
  const [testingKling, setTestingKling] = useState(false);
  const [testingImageFx, setTestingImageFx] = useState(false);
  // Collapse states (default hidden)
  const [openGemini, setOpenGemini] = useState(false);
  const [openDeepAi, setOpenDeepAi] = useState(false);
  const [openKling, setOpenKling] = useState(false);
  const [openImageFx, setOpenImageFx] = useState(false);

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
    try {
      const t = imageFxService.getAuthToken();
      setImageFxExisting(t || null);
      setImageFxToken(t || '');
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

  const handleSaveImageFx = () => {
    const t = imageFxToken.trim();
    if (!t) {
      onToast('Please enter an ImageFX authentication token.', 'error');
      return;
    }
    try {
      imageFxService.setAuthToken(t);
      setImageFxExisting(t);
      onToast('ImageFX token saved.', 'success');
    } catch {
      onToast('Failed to save ImageFX token.', 'error');
    }
  };

  const handleClearImageFx = () => {
    try {
      imageFxService.clearAuthToken();
      setImageFxExisting(null);
      setImageFxToken('');
      onToast('ImageFX token cleared.', 'success');
    } catch {
      onToast('Failed to clear ImageFX token.', 'error');
    }
  };

  const openPreview = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Revoke later to avoid memory leaks
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleTestDeepAi = async () => {
    setTestingDeepAi(true);
    try {
      const blob = await deepAiService.generateImageWithDeepAI('Test image: purple cat, digital art');
      openPreview(blob);
      onToast('DeepAI image generated. Preview opened.', 'success');
    } catch (e) {
      onToast((e as Error).message || 'DeepAI test failed.', 'error');
    } finally {
      setTestingDeepAi(false);
    }
  };

  const handleTestKling = async () => {
    setTestingKling(true);
    try {
      const blob = await klingAiService.generateImageWithKling('Test image: purple cat, digital art');
      openPreview(blob);
      onToast('KlingAI image generated. Preview opened.', 'success');
    } catch (e) {
      onToast((e as Error).message || 'KlingAI test failed.', 'error');
    } finally {
      setTestingKling(false);
    }
  };

  const handleTestImageFx = async () => {
    setTestingImageFx(true);
    try {
      const blob = await imageFxService.generateImageWithImageFx('Test image: purple cat, digital art');
      openPreview(blob);
      onToast('ImageFX image generated. Preview opened.', 'success');
    } catch (e) {
      onToast((e as Error).message || 'ImageFX test failed.', 'error');
    } finally {
      setTestingImageFx(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 p-4">
      <div className="max-w-xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-center text-purple-300">API Key Management</h2>
        {/* Gemini API (Google GenAI) */}
        <div className="mb-6 border border-gray-700 rounded">
          <button
            className="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-t flex justify-between items-center"
            onClick={() => setOpenGemini(v => !v)}
          >
            <span className="text-lg font-semibold text-purple-300">Gemini API (Google GenAI)</span>
            <span className="text-gray-400">{openGemini ? '▲' : '▼'}</span>
          </button>
          {openGemini && (
            <div className="p-4 border-t border-gray-700">
              <p className="text-sm text-gray-400 mb-3">Google GenAI (Gemini/Imagen). Free quota if you use Google AI Studio (https://aistudio.google.com). Manage multiple keys below.</p>
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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKey}
                  onChange={e => setNewKey(e.target.value)}
                  placeholder="Enter new API key"
                  className="flex-grow bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button onClick={handleAdd} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">Add</button>
              </div>
            </div>
          )}
        </div>

        {/* ImageFX (second) */}
        <div className="mb-6 border border-gray-700 rounded">
          <button
            className="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-t flex justify-between items-center"
            onClick={() => setOpenImageFx(v => !v)}
          >
            <span className="text-lg font-semibold text-purple-300">ImageFX Token</span>
            <span className="text-gray-400">{openImageFx ? '▲' : '▼'}</span>
          </button>
          {openImageFx && (
            <div className="p-4 border-t border-gray-700">
              <p className="text-sm text-gray-400 mb-3">ImageFX is free. Used when selecting image model "imagefx-api". Provide the authentication token from labs.google ImageFX.</p>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={imageFxToken}
                  onChange={e => setImageFxToken(e.target.value)}
                  placeholder="Enter ImageFX authentication token"
                  className="flex-grow bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button onClick={handleSaveImageFx} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Save</button>
                <button onClick={handleClearImageFx} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Clear</button>
                <button onClick={handleTestImageFx} disabled={testingImageFx} className="bg-green-600 hover:bg-green-700 disabled:bg-green-900 text-white font-bold py-2 px-4 rounded">{testingImageFx ? 'Testing...' : 'Test'}</button>
              </div>
              {imageFxExisting && (
                <div className="text-sm text-gray-400">Current: {maskKey(imageFxExisting)}</div>
              )}
              <div className="text-xs text-gray-500 mt-2">How to get ImageFX token:
                <ol className="list-decimal list-inside mt-1 space-y-1">
                  <li>Open https://labs.google/fx/tools/image-fx (login required)</li>
                  <li>Open DevTools Console</li>
                  <li>Paste the snippet below to copy token</li>
                </ol>
                <pre className="mt-2 bg-gray-800 p-2 rounded text-gray-300 text-xs overflow-auto"><code>{`let script = document.querySelector("#__NEXT_DATA__");
let obj = JSON.parse(script.textContent);
let authToken = obj["props"]["pageProps"]["session"]["access_token"];
window.prompt("Copy the auth token: ", authToken);`}</code></pre>
                <div className="mt-2">Note: This uses an unofficial API and may fail due to CORS or regional restrictions.</div>
              </div>
            </div>
          )}
        </div>

        {/* DeepAI (third) */}
        <div className="mb-6 border border-gray-700 rounded">
          <button
            className="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-t flex justify-between items-center"
            onClick={() => setOpenDeepAi(v => !v)}
          >
            <span className="text-lg font-semibold text-purple-300">DeepAI API Key</span>
            <span className="text-gray-400">{openDeepAi ? '▲' : '▼'}</span>
          </button>
          {openDeepAi && (
            <div className="p-4 border-t border-gray-700">
              <p className="text-sm text-gray-400 mb-3">DeepAI requires a paid API key. Used when selecting image model "deepai-text2img".</p>
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
                <button onClick={handleTestDeepAi} disabled={testingDeepAi} className="bg-green-600 hover:bg-green-700 disabled:bg-green-900 text-white font-bold py-2 px-4 rounded">{testingDeepAi ? 'Testing...' : 'Test'}</button>
              </div>
              {deepAiExisting && (
                <div className="text-sm text-gray-400">Current: {maskKey(deepAiExisting)}</div>
              )}
            </div>
          )}
        </div>

        {/* KlingAI (fourth) */}
        <div className="mb-6 border border-gray-700 rounded">
          <button
            className="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-t flex justify-between items-center"
            onClick={() => setOpenKling(v => !v)}
          >
            <span className="text-lg font-semibold text-purple-300">KlingAI Settings</span>
            <span className="text-gray-400">{openKling ? '▲' : '▼'}</span>
          </button>
          {openKling && (
            <div className="p-4 border-t border-gray-700">
              <p className="text-sm text-gray-400 mb-3">KlingAI requires paid Access/Secret keys. Used when selecting image model "kling-v2-1".</p>
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
                <button onClick={handleTestKling} disabled={testingKling} className="bg-green-600 hover:bg-green-700 disabled:bg-green-900 text-white font-bold py-2 px-4 rounded">{testingKling ? 'Testing...' : 'Test'}</button>
              </div>
              {(klingAccessExisting) && (
                <div className="text-sm text-gray-400">
                  {klingAccessExisting && <>Access Key: {maskKey(klingAccessExisting)}<br/></>}
                </div>
              )}
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

