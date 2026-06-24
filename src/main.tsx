import React from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowUp, CopyPlus, Download, FileDown, Plus, Save, Trash2 } from 'lucide-react';
import './styles.css';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type PacketSummary = {
  id: string;
  file_name: string;
  literature_uuid?: string;
  reaction_id?: string;
  target_name?: string;
};

type ParameterDef = {
  key: string;
  name?: string | null;
  category?: string | null;
  required: boolean;
  description?: string | null;
  meta_data?: Record<string, JsonValue>;
};

type ParameterValue = {
  value: JsonValue;
  raw?: string | null;
  unit?: string | null;
  source?: string;
  required_by_platform?: boolean;
  review_status?: string;
};

type ReviewStep = {
  review_step_id: string;
  source_operation_orders?: number[];
  source_text?: string;
  platform?: string | null;
  operation?: string | null;
  materials?: JsonObject[];
  parameters?: Record<string, ParameterValue>;
  review_questions?: JsonObject[];
  review_status?: string;
};

type ReviewPacket = {
  schema_version?: number;
  literature_uuid?: string;
  reaction: {
    reaction_id?: string;
    reaction_smiles?: string;
    target?: { name?: string; smiles?: string };
    confidence?: number;
  };
  platform_review_steps: ReviewStep[];
  notes?: JsonValue[];
  metadata?: JsonObject;
};

type RegistryRecord = {
  platform?: string;
  name?: string;
  operation?: string;
  properties?: Array<{ properties?: ParameterDef[] }>;
};

const DATA_BASE = './data';
const STORAGE_PREFIX = 'autochemex-review:';

function App() {
  const [packets, setPackets] = React.useState<PacketSummary[]>([]);
  const [selectedId, setSelectedId] = React.useState('');
  const [packet, setPacket] = React.useState<ReviewPacket | null>(null);
  const [basePacket, setBasePacket] = React.useState<ReviewPacket | null>(null);
  const [registry, setRegistry] = React.useState<RegistryRecord[]>([]);
  const [activeTab, setActiveTab] = React.useState<'form' | 'json' | 'errors'>('form');
  const [jsonDraft, setJsonDraft] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [errors, setErrors] = React.useState<JsonObject[]>([]);

  const platforms = React.useMemo(() => platformOptions(registry), [registry]);

  React.useEffect(() => {
    loadInitialData();
  }, []);

  React.useEffect(() => {
    if (!selectedId) return;
    loadPacket(selectedId);
  }, [selectedId]);

  async function loadInitialData() {
    const [index, registryPayload] = await Promise.all([
      fetchJson<{ packets: PacketSummary[] }>(`${DATA_BASE}/review_packet_index.json`),
      fetchJson<RegistryRecord[]>(`${DATA_BASE}/parsed_parameter_registry.json`),
    ]);
    setPackets(index.packets || []);
    setRegistry(Array.isArray(registryPayload) ? registryPayload : []);
    if (index.packets?.length) setSelectedId(index.packets[0].id);
  }

  async function loadPacket(packetId: string) {
    const base = await fetchJson<ReviewPacket>(`${DATA_BASE}/review_packets/${encodeURIComponent(packetId)}`);
    const stored = readStoredPacket(packetId);
    const data = stored ? protectImmutableFields(stored, base) : base;
    setBasePacket(base);
    setPacket(data);
    setJsonDraft(JSON.stringify(data, null, 2));
    setErrors([]);
    setMessage(stored ? 'Loaded local draft.' : '');
  }

  function updatePacket(next: ReviewPacket) {
    setPacket(next);
    setJsonDraft(JSON.stringify(next, null, 2));
  }

  function updateReaction(path: 'reaction_smiles' | 'target.name' | 'target.smiles', value: string) {
    if (!packet) return;
    const next = structuredClone(packet);
    if (path === 'reaction_smiles') next.reaction.reaction_smiles = value;
    if (path === 'target.name') next.reaction.target = { ...(next.reaction.target || {}), name: value };
    if (path === 'target.smiles') next.reaction.target = { ...(next.reaction.target || {}), smiles: value };
    updatePacket(next);
  }

  function updateStep(index: number, step: ReviewStep) {
    if (!packet) return;
    const next = structuredClone(packet);
    next.platform_review_steps[index] = step;
    updatePacket(next);
  }

  function changeOperation(index: number, platform: string, operation: string) {
    if (!packet) return;
    const params = platform && operation ? parameterStub(registry, platform, operation) : {};
    const next = structuredClone(packet);
    next.platform_review_steps[index] = {
      ...next.platform_review_steps[index],
      platform,
      operation,
      parameters: mergeParameters(params, next.platform_review_steps[index].parameters || {}),
    };
    updatePacket(next);
  }

  function moveStep(index: number, delta: number) {
    if (!packet) return;
    const target = index + delta;
    if (target < 0 || target >= packet.platform_review_steps.length) return;
    const next = structuredClone(packet);
    const [item] = next.platform_review_steps.splice(index, 1);
    next.platform_review_steps.splice(target, 0, item);
    updatePacket(next);
  }

  function addStep(afterIndex?: number) {
    if (!packet) return;
    const next = structuredClone(packet);
    const step: ReviewStep = {
      review_step_id: `step_${Date.now()}`,
      source_operation_orders: [],
      source_text: '',
      platform: '',
      operation: '',
      materials: [],
      parameters: {},
      review_questions: [],
      review_status: 'needs_review',
    };
    const index = afterIndex === undefined ? next.platform_review_steps.length : afterIndex + 1;
    next.platform_review_steps.splice(index, 0, step);
    updatePacket(next);
  }

  function duplicateStep(index: number) {
    if (!packet) return;
    const next = structuredClone(packet);
    const copy = structuredClone(next.platform_review_steps[index]);
    copy.review_step_id = `step_${Date.now()}`;
    next.platform_review_steps.splice(index + 1, 0, copy);
    updatePacket(next);
  }

  function deleteStep(index: number) {
    if (!packet) return;
    const next = structuredClone(packet);
    next.platform_review_steps.splice(index, 1);
    updatePacket(next);
  }

  function applyJsonDraft() {
    try {
      const parsed = JSON.parse(jsonDraft) as ReviewPacket;
      const protectedPacket = basePacket ? protectImmutableFields(parsed, basePacket) : parsed;
      setPacket(protectedPacket);
      setJsonDraft(JSON.stringify(protectedPacket, null, 2));
      setMessage('JSON applied. Reaction ID and original source text were preserved.');
    } catch (error) {
      setMessage(`Invalid JSON: ${String(error)}`);
    }
  }

  function validateCurrent() {
    if (!packet) return [];
    const result = validatePacket(packet, registry);
    setErrors(result);
    return result;
  }

  function saveDraft(): ReviewPacket | null {
    if (!packet || !selectedId) return null;
    const protectedPacket = basePacket ? protectImmutableFields(packet, basePacket) : packet;
    setPacket(protectedPacket);
    setJsonDraft(JSON.stringify(protectedPacket, null, 2));
    const validationErrors = validatePacket(protectedPacket, registry);
    setErrors(validationErrors);
    if (validationErrors.length) {
      setActiveTab('errors');
      setMessage('Validation found issues. You can still export after reviewing them.');
    } else {
      setMessage('Draft saved in this browser.');
    }
    localStorage.setItem(storageKey(selectedId), JSON.stringify(protectedPacket));
    setPackets((items) => [...items]);
    return protectedPacket;
  }

  function downloadCurrent() {
    if (!packet || !selectedId) return;
    const protectedPacket = saveDraft();
    if (protectedPacket) downloadJson(reviewedFileName(selectedId), protectedPacket);
  }

  function downloadBundle() {
    const reviewed = packets
      .map((item) => ({ id: item.id, packet: readStoredPacket(item.id) }))
      .filter((item): item is { id: string; packet: ReviewPacket } => Boolean(item.packet));
    downloadJson('reviewed_packets_bundle.json', {
      exported_at: new Date().toISOString(),
      packet_count: reviewed.length,
      reviewed_packets: reviewed,
    });
  }

  const selectedSummary = packets.find((item) => item.id === selectedId);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-title">Review Packets</div>
        <div className="sidebar-note">Local edits stay in this browser until downloaded.</div>
        <div className="packet-list">
          {packets.map((item) => (
            <button key={item.id} className={`packet-item ${selectedId === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}>
              <span className="packet-name">{item.reaction_id || item.file_name}</span>
              {item.target_name && <span className="packet-target">{item.target_name}</span>}
              <span className="packet-meta">{hasStoredPacket(item.id) ? 'draft saved' : 'not reviewed'}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="main">
        <header className="toolbar">
          <div>
            <div className="title">AutoChemEx Expert Review</div>
            <div className="subtle">{packet?.literature_uuid || selectedSummary?.file_name || 'No packet selected'}</div>
          </div>
          <div className="toolbar-actions">
            <button onClick={validateCurrent}>Validate</button>
            <button onClick={saveDraft}><Save size={16} /> Save draft</button>
            <button className="primary" onClick={downloadCurrent}><Download size={16} /> Download JSON</button>
            <button onClick={downloadBundle}><FileDown size={16} /> Download bundle</button>
          </div>
        </header>

        <section className="review-guide">
          <div>
            <strong>Review flow</strong>
            <span>先核对反应背景，再逐步检查平台步骤和参数。黄色的“待补充”表示平台必填但尚缺值；只有确认当前步骤不需要该参数时，才勾选“本步骤无需此参数”。</span>
          </div>
          <div>
            <strong>Saving</strong>
            <span>Save draft 只保存在当前浏览器；提交给维护者时请使用 Download JSON 或 Download bundle。</span>
          </div>
        </section>

        {message && <div className="message">{message}</div>}

        {packet && (
          <>
            <section className="reaction-panel">
              <Field label="Reaction ID" value={packet.reaction.reaction_id || ''} readOnly />
              <Field label="Target name" value={packet.reaction.target?.name || ''} onChange={(value) => updateReaction('target.name', value)} />
              <Field label="Target SMILES" value={packet.reaction.target?.smiles || ''} onChange={(value) => updateReaction('target.smiles', value)} />
              <label className="field wide">
                <span>Reaction SMILES</span>
                <textarea value={packet.reaction.reaction_smiles || ''} onChange={(event) => updateReaction('reaction_smiles', event.target.value)} />
              </label>
            </section>

            <nav className="tabs">
              <button className={activeTab === 'form' ? 'active' : ''} onClick={() => setActiveTab('form')}>Form</button>
              <button className={activeTab === 'json' ? 'active' : ''} onClick={() => setActiveTab('json')}>JSON</button>
              <button className={activeTab === 'errors' ? 'active' : ''} onClick={() => setActiveTab('errors')}>Errors {errors.length ? `(${errors.length})` : ''}</button>
            </nav>

            {activeTab === 'form' && (
              <section className="steps">
                <div className="section-heading">
                  <span>Platform Steps</span>
                  <button onClick={() => addStep()}><Plus size={16} /> Add step</button>
                </div>
                {packet.platform_review_steps.map((step, index) => (
                  <StepCard
                    key={step.review_step_id || index}
                    index={index}
                    step={step}
                    platforms={platforms}
                    schema={operationParameters(findOperation(registry, step.platform || '', step.operation || ''))}
                    onStepChange={(nextStep) => updateStep(index, nextStep)}
                    onOperationChange={(platform, operation) => changeOperation(index, platform, operation)}
                    onMove={(delta) => moveStep(index, delta)}
                    onDuplicate={() => duplicateStep(index)}
                    onDelete={() => deleteStep(index)}
                    onAddAfter={() => addStep(index)}
                  />
                ))}
              </section>
            )}

            {activeTab === 'json' && (
              <section className="json-panel">
                <textarea className="json-editor" value={jsonDraft} onChange={(event) => setJsonDraft(event.target.value)} spellCheck={false} />
                <button onClick={applyJsonDraft}>Apply JSON</button>
              </section>
            )}

            {activeTab === 'errors' && (
              <section className="errors">
                {errors.length === 0 ? <div className="empty">No validation errors.</div> : errors.map((error, index) => (
                  <div className="error-item" key={index}>
                    <strong>{String(error.path || '')}</strong>
                    <span>{String(error.message || '')}</span>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Field({ label, value, readOnly, onChange }: { label: string; value: string; readOnly?: boolean; onChange?: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} readOnly={readOnly} onChange={(event) => onChange?.(event.target.value)} />
    </label>
  );
}

function StepCard(props: {
  index: number;
  step: ReviewStep;
  platforms: Record<string, string[]>;
  schema: ParameterDef[];
  onStepChange: (step: ReviewStep) => void;
  onOperationChange: (platform: string, operation: string) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddAfter: () => void;
}) {
  const { index, step, platforms, schema } = props;
  const operations = step.platform ? platforms[step.platform] || [] : [];

  function setParam(key: string, field: keyof ParameterValue, value: JsonValue) {
    const next = structuredClone(step);
    next.parameters = next.parameters || {};
    next.parameters[key] = { ...(next.parameters[key] || { value: null }), [field]: value };
    props.onStepChange(next);
  }

  function setParamValue(key: string, parameter: ParameterDef, value: JsonValue) {
    const next = structuredClone(step);
    next.parameters = next.parameters || {};
    next.parameters[key] = {
      ...(next.parameters[key] || parameterValueStub(parameter)),
      value,
      source: isMissingParameterValue(value) ? 'missing' : 'expert',
      review_status: isMissingParameterValue(value) ? (parameter.required ? 'needs_expert' : 'not_applicable') : 'ok',
    };
    props.onStepChange(next);
  }

  function setParamNotApplicable(key: string, parameter: ParameterDef, checked: boolean) {
    const next = structuredClone(step);
    next.parameters = next.parameters || {};
    const current = next.parameters[key] || parameterValueStub(parameter);
    next.parameters[key] = checked
      ? { ...current, value: null, source: 'expert', review_status: 'not_applicable' }
      : { ...current, review_status: current.value === null ? (parameter.required ? 'needs_expert' : 'not_applicable') : 'ok' };
    props.onStepChange(next);
  }

  return (
    <article className="step-card">
      <div className="step-header">
        <div>
          <strong>Step {index + 1}</strong>
          <span>{step.review_step_id}</span>
        </div>
        <div className="icon-actions">
          <button title="Move up" onClick={() => props.onMove(-1)}><ArrowUp size={16} /></button>
          <button title="Move down" onClick={() => props.onMove(1)}><ArrowDown size={16} /></button>
          <button title="Duplicate" onClick={props.onDuplicate}><CopyPlus size={16} /></button>
          <button title="Add after" onClick={props.onAddAfter}><Plus size={16} /></button>
          <button title="Delete" onClick={props.onDelete}><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="step-grid">
        <label className="field">
          <span>Platform</span>
          <select value={step.platform || ''} onChange={(event) => props.onOperationChange(event.target.value, '')}>
            <option value="">Select platform</option>
            {Object.keys(platforms).map((platform) => <option key={platform} value={platform}>{platform}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Operation</span>
          <select value={step.operation || ''} onChange={(event) => props.onOperationChange(step.platform || '', event.target.value)}>
            <option value="">Select operation</option>
            {operations.map((operation) => <option key={operation} value={operation}>{operation}</option>)}
          </select>
        </label>
      </div>

      <div className="field wide">
        <span>Source text</span>
        <div className="source-text">{step.source_text || 'No source text.'}</div>
      </div>

      <div className="materials">
        <div className="mini-heading">Materials</div>
        {(step.materials || []).length === 0 ? <div className="empty">No materials.</div> : (step.materials || []).map((material, materialIndex) => (
          <div className="material-row" key={materialIndex}>
            <span>{String(material.name || '')}</span>
            <span>{String(material.role || '')}</span>
            <span>{String(material.amount_raw || '')}</span>
          </div>
        ))}
      </div>

      <div className="parameters">
        <div className="mini-heading">Parameters</div>
        {schema.length === 0 ? <div className="empty">Select a platform operation to show parameters.</div> : schema.map((parameter) => {
          const current = step.parameters?.[parameter.key] || parameterValueStub(parameter);
          const parameterStatus = parameterReviewStatus(parameter, current);
          return (
            <div className={`param-row ${parameterStatus.kind}`} key={parameter.key}>
              <div className="param-label">
                <div className="param-title">
                  <strong>{parameter.key}</strong>
                  <span className={`param-badge ${parameter.required ? 'required' : 'optional'}`}>{parameter.required ? '平台必填' : '平台可选'}</span>
                </div>
                <span>{parameter.name || parameter.category}</span>
                <span className={`param-status ${parameterStatus.kind}`}>{parameterStatus.label}</span>
                <span className="param-help">{parameterStatus.help}</span>
              </div>
              <ParameterValueEditor
                parameter={parameter}
                disabled={current.review_status === 'not_applicable'}
                value={current.value}
                onChange={(value) => setParamValue(parameter.key, parameter, value)}
              />
              <input
                disabled={current.review_status === 'not_applicable'}
                value={current.unit || ''}
                placeholder="unit"
                onChange={(event) => setParam(parameter.key, 'unit', event.target.value)}
              />
              <label className="na-toggle">
                <input
                  type="checkbox"
                  checked={current.review_status === 'not_applicable'}
                  onChange={(event) => setParamNotApplicable(parameter.key, parameter, event.target.checked)}
                />
                <span>本步骤无需此参数</span>
              </label>
            </div>
          );
        })}
      </div>

      {(step.review_questions || []).length > 0 && (
        <div className="questions">
          <div className="mini-heading">Review questions</div>
          {(step.review_questions || []).map((question, questionIndex) => (
            <div className={`question ${questionPriorityClass(question)}`} key={questionIndex}>
              <span>{questionPriorityLabel(question)}</span>
              <p>{String(question.question || '')}</p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ParameterValueEditor(props: {
  parameter: ParameterDef;
  value: JsonValue;
  disabled: boolean;
  onChange: (value: JsonValue) => void;
}) {
  const { parameter, value, disabled, onChange } = props;
  if (disabled) return <div className="disabled-value">不适用</div>;
  if (parameter.category === 'OBJECT') {
    return <ObjectValueEditor parameter={parameter} value={asObjectValue(value)} onChange={onChange} />;
  }
  if (parameter.category === 'ARRAY') {
    return <ArrayValueEditor parameter={parameter} value={asArrayValue(value)} onChange={onChange} />;
  }
  if (parameter.category === 'BOOLEAN') {
    return (
      <label className="boolean-toggle">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        <span>{value === true ? 'true' : 'false'}</span>
      </label>
    );
  }
  return (
    <input
      value={stringifyInputValue(value)}
      onChange={(event) => onChange(parseInputValue(event.target.value, parameter.category || ''))}
    />
  );
}

function ObjectValueEditor(props: {
  parameter: ParameterDef;
  value: JsonObject;
  onChange: (value: JsonValue) => void;
}) {
  const fields = objectFields(props.parameter);
  if (fields.length === 0) {
    return (
      <textarea
        className="compact-json"
        value={JSON.stringify(props.value, null, 2)}
        onChange={(event) => props.onChange(parseJsonObject(event.target.value))}
      />
    );
  }
  return (
    <div className="object-editor">
      {fields.map((field) => (
        <label className="mini-field" key={field.key}>
          <span>{field.name || field.key}</span>
          <input
            value={stringifyInputValue(props.value[field.key])}
            onChange={(event) => {
              const next = { ...props.value, [field.key]: parseInputValue(event.target.value, field.category || '') };
              props.onChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

function ArrayValueEditor(props: {
  parameter: ParameterDef;
  value: JsonValue[];
  onChange: (value: JsonValue) => void;
}) {
  const meta = props.parameter.meta_data || {};
  const childType = String(meta.child_type || '');
  const maxLength = typeof meta.max_length === 'number' && meta.max_length < 100 ? meta.max_length : undefined;
  const editsObjects = childType === 'OBJECT' || props.value.some((item) => typeof item === 'object' && item !== null && !Array.isArray(item));
  const canAdd = maxLength === undefined || props.value.length < maxLength;

  function updateItem(index: number, value: JsonValue) {
    const next = [...props.value];
    next[index] = value;
    props.onChange(next);
  }

  function addItem() {
    if (!canAdd) return;
    props.onChange([...props.value, editsObjects ? {} : null]);
  }

  function removeItem(index: number) {
    props.onChange(props.value.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="array-editor">
      {props.value.length === 0 && <div className="empty compact">No items.</div>}
      {props.value.map((item, index) => (
        <div className="array-row" key={index}>
          {editsObjects ? (
            <ObjectValueEditor parameter={props.parameter} value={asObjectValue(item)} onChange={(value) => updateItem(index, value)} />
          ) : (
            <input
              value={stringifyInputValue(item)}
              onChange={(event) => updateItem(index, parseInputValue(event.target.value, childType || props.parameter.category || ''))}
            />
          )}
          <button className="small-button" onClick={() => removeItem(index)}>Remove</button>
        </div>
      ))}
      <button className="small-button" disabled={!canAdd} onClick={addItem}>
        Add item{maxLength ? ` (${props.value.length}/${maxLength})` : ''}
      </button>
    </div>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return await response.json() as T;
}

function platformOptions(registry: RegistryRecord[]): Record<string, string[]> {
  const options: Record<string, Set<string>> = {};
  for (const item of registry) {
    const platform = String(item.platform || '').trim();
    const operation = String(item.name || item.operation || '').trim();
    if (!platform || !operation) continue;
    options[platform] = options[platform] || new Set();
    options[platform].add(operation);
  }
  return Object.fromEntries(Object.entries(options).sort().map(([platform, operations]) => [platform, [...operations].sort()]));
}

function findOperation(registry: RegistryRecord[], platform: string, operation: string): RegistryRecord | undefined {
  return registry.find((item) => String(item.platform || '').trim() === platform && String(item.name || item.operation || '').trim() === operation);
}

function operationParameters(record?: RegistryRecord): ParameterDef[] {
  const parameters: ParameterDef[] = [];
  for (const group of record?.properties || []) {
    for (const parameter of group.properties || []) {
      if (parameter?.key) parameters.push(parameter);
    }
  }
  return parameters;
}

function parameterValueStub(parameter: ParameterDef): ParameterValue {
  const meta = parameter.meta_data || {};
  return {
    value: meta.default ?? null,
    raw: null,
    unit: typeof meta.unit === 'string' ? meta.unit : null,
    source: 'missing',
    required_by_platform: Boolean(parameter.required),
    review_status: parameter.required ? 'needs_expert' : 'not_applicable',
  };
}

function parameterStub(registry: RegistryRecord[], platform: string, operation: string): Record<string, ParameterValue> {
  const params = operationParameters(findOperation(registry, platform, operation));
  return Object.fromEntries(params.map((item) => [item.key, parameterValueStub(item)]));
}

function parameterReviewStatus(parameter: ParameterDef, current: ParameterValue): { kind: string; label: string; help: string } {
  if (current.review_status === 'not_applicable') {
    return {
      kind: 'skipped',
      label: '已跳过',
      help: '专家确认：当前步骤不需要这个平台参数。',
    };
  }
  if (!isMissingParameterValue(current.value)) {
    return {
      kind: 'filled',
      label: current.source === 'literature' ? '文献已有' : current.source === 'expert' ? '专家已填' : '已有值',
      help: '请核对数值和单位；不正确时直接修改。',
    };
  }
  if (parameter.required) {
    return {
      kind: 'missing-required',
      label: '待补充',
      help: '平台必填。请填写；只有确认本步骤确实不需要时，才勾选“本步骤无需此参数”。',
    };
  }
  return {
    kind: 'missing-optional',
    label: '可选未填',
    help: '平台可选。有明确信息就填；当前步骤不需要时可跳过。',
  };
}

function questionPriorityClass(question: JsonObject): string {
  const priority = String(question.priority || '').toLowerCase();
  if (priority.includes('required') || priority.includes('must') || priority.includes('high')) return 'required';
  if (priority.includes('optional') || priority.includes('low')) return 'optional';
  return 'recommended';
}

function questionPriorityLabel(question: JsonObject): string {
  const kind = questionPriorityClass(question);
  if (kind === 'required') return '必须确认';
  if (kind === 'optional') return '可选核对';
  return '建议核对';
}

function mergeParameters(base: Record<string, ParameterValue>, existing: Record<string, ParameterValue>) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(existing)) {
    if (key in merged) merged[key] = value;
  }
  return merged;
}

function validatePacket(packet: ReviewPacket, registry: RegistryRecord[]): JsonObject[] {
  const errors: JsonObject[] = [];
  const platforms = platformOptions(registry);
  packet.platform_review_steps.forEach((step, stepIndex) => {
    const location = `platform_review_steps[${stepIndex + 1}]`;
    const platform = String(step.platform || '').trim();
    const operation = String(step.operation || '').trim();
    if (!platform || !platforms[platform]) {
      errors.push({ path: `${location}.platform`, message: 'Platform is missing or not in registry.' });
      return;
    }
    if (!operation || !platforms[platform].includes(operation)) {
      errors.push({ path: `${location}.operation`, message: 'Operation is missing or not allowed for platform.' });
      return;
    }
    const allowedParams = Object.fromEntries(operationParameters(findOperation(registry, platform, operation)).map((item) => [item.key, item]));
    for (const key of Object.keys(step.parameters || {})) {
      if (!allowedParams[key]) errors.push({ path: `${location}.parameters.${key}`, message: 'Parameter key is not in operation schema.' });
    }
    for (const parameter of Object.values(allowedParams)) {
      if (!parameter.required) continue;
      const value = step.parameters?.[parameter.key];
      if (value?.review_status === 'not_applicable') continue;
      if (!value || isMissingParameterValue(value.value)) {
        errors.push({ path: `${location}.parameters.${parameter.key}.value`, message: 'Required parameter needs a value or not_applicable.' });
      }
    }
  });
  return errors;
}

function protectImmutableFields(packet: ReviewPacket, base: ReviewPacket): ReviewPacket {
  const next = structuredClone(packet);
  next.reaction = {
    ...(next.reaction || {}),
    reaction_id: base.reaction?.reaction_id,
  };

  const baseSteps = new Map((base.platform_review_steps || []).map((step) => [step.review_step_id, step]));
  next.platform_review_steps = (next.platform_review_steps || []).map((step, index) => {
    const baseStep = baseSteps.get(step.review_step_id) || base.platform_review_steps[index];
    if (!baseStep) return step;
    return {
      ...step,
      source_text: baseStep.source_text,
    };
  });
  return next;
}

function stringifyInputValue(value: JsonValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isMissingParameterValue(value: JsonValue | undefined): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0 || value.every((item) => isMissingParameterValue(item));
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length === 0 || entries.every(([key, item]) => key === 'code' || isMissingParameterValue(item));
  }
  return false;
}

function asObjectValue(value: JsonValue): JsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') return { name: value };
  return {};
}

function asArrayValue(value: JsonValue): JsonValue[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function objectFields(parameter: ParameterDef): ParameterDef[] {
  const schema = parameter.meta_data?.schema;
  if (!Array.isArray(schema)) return [];
  return schema.filter((item): item is ParameterDef => Boolean(item && typeof item === 'object' && item.key && item.key !== 'code'));
}

function parseJsonObject(raw: string): JsonObject {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseInputValue(raw: string, category: string): JsonValue {
  if (!raw.trim()) return null;
  if (category === 'FLOAT' || category === 'INTEGER') {
    const value = Number(raw);
    return Number.isFinite(value) ? value : raw;
  }
  if (category === 'BOOLEAN') return raw.toLowerCase() === 'true';
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      return JSON.parse(raw) as JsonValue;
    } catch {
      return raw;
    }
  }
  return raw;
}

function storageKey(packetId: string): string {
  return `${STORAGE_PREFIX}${packetId}`;
}

function readStoredPacket(packetId: string): ReviewPacket | null {
  const raw = localStorage.getItem(storageKey(packetId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReviewPacket;
  } catch {
    return null;
  }
}

function hasStoredPacket(packetId: string): boolean {
  return Boolean(localStorage.getItem(storageKey(packetId)));
}

function reviewedFileName(packetId: string): string {
  return packetId.replace(/\.json$/i, '_reviewed.json');
}

function downloadJson(fileName: string, payload: JsonValue | JsonObject | ReviewPacket) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

createRoot(document.getElementById('root')!).render(<App />);
