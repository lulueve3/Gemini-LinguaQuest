import React, { useMemo, useState } from "react";
import { EquipmentItem, SkillItem, CharacterStatus, WorldMeta, GameTag, RelationshipEdge, RelationshipType, CharacterProfile, CharacterAttributeField } from "../types";
import { buildCharacterSchema } from "../services/worldSchema";

interface Limits {
  maxEquipped: number;
  maxEquippedSkills: number;
  maxInventory: number;
  maxSkills: number;
  maxApplyChangePerStep: number;
}

interface Props {
  equipment: EquipmentItem[];
  skills: SkillItem[];
  status?: CharacterStatus;
  limits: Limits;
  applyChangeRemaining: number;
  onApply: (equipment: EquipmentItem[], skills: SkillItem[]) => void;
  onApplyAndChange: (equipment: EquipmentItem[], skills: SkillItem[]) => void;
  onClose: () => void;
  worldMeta: WorldMeta;
  progressSummary: string;
  tags?: GameTag[];
  characters?: CharacterProfile[];
  relationships?: RelationshipEdge[];
  onUpdateRelationships?: (rels: RelationshipEdge[]) => void;
}

const CharacterProfileView: React.FC<Props> = ({
  equipment,
  skills,
  status,
  limits,
  applyChangeRemaining,
  onApply,
  onApplyAndChange,
  onClose,
  worldMeta,
  progressSummary,
  tags,
  characters,
  relationships = [],
  onUpdateRelationships,
}) => {
  const [localEquip, setLocalEquip] = useState<EquipmentItem[]>(equipment);
  const [localSkills, setLocalSkills] = useState<SkillItem[]>(
    skills.map((s) => ({ ...s, equipped: s.equipped ?? s.isActive ?? false }))
  );
  const [showHelp, setShowHelp] = useState(false);
  const [showWorld, setShowWorld] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  
  const [lastDeleted, setLastDeleted] = useState<{
    type: "equip" | "skill";
    index: number;
    item: EquipmentItem | SkillItem;
  } | null>(null);

  const equippedCount = useMemo(
    () => localEquip.filter((e) => e.equipped).length,
    [localEquip]
  );
  const equippedSkillCount = useMemo(
    () => localSkills.filter((s) => s.equipped).length,
    [localSkills]
  );

  const attributeSchema = useMemo(() => buildCharacterSchema(tags), [tags]);
  const [extraFields, setExtraFields] = useState<CharacterAttributeField[]>([]);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState<string>("");
  const effectiveSchema = useMemo(() => {
    const base = buildCharacterSchema(tags).filter(f => !hiddenKeys.includes(f.key));
    const dedup = new Map<string, CharacterAttributeField>();
    for (const f of base) dedup.set(f.key, f);
    for (const f of extraFields) dedup.set(f.key, f);
    return Array.from(dedup.values());
  }, [tags, hiddenKeys, extraFields]);

  const setTempMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  const toggleEquipItem = (idx: number) => {
    setLocalEquip((prev) => {
      const copy = [...prev];
      const current = copy[idx];
      const willEquip = !current.equipped;
      if (
        willEquip &&
        prev.filter((e) => e.equipped).length >= limits.maxEquipped
      ) {
        setTempMessage(`You can equip up to ${limits.maxEquipped} items.`);
        return prev;
      }
      copy[idx] = { ...current, equipped: willEquip };
      return copy;
    });
  };

  const toggleEquipSkill = (idx: number) => {
    setLocalSkills((prev) => {
      const copy = [...prev];
      const current = copy[idx];
      const willEquip = !(current.equipped ?? false);
      if (
        willEquip &&
        prev.filter((s) => s.equipped).length >= limits.maxEquippedSkills
      ) {
        setTempMessage(
          `You can equip up to ${limits.maxEquippedSkills} skills.`
        );
        return prev;
      }
      copy[idx] = { ...current, equipped: willEquip };
      return copy;
    });
  };

  const deleteEquip = (idx: number) => {
    const item = localEquip[idx];
    if (!window.confirm(`Delete item "${item.name}"?`)) return;
    const copy = [...localEquip];
    copy.splice(idx, 1);
    setLocalEquip(copy);
    setLastDeleted({ type: "equip", index: idx, item });
    setTempMessage("Item deleted. Click Undo to restore.");
  };

  const deleteSkill = (idx: number) => {
    const item = localSkills[idx];
    if (!window.confirm(`Delete skill "${item.name}"?`)) return;
    const copy = [...localSkills];
    copy.splice(idx, 1);
    setLocalSkills(copy);
    setLastDeleted({ type: "skill", index: idx, item });
    setTempMessage("Skill deleted. Click Undo to restore.");
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    if (lastDeleted.type === "equip") {
      const copy = [...localEquip];
      const insertAt = Math.min(lastDeleted.index, copy.length);
      copy.splice(insertAt, 0, lastDeleted.item as EquipmentItem);
      setLocalEquip(copy);
    } else {
      const copy = [...localSkills];
      const insertAt = Math.min(lastDeleted.index, copy.length);
      copy.splice(insertAt, 0, lastDeleted.item as SkillItem);
      setLocalSkills(copy);
    }
    setLastDeleted(null);
    setMessage(null);
  };

  const handleApply = () => {
    if (localEquip.length > limits.maxInventory) {
      setTempMessage(`Inventory exceeds ${limits.maxInventory}.`);
      return;
    }
    if (localSkills.length > limits.maxSkills) {
      setTempMessage(`Skills exceed ${limits.maxSkills}.`);
      return;
    }
    onApply(localEquip, localSkills);
  };

  const handleApplyAndChange = () => {
    if (applyChangeRemaining <= 0) {
      setTempMessage("No Apply & Change action remaining for this step.");
      return;
    }
    handleApply();
    onApplyAndChange(localEquip, localSkills);
  };

  // Drag & Drop for equipment
  const onDragStartEquip = (idx: number) => (ev: React.DragEvent) => {
    ev.dataTransfer.setData("text/plain", String(idx));
  };
  const allowDrop = (ev: React.DragEvent) => ev.preventDefault();
  const onDropToEquipped = (ev: React.DragEvent) => {
    ev.preventDefault();
    const raw = ev.dataTransfer.getData("text/plain");
    const idx = Number(raw);
    if (!Number.isFinite(idx)) return;
    setLocalEquip((prev) => {
      const copy = [...prev];
      const current = copy[idx];
      if (
        !current.equipped &&
        copy.filter((e) => e.equipped).length >= limits.maxEquipped
      ) {
        setTempMessage(`You can equip up to ${limits.maxEquipped} items.`);
        return prev;
      }
      copy[idx] = { ...current, equipped: true };
      return copy;
    });
  };
  const onDropToInventory = (ev: React.DragEvent) => {
    ev.preventDefault();
    const raw = ev.dataTransfer.getData("text/plain");
    const idx = Number(raw);
    if (!Number.isFinite(idx)) return;
    setLocalEquip((prev) => {
      const copy = [...prev];
      const current = copy[idx];
      copy[idx] = { ...current, equipped: false };
      return copy;
    });
  };

  const equippedItems = localEquip.filter((e) => e.equipped);
  const unequippedItems = localEquip.filter((e) => !e.equipped);

  return (
    <div className="p-4 md:p-8">
      <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-bold text-purple-300">
            Character Profile
          </h2>
          <button
            onClick={() => setShowHelp(true)}
            className="text-sm md:text-base bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded-lg"
          >
            Description
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleApply}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg"
          >
            Apply
          </button>
          <button
            onClick={handleApplyAndChange}
            disabled={applyChangeRemaining <= 0}
            className={`font-semibold py-2 px-4 rounded-lg ${
              applyChangeRemaining > 0
                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                : "bg-gray-700 text-gray-400 cursor-not-allowed"
            }`}
          >
            Apply & Change action ({applyChangeRemaining})
          </button>
          <button
            onClick={onClose}
            className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg"
          >
            Back to Game
          </button>
        </div>
      </div>

      {/* Toggle World Context */}
      <div className="mb-4">
        <button
          onClick={() => setShowWorld(v => !v)}
          className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg"
        >
          {showWorld ? 'Hide World Context' : 'Show World Context'}
        </button>
      </div>

      {/* Long-term World Context (read-only, above progress) */}
      {showWorld && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">World Context</h3>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-gray-300 mb-1">Long-term Summary</div>
              <div className="w-full bg-gray-800/40 border border-gray-700 rounded p-3 text-sm text-gray-300 min-h-[3rem] whitespace-pre-wrap">
                {worldMeta.longTermSummary || '—'}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-semibold mb-1">Key Events</div>
                <ul className="space-y-1 text-sm text-gray-300 bg-gray-800/40 rounded p-3 border border-gray-700 min-h-[3rem]">
                  {(worldMeta.keyEvents && worldMeta.keyEvents.length > 0) ? worldMeta.keyEvents.map((e, i) => (
                    <li key={`ke-${i}`}>• {e}</li>
                  )) : <li className="text-gray-500">—</li>}
                </ul>
              </div>
              <div>
                <div className="text-sm font-semibold mb-1">Key Characters</div>
                <ul className="space-y-1 text-sm text-gray-300 bg-gray-800/40 rounded p-3 border border-gray-700 min-h-[3rem]">
                  {(worldMeta.keyCharacters && worldMeta.keyCharacters.length > 0) ? worldMeta.keyCharacters.map((c, i) => (
                    <li key={`fc-${i}`}>• {c}</li>
                  )) : <li className="text-gray-500">—</li>}
                </ul>
              </div>
            </div>
            <p className="text-xs text-gray-500">World context is set at game start and not editable.</p>
          </div>
        </div>
      )}

      {/* Story Progress */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-2">Story Progress</h3>
        {progressSummary ? (
          <div className="bg-gray-800/50 p-3 rounded text-sm text-gray-300 whitespace-pre-wrap">
            {progressSummary}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No progress summary yet.</p>
        )}
      </div>

      {message && (
        <div className="mb-4 flex items-center gap-3 bg-gray-800/60 p-3 rounded border border-gray-700">
          <span>{message}</span>
          {lastDeleted && (
            <button onClick={undoDelete} className="text-sm underline">
              Undo
            </button>
          )}
        </div>
      )}

      {/* Status */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-2">Status</h3>
        {status ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {effectiveSchema.map((field) => {
              const key = field.key.toLowerCase();
              const baseMap: Record<string, number | string | undefined> = {
                health: status.health,
                stamina: status.stamina,
                morale: status.morale,
              };
              const raw = key in baseMap ? baseMap[key] : status.custom?.[key];
              if (field.kind === 'bar') {
                const num = typeof raw === 'number' ? raw : undefined;
                return <StatBar key={field.key} label={field.label} value={num} />;
              }
              return (
                <div key={field.key} className="bg-gray-800/50 p-3 rounded text-sm text-gray-300">
                  <div className="flex justify-between"><span>{field.label}</span><span className="text-gray-400">{String(raw ?? '—')}</span></div>
                </div>
              );
            })}
            {status.conditions && status.conditions.length > 0 && (
              <div className="md:col-span-3 bg-gray-800/50 p-3 rounded">
                <div className="text-sm text-gray-300">
                  Conditions: <span className="text-gray-400">{status.conditions.join(", ")}</span>
                </div>
              </div>
            )}
            {status.notes && (
              <div className="md:col-span-3 bg-gray-800/50 p-3 rounded text-sm text-gray-300">
                {status.notes}
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No status available for this step.</p>
        )}
        {/* Manage Stats Schema */}
        <div className="mt-3 bg-gray-800/40 border border-gray-700 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-gray-200">Manage Stats</div>
          </div>
          <div className="text-xs text-gray-400 mb-2">Add or remove displayed stats. Values come from the story steps; this only controls visibility.</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
            {effectiveSchema.map(f => (
              <div key={`m-${f.key}`} className="flex items-center justify-between bg-gray-900/40 border border-gray-700 rounded px-2 py-1">
                <span className="text-sm text-gray-200">{f.label}</span>
                <button
                  className="text-xs bg-red-700 hover:bg-red-600 text-white rounded px-2 py-0.5"
                  onClick={() => setHiddenKeys(prev => prev.includes(f.key) ? prev : [...prev, f.key])}
                >Remove</button>
              </div>
            ))}
            {effectiveSchema.length === 0 && (
              <div className="text-xs text-gray-500">No stats selected. Use tags or add custom.</div>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newFieldLabel}
              onChange={(e) => setNewFieldLabel(e.target.value)}
              placeholder="Add custom stat (e.g., Mana)"
              className="flex-grow bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
            />
            <button
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1"
              onClick={() => {
                const lbl = newFieldLabel.trim();
                if (!lbl) return;
                const key = lbl.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
                if (!key) return;
                setHiddenKeys(prev => prev.filter(k => k !== key));
                setExtraFields(prev => prev.some(f => f.key === key) ? prev : [...prev, { key, label: lbl, kind: 'bar' }]);
                setNewFieldLabel('');
              }}
            >Add</button>
            <button
              className="text-sm bg-gray-700 hover:bg-gray-600 text-white rounded px-3 py-1"
              onClick={() => { setHiddenKeys([]); setExtraFields([]); }}
            >Reset</button>
          </div>
        </div>
      </div>

      {/* Inventory (Kho đồ) */}
      <div className="mb-8">
        <div className="flex items-end justify-between mb-2">
          <h3 className="text-xl font-semibold">Inventory</h3>
          <div className="text-sm text-gray-400">
            {localEquip.length}/{limits.maxInventory} items • Equipped:{" "}
            {equippedCount}/{limits.maxEquipped}
          </div>
        </div>

        {/* Equipped row */}
        <div className="mb-3" onDragOver={allowDrop} onDrop={onDropToEquipped}>
          <div className="text-sm text-gray-300 mb-1">Equipped</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {equippedItems.map((item, idx) => (
              <Tile
                key={`eq-${idx}`}
                title={item.name}
                subtitle={`x${item.quantity ?? 1}`}
                detail={item.description}
                onToggle={() => toggleEquipItem(localEquip.indexOf(item))}
                equipped
                onDelete={() => deleteEquip(localEquip.indexOf(item))}
                draggable
                onDragStart={onDragStartEquip(localEquip.indexOf(item))}
              />
            ))}
            {equippedItems.length === 0 && (
              <div className="text-gray-500 text-sm">No equipped items.</div>
            )}
          </div>
        </div>

        <div onDragOver={allowDrop} onDrop={onDropToInventory}>
          <div className="text-sm text-gray-300 mb-1">Inventory</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {unequippedItems.map((item, idx) => (
              <Tile
                key={`inv-${idx}`}
                title={item.name}
                subtitle={`x${item.quantity ?? 1}`}
                detail={item.description}
                onToggle={() => toggleEquipItem(localEquip.indexOf(item))}
                onDelete={() => deleteEquip(localEquip.indexOf(item))}
                draggable
                onDragStart={onDragStartEquip(localEquip.indexOf(item))}
              />
            ))}
            {unequippedItems.length === 0 && (
              <div className="text-gray-500 text-sm">
                No items in inventory.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Relationships */}
      {onUpdateRelationships && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-semibold">Relationships</h3>
            <button
              onClick={() => {
                if (!characters || characters.length === 0) return;
                const known = new Set(relationships.map(r => r.with.toLowerCase()));
                const candidate = characters.find(c => !known.has(c.name.toLowerCase()));
                if (!candidate) return;
                const next: RelationshipEdge = { with: candidate.name, type: 'friend', affection: 0, trust: 0, loyalty: 0, jealousy: 0, lastUpdated: new Date().toISOString() };
                onUpdateRelationships([...relationships, next]);
              }}
              className="bg-gray-700 hover:bg-gray-600 text-white py-1.5 px-3 rounded"
            >
              Add Relationship
            </button>
          </div>
          {relationships.length === 0 ? (
            <p className="text-gray-500 text-sm">No relationships tracked yet.</p>
          ) : (
            <div className="space-y-3">
              {relationships.map((rel, idx) => (
                <RelationshipItem
                  key={`${rel.with}-${idx}`}
                  rel={rel}
                  onChange={(updated) => {
                    const copy = [...relationships];
                    copy[idx] = { ...updated, lastUpdated: new Date().toISOString() };
                    onUpdateRelationships(copy);
                  }}
                  onDelete={() => {
                    const copy = relationships.filter((_, i) => i !== idx);
                    onUpdateRelationships(copy);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Skills */}
      <div className="mb-2">
        <div className="flex items-end justify-between mb-2">
          <h3 className="text-xl font-semibold">Skills</h3>
          <div className="text-sm text-gray-400">
            {localSkills.length}/{limits.maxSkills} • Equipped:{" "}
            {equippedSkillCount}/{limits.maxEquippedSkills}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {localSkills
            .map((s, i) => ({ s, i }))
            .sort((a, b) => Number(!!b.s.equipped) - Number(!!a.s.equipped))
            .map(({ s, i }) => (
              <Tile
                key={`sk-${i}`}
                title={`${s.name} (Lv ${s.level})`}
                subtitle={s.equipped ? "Equipped" : "—"}
                detail={s.description || ""}
                equipped={!!s.equipped}
                onToggle={() => toggleEquipSkill(i)}
                onDelete={() => deleteSkill(i)}
              />
            ))}
          {localSkills.length === 0 && (
            <div className="text-gray-500 text-sm">No skills.</div>
          )}
        </div>
      </div>

      {/* Description Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg border border-gray-700 max-w-xl w-full p-5">
            <h4 className="text-lg font-bold mb-2">Description</h4>
            <div className="space-y-2 text-sm text-gray-300">
              <p>
                Inventory holds up to {limits.maxInventory} items; Skills up to{" "}
                {limits.maxSkills}.
              </p>
              <p>
                You can equip at most {limits.maxEquipped} items and{" "}
                {limits.maxEquippedSkills} skills at once.
              </p>
              <p>
                Use Apply to save changes. Use Apply & Change action to generate
                4 new options based on the current context and your equipped
                items/skills. Max {limits.maxApplyChangePerStep} uses per step.
              </p>
              <p>
                Drag items between Inventory and the Equipped row. For skills,
                equipped ones are shown first; click a skill to equip/unequip.
              </p>
              <p>
                Use X to delete an item/skill (Undo available after deletion).
              </p>
              <p>Click the ! button or hover to view detailed descriptions.</p>
            </div>
            <div className="mt-4 text-right">
              <button
                onClick={() => setShowHelp(false)}
                className="bg-gray-700 hover:bg-gray-600 text-white py-1.5 px-4 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterProfileView;

const StatBar: React.FC<{ label: string; value?: number }> = ({
  label,
  value,
}) => {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="bg-gray-800/50 p-3 rounded">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-400">{value ?? "—"}</span>
      </div>
      <div className="h-2 bg-gray-700 rounded">
        <div
          className="h-2 bg-purple-600 rounded"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const RelationshipItem: React.FC<{
  rel: RelationshipEdge;
  onChange: (rel: RelationshipEdge) => void;
  onDelete: () => void;
}> = ({ rel, onChange, onDelete }) => {
  const types: RelationshipType[] = ['friend','rival','romance','family','teammate','mentor','enemy','haremCandidate'];
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  return (
    <div className="border border-gray-700 rounded p-3 bg-gray-800/40">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-purple-300 truncate">{rel.with}</div>
        <div className="flex items-center gap-2">
          <select
            value={rel.type}
            onChange={(e) => onChange({ ...rel, type: e.target.value as RelationshipType })}
            className="bg-gray-800 border border-gray-700 rounded text-sm px-2 py-1"
          >
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={onDelete} className="text-xs bg-red-700 hover:bg-red-600 text-white rounded px-2 py-1">Delete</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          { k: 'affection', label: 'Affection' },
          { k: 'trust', label: 'Trust' },
          { k: 'loyalty', label: 'Loyalty' },
          { k: 'jealousy', label: 'Jealousy' },
        ].map(({ k, label }) => (
          <div key={k} className="text-sm">
            <div className="flex justify-between text-gray-300 mb-1">
              <span>{label}</span>
              <span className="text-gray-400">{typeof (rel as any)[k] === 'number' ? (rel as any)[k] : 0}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={typeof (rel as any)[k] === 'number' ? (rel as any)[k] : 0}
              onChange={(e) => onChange({ ...rel, [k]: clamp(Number(e.target.value)) } as RelationshipEdge)}
              className="w-full"
            />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <textarea
          placeholder="Notes"
          value={rel.notes || ''}
          onChange={(e) => onChange({ ...rel, notes: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-gray-200"
          rows={2}
        />
      </div>
    </div>
  );
};

const Tile: React.FC<{
  title: string;
  subtitle?: string;
  detail?: string;
  onToggle?: () => void;
  equipped?: boolean;
  onDelete?: () => void;
  draggable?: boolean;
  onDragStart?: (ev: React.DragEvent) => void;
}> = ({
  title,
  subtitle,
  detail,
  onToggle,
  equipped,
  onDelete,
  draggable,
  onDragStart,
}) => {
  const [showDetail, setShowDetail] = useState(false);
  return (
    <div
      className={`group relative border rounded p-2 text-sm ${
        equipped
          ? "border-purple-600 bg-purple-900/10"
          : "border-gray-700 bg-gray-800/40"
      }`}
      title={detail || ""}
      draggable={!!draggable}
      onDragStart={onDragStart}
    >
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{title}</div>
          {subtitle && (
            <div className="text-xs text-gray-400 truncate">{subtitle}</div>
          )}
        </div>
        <div className="flex gap-1 items-start">
          <button
            onClick={() => setShowDetail((v) => !v)}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-white rounded px-1"
          >
            !
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-xs bg-red-700 hover:bg-red-600 text-white rounded px-1"
            >
              X
            </button>
          )}
        </div>
      </div>
      {detail && showDetail && (
        <div className="mt-2 text-xs text-gray-300">{detail}</div>
      )}
      {onToggle && (
        <button
          onClick={onToggle}
          className={`mt-2 w-full text-center rounded py-1 ${
            equipped
              ? "bg-purple-600 hover:bg-purple-700 text-white"
              : "bg-gray-700 hover:bg-gray-600 text-gray-100"
          }`}
        >
          {equipped ? "Unequip" : "Equip"}
        </button>
      )}
    </div>
  );
};

// (read-only UI — editor removed)
