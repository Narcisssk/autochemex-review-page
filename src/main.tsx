import React from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowUp, CircleHelp, CopyPlus, Download, FileDown, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { JSMol, RDKitModule } from '@rdkit/rdkit';
import rdkitScriptUrl from '@rdkit/rdkit/dist/RDKit_minimal.js?url';
import rdkitWasmUrl from '@rdkit/rdkit/dist/RDKit_minimal.wasm?url';
import './styles.css';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type PacketSummary = {
  id: string;
  file_name: string;
  literature_uuid?: string;
  reaction_id?: string;
  target_name?: string;
  paper?: {
    file_name: string;
    url: string;
    source_name?: string;
    size_bytes?: number;
  } | null;
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
    evidence?: string[];
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

type PlatformGuide = {
  purpose: string;
  chooseWhen: string;
  notFor: string;
  registryNote: string;
};

type MoleculeSvg = {
  smiles: string;
  svg?: string;
  error?: string;
};

type ReactionDiagramData = {
  reactants: MoleculeSvg[];
  agents: MoleculeSvg[];
  products: MoleculeSvg[];
  mode: 'reaction' | 'target';
};

const DATA_BASE = './data';
const STORAGE_PREFIX = 'autochemex-review:';
const PLATFORM_GUIDES: Record<string, PlatformGuide> = {
  高通量反应平台: {
    purpose: '用于小体积平行反应筛选和合成路线验证。平台共有 24 个约 30 mL 反应位，分为 4 个温区。支持固体和液体加料、控温搅拌、水平震荡、普通反应、冷凝回流、过程加液、过程取样，以及简单的稀释和萃取。',
    chooseWhen: '筛选物料配比、试剂当量、催化剂或添加剂用量、溶剂量和反应温区。',
    notFor: '百毫升级放大或复杂精制。',
    registryNote: '当前任务模板中，一个任务选择一个反应区，最多设置 6 组反应。',
  },
  四釜反应平台: {
    purpose: '用于较大体积的制备反应和放大验证。支持固体与液体加料、控温、搅拌、气体置换或通气、控温滴加、冷凝回流、过程取样、液体回收和设备清洗。',
    chooseWhen: '百毫升级反应，或需要较完整过程控制的制备实验。',
    notFor: '以小体积、多条件筛选为主要目的的实验；此时应优先选择高通量反应平台。',
    registryNote: '反应节点包含温度、时间、搅拌、通气、过程取样和冷凝回流等设置。',
  },
  固液提纯平台: {
    purpose: '用于反应结束后的粗分离和后处理，包括淬灭、萃取、静置分层、过滤、离心、加入干燥剂和取样检测。',
    chooseWhen: '文献描述淬灭、萃取、分层、干燥或过滤等后处理操作。连续操作应根据实际动作拆分为多个步骤。',
    notFor: '旋蒸和柱层析。',
    registryNote: '当前注册表包含过滤、离心、萃取、淬灭和干燥等操作。',
  },
  旋蒸预留平台: {
    purpose: '用于在减压条件下脱除溶剂、浓缩溶液或获得粗产物。主要参数包括旋蒸瓶尺寸、油浴温度、真空度、冷凝温度、旋蒸时间、是否阶梯升温，以及冷凝液和残液是否收集。',
    chooseWhen: '文献要求减压蒸除溶剂、浓缩溶液或收集粗产物。',
    notFor: '精馏或柱层析等高分辨率分离。',
    registryNote: '支持 500 mL 或 1000 mL 旋蒸瓶，并要求填写油浴温度、时间、冷凝温度和真空度。',
  },
  过柱纯化平台: {
    purpose: '用于通过柱色谱对粗产物进行精细分离和纯化。主要参数包括进样量、进样流速和过柱方法。',
    chooseWhen: '文献出现 column chromatography、flash chromatography 或“过硅胶柱”等操作。',
    notFor: '简单过滤、萃取或蒸除溶剂。',
    registryNote: '当前注册表中的过柱操作提供进样流速、进样量和过柱方法。',
  },
};

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
  const [selectedPacketIds, setSelectedPacketIds] = React.useState<Set<string>>(new Set());

  const platforms = React.useMemo(() => platformOptions(registry), [registry]);
  const selectedPacketCount = selectedPacketIds.size;

  React.useEffect(() => {
    loadInitialData();
  }, []);

  React.useEffect(() => {
    if (!selectedId) return;
    loadPacket(selectedId);
  }, [selectedId]);

  React.useEffect(() => {
    if (!packet) return;
    setJsonDraft(JSON.stringify(packet, null, 2));
  }, [packet]);

  async function loadInitialData() {
    const [index, registryPayload] = await Promise.all([
      fetchJson<{ packets: PacketSummary[] }>(`${DATA_BASE}/review_packet_index.json`),
      fetchJson<RegistryRecord[]>(`${DATA_BASE}/parsed_parameter_registry.json`),
    ]);
    setPackets(index.packets || []);
    setSelectedPacketIds(new Set(index.packets?.map((item) => item.id) || []));
    setRegistry(Array.isArray(registryPayload) ? registryPayload : []);
    if (index.packets?.length) setSelectedId(index.packets[0].id);
  }

  async function loadPacket(packetId: string) {
    const base = stripStepEvidence(await fetchJson<ReviewPacket>(`${DATA_BASE}/review_packets/${encodeURIComponent(packetId)}`));
    const stored = readStoredPacket(packetId);
    const data = stored ? protectImmutableFields(stripStepEvidence(stored), base) : base;
    setBasePacket(base);
    setPacket(data);
    setErrors([]);
    setMessage(stored ? 'Loaded local draft.' : '');
  }

  function updatePacket(next: ReviewPacket) {
    const cleanPacket = stripStepEvidence(next);
    const normalizedPacket = normalizeRequiredParameterStatuses(cleanPacket, registry);
    const protectedPacket = basePacket ? protectImmutableFields(normalizedPacket, basePacket) : normalizedPacket;
    setPacket(protectedPacket);
    if (selectedId) {
      localStorage.setItem(storageKey(selectedId), JSON.stringify(protectedPacket));
      setPackets((items) => [...items]);
    }
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
    const schema = operationParameters(findOperation(registry, platform, operation));
    const params = platform && operation ? parameterStub(registry, platform, operation) : {};
    const next = structuredClone(packet);
    const nextStep = {
      ...next.platform_review_steps[index],
      platform,
      operation,
      parameters: mergeParameters(params, next.platform_review_steps[index].parameters || {}),
    };
    next.platform_review_steps[index] = applyParameterConditions(nextStep, schema);
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
      updatePacket(protectedPacket);
      setMessage('JSON applied and saved locally. Reaction ID and original source text were preserved.');
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

  function saveDraft(): { packet: ReviewPacket; errors: JsonObject[] } | null {
    if (!packet || !selectedId) return null;
    const cleanPacket = stripStepEvidence(packet);
    const normalizedPacket = normalizeRequiredParameterStatuses(cleanPacket, registry);
    const protectedPacket = basePacket ? protectImmutableFields(normalizedPacket, basePacket) : normalizedPacket;
    setPacket(protectedPacket);
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
    return { packet: protectedPacket, errors: validationErrors };
  }

  function resetToOriginal() {
    if (!selectedId || !basePacket) return;
    const confirmed = window.confirm('Clear the local draft for this packet and reload the original review packet?');
    if (!confirmed) return;
    const original = structuredClone(basePacket);
    localStorage.removeItem(storageKey(selectedId));
    setPacket(original);
    setErrors([]);
    setActiveTab('form');
    setMessage('Local draft cleared. Original packet loaded.');
    setPackets((items) => [...items]);
  }

  function downloadCurrent() {
    if (!packet || !selectedId) return;
    const saved = saveDraft();
    if (!saved) return;
    if (!confirmDownloadWithErrors(saved.errors, 'current packet')) return;
    downloadJson(reviewedFileName(selectedId), saved.packet);
  }

  async function downloadSelected() {
    if (selectedPacketIds.size === 0) {
      setMessage('Please select at least one packet to download.');
      return;
    }
    if (packet && selectedPacketIds.has(selectedId)) saveDraft();
    const selected = packets.filter((item) => selectedPacketIds.has(item.id));
    const reviewed = await Promise.all(selected.map(async (item) => {
      const stored = readStoredPacket(item.id);
      if (stored) return { id: item.id, packet: normalizeRequiredParameterStatuses(stripStepEvidence(stored), registry) };
      const base = await fetchJson<ReviewPacket>(`${DATA_BASE}/review_packets/${encodeURIComponent(item.id)}`);
      return { id: item.id, packet: normalizeRequiredParameterStatuses(stripStepEvidence(base), registry) };
    }));
    const validationErrors = reviewed.flatMap((item) =>
      validatePacket(item.packet, registry).map((error) => ({
        ...error,
        path: `${item.id} :: ${String(error.path || '')}`,
      }))
    );
    if (!confirmDownloadWithErrors(validationErrors, `${reviewed.length} selected packet${reviewed.length === 1 ? '' : 's'}`)) {
      setMessage('Download canceled. Review validation errors before exporting.');
      return;
    }
    downloadJson('selected_review_packets_bundle.json', {
      exported_at: new Date().toISOString(),
      packet_count: reviewed.length,
      reviewed_packets: reviewed,
    });
    setMessage(`Downloaded ${reviewed.length} selected packet${reviewed.length === 1 ? '' : 's'}.`);
  }

  function togglePacketSelection(packetId: string, checked: boolean) {
    setSelectedPacketIds((current) => {
      const next = new Set(current);
      if (checked) next.add(packetId);
      else next.delete(packetId);
      return next;
    });
  }

  const selectedSummary = packets.find((item) => item.id === selectedId);
  const selectedPaper = selectedSummary?.paper;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-title">Review Packets</div>
        <div className="sidebar-note">Edits are autosaved in this browser until downloaded.</div>
        <div className="packet-select-actions">
          <button onClick={() => setSelectedPacketIds(new Set(packets.map((item) => item.id)))}>Select all</button>
          <button onClick={() => setSelectedPacketIds(new Set())}>Clear</button>
        </div>
        <div className="packet-list">
          {packets.map((item) => (
            <div key={item.id} className={`packet-row ${selectedId === item.id ? 'active' : ''}`}>
              <input
                aria-label={`Select ${item.reaction_id || item.file_name}`}
                checked={selectedPacketIds.has(item.id)}
                onChange={(event) => togglePacketSelection(item.id, event.target.checked)}
                type="checkbox"
              />
              <button className="packet-item" onClick={() => setSelectedId(item.id)}>
                <span className="packet-name">{item.reaction_id || item.file_name}</span>
                {item.target_name && <span className="packet-target">{item.target_name}</span>}
                <span className="packet-meta">{hasStoredPacket(item.id) ? 'draft saved' : 'not reviewed'}</span>
              </button>
            </div>
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
            <button onClick={resetToOriginal}><RotateCcw size={16} /> Reset to original</button>
            <button className="primary" onClick={downloadCurrent}><Download size={16} /> Download JSON</button>
            <button onClick={downloadSelected}><FileDown size={16} /> Download selected ({selectedPacketCount})</button>
          </div>
        </header>

        <section className="review-guide">
          <div>
            <strong>专家审核任务（单步反应）</strong>
            <span>请以原文 PDF 为准，核对当前反应的目标产物、Reaction SMILES、实验步骤和平台参数（SMILES结构很容易出错）；页面中的所有初始内容来自模型提取与映射，供审核参考。</span>
          </div>
          <div>
            <strong>审核步骤</strong>
            <span>建议先打开 Source PDF 定位证据，再检查实验设置是否合理；随后逐步修改或补填平台实验表单中的步骤、物料、温度、时间、速度、取层等参数。核心任务是根据文献描述，在平台允许的范围内尽可能安排合理的实验流程和参数，所以有些LLM review questions提示可以忽略。</span>
          </div>
          <div>
            <strong>保存与导出</strong>
            <span>修改会自动保存在当前浏览器。完成审核后请使用 Download JSON 导出当前反应，或在左侧勾选多个反应后使用 Download selected 批量导出。</span>
          </div>
        </section>

        {selectedPaper && (
          <section className="paper-panel">
            <div>
              <strong>Source PDF</strong>
              <span>{selectedSummary?.literature_uuid}</span>
            </div>
            <a href={selectedPaper.url} target="_blank" rel="noreferrer">Open source PDF</a>
          </section>
        )}

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
              <ReactionDiagram
                reactionSmiles={packet.reaction.reaction_smiles || ''}
                targetSmiles={packet.reaction.target?.smiles || ''}
              />
              <EvidenceList title="Literature evidence" evidence={packet.reaction.evidence} />
            </section>

            <nav className="tabs">
              <button className={activeTab === 'form' ? 'active' : ''} onClick={() => setActiveTab('form')}>Form</button>
              <button className={activeTab === 'json' ? 'active' : ''} onClick={() => setActiveTab('json')}>Current JSON</button>
              <button className={activeTab === 'errors' ? 'active' : ''} onClick={() => setActiveTab('errors')}>Errors {errors.length ? `(${errors.length})` : ''}</button>
            </nav>

            {activeTab === 'form' && (
              <section className="steps">
                <div className="section-heading">
                  <div className="section-heading-copy">
                    <span>实验步骤</span>
                    <p>请按您认为合理的物理操作来安排步骤。步骤的选择、数量、顺序皆可调整。虽然已有一些预填信息和提示，但是仅供参考，最终实验计划以人工填写为准。</p>
                  </div>
                  <button onClick={() => addStep()}><Plus size={16} /> Add step</button>
                </div>
                <PlatformSelectionGuide />
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

function EvidenceList({ title, evidence }: { title: string; evidence?: string[] }) {
  const items = (evidence || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="evidence-list">
      <div className="mini-heading">{title}</div>
      <ul>
        {items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    </div>
  );
}

function PlatformSelectionGuide() {
  return (
    <details className="platform-guide">
      <summary>
        <CircleHelp size={18} aria-hidden="true" />
        <span>
          <strong>平台选择说明</strong>
          <small>查看每个平台能做什么、什么时候选、不能代替什么</small>
        </span>
      </summary>
      <div className="platform-guide-content">
        <div className="platform-choice-tips">
          <p><strong>反应平台怎么选？</strong>小体积、多条件筛选选择高通量反应平台；较大体积制备、放大或需要复杂过程控制时选择四釜反应平台。</p>
          <p><strong>后处理是否写成一个步骤？</strong>不建议。淬灭、萃取、过滤、干燥、旋蒸和过柱属于不同物理操作，应分别建立步骤。</p>
        </div>
        <div className="platform-guide-grid">
          {Object.entries(PLATFORM_GUIDES).map(([platform, guide]) => (
            <PlatformGuideCard key={platform} platform={platform} guide={guide} />
          ))}
        </div>
      </div>
    </details>
  );
}

function PlatformGuideCard({ platform, guide }: { platform: string; guide: PlatformGuide }) {
  return (
    <div className="platform-guide-card">
      <strong>{platform}</strong>
      <dl>
        <div><dt>能做什么</dt><dd>{guide.purpose}</dd></div>
        <div><dt>什么时候选</dt><dd>{guide.chooseWhen}</dd></div>
        <div><dt>不能代替</dt><dd>{guide.notFor}</dd></div>
        <div><dt>当前表单</dt><dd>{guide.registryNote}</dd></div>
      </dl>
    </div>
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
    props.onStepChange(applyParameterConditions(next, schema));
  }

  function setParamNotApplicable(key: string, parameter: ParameterDef, checked: boolean) {
    if (parameter.required) return;
    const next = structuredClone(step);
    next.parameters = next.parameters || {};
    const current = next.parameters[key] || parameterValueStub(parameter);
    next.parameters[key] = checked
      ? { ...current, value: null, source: 'expert', review_status: 'not_applicable' }
      : { ...current, source: 'expert', review_status: isMissingParameterValue(current.value) ? 'needs_expert' : 'ok' };
    props.onStepChange(applyParameterConditions(next, schema));
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
        <span>LLM extracted source hint</span>
        <div className="source-text">{step.source_text || 'No LLM source hint.'}</div>
      </div>

      <div className="materials">
        <div className="mini-heading">LLM extracted material candidates</div>
        <div className="section-note">候选物料仅供参考；最终 gold 以平台参数区填写结果为准。</div>
        {(step.materials || []).length === 0 ? <div className="empty">No LLM material candidates.</div> : (step.materials || []).map((material, materialIndex) => (
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
          const condition = displayConditionState(parameter, step);
          if (condition.status === 'inactive') return null;
          if (condition.status === 'waiting') {
            return (
              <div className="param-row conditional-waiting" key={parameter.key}>
                <div className="param-label">
                  <div className="param-title">
                    <strong>{parameter.key}</strong>
                    <span className={`param-badge ${parameter.required ? 'required' : 'optional'}`}>{parameter.required ? '平台必填' : '平台可选'}</span>
                  </div>
                  <span>{parameter.name || parameter.category}</span>
                  <span className="param-status waiting">等待条件确认</span>
                  <span className="param-help">{condition.help}</span>
                </div>
              </div>
            );
          }
          const current = step.parameters?.[parameter.key] || parameterValueStub(parameter);
          const parameterStatus = parameterReviewStatus(parameter, current);
          const isNotApplicable = !parameter.required && current.review_status === 'not_applicable';
          const showUnitInput = shouldShowUnitInput(parameter, current);
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
                {isPlatformInternalIdentifier(parameter) && (
                  <span className="param-help">涉及平台内部编号；不清楚可以填 unknown。</span>
                )}
              </div>
              <ParameterValueEditor
                parameter={parameter}
                disabled={isNotApplicable}
                value={current.value}
                onChange={(value) => setParamValue(parameter.key, parameter, value)}
              />
              {showUnitInput && (
                <span className={`unit-chip ${isNotApplicable ? 'disabled' : ''}`}>
                  unit: {current.unit || String(parameter.meta_data?.unit || '')}
                </span>
              )}
              {!parameter.required && (
                <label className="na-toggle">
                  <input
                    type="checkbox"
                    checked={isNotApplicable}
                    onChange={(event) => setParamNotApplicable(parameter.key, parameter, event.target.checked)}
                  />
                  <span>本步骤无需填写</span>
                </label>
              )}
            </div>
          );
        })}
      </div>

      {(step.review_questions || []).length > 0 && (
        <div className="questions">
          <div className="mini-heading">LLM review questions</div>
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
  if (parameter.category === 'ENUM') {
    return <EnumValueEditor parameter={parameter} value={value} onChange={onChange} />;
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
      {fields.map((field) => {
        const condition = displayConditionStateForValues(field, props.value);
        if (condition.status === 'inactive') return null;
        if (condition.status === 'waiting') {
          return (
            <div className="mini-field conditional-waiting" key={field.key}>
              <span>{field.name || field.key}</span>
              <span className={`param-badge ${field.required ? 'required' : 'optional'}`}>{field.required ? '平台必填' : '平台可选'}</span>
              <span className="param-status waiting">等待条件确认</span>
              <span className="param-help">{condition.help}</span>
              {shouldShowInternalIdentifierHint(field, props.parameter) && (
                <span className="param-help">涉及平台内部编号；不清楚可以填 unknown。</span>
              )}
            </div>
          );
        }
        return (
          <div className="mini-field" key={field.key}>
            <span>{field.name || field.key}</span>
            <span className={`param-badge ${field.required ? 'required' : 'optional'}`}>{field.required ? '平台必填' : '平台可选'}</span>
            {shouldShowInternalIdentifierHint(field, props.parameter) && (
              <span className="param-help">涉及平台内部编号；不清楚可以填 unknown。</span>
            )}
            <NestedValueEditor
              parameter={field}
              value={props.value[field.key]}
              onChange={(value) => {
                props.onChange({ ...props.value, [field.key]: value });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function NestedValueEditor(props: {
  parameter: ParameterDef;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
}) {
  const { parameter, value, onChange } = props;
  if (parameter.category === 'OBJECT') {
    return <ObjectValueEditor parameter={parameter} value={asObjectValue(value)} onChange={onChange} />;
  }
  if (parameter.category === 'ARRAY') {
    return <ArrayValueEditor parameter={parameter} value={asArrayValue(value)} onChange={onChange} />;
  }
  if (parameter.category === 'ENUM') {
    return <EnumValueEditor parameter={parameter} value={value} onChange={onChange} />;
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

function EnumValueEditor(props: {
  parameter: ParameterDef;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
}) {
  const options = enumOptions(props.parameter);
  const normalizedValue = normalizeEnumValue(props.value, options);
  if (options.length === 0) {
    return (
      <input
        value={stringifyInputValue(props.value)}
        onChange={(event) => props.onChange(event.target.value || null)}
      />
    );
  }
  return (
    <select value={normalizedValue} onChange={(event) => props.onChange(event.target.value || null)}>
      <option value="">Select value</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.value} - {option.label}
        </option>
      ))}
    </select>
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

function ReactionDiagram(props: { reactionSmiles: string; targetSmiles: string }) {
  const [state, setState] = React.useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; message?: string; data?: ReactionDiagramData }>({ status: 'idle' });

  React.useEffect(() => {
    let cancelled = false;
    const reactionSmiles = props.reactionSmiles.trim();
    const targetSmiles = props.targetSmiles.trim();
    if (!reactionSmiles && !targetSmiles) {
      setState({ status: 'idle' });
      return;
    }

    setState({ status: 'loading', message: 'Loading RDKit renderer...' });
    loadRdkit()
      .then((rdkit) => {
        if (!cancelled) setState({ status: 'ready', data: buildReactionDiagram(rdkit, reactionSmiles, targetSmiles) });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', message: `Unable to load RDKit renderer: ${String(error)}` });
      });

    return () => {
      cancelled = true;
    };
  }, [props.reactionSmiles, props.targetSmiles]);

  return (
    <div className="reaction-visualization">
      <div className="reaction-visualization-header">
        <span>Chemical reaction</span>
        {state.data && <span>{state.data.mode === 'reaction' ? 'Rendered from Reaction SMILES' : 'Target structure fallback'}</span>}
      </div>
      {state.status === 'idle' && <div className="reaction-visualization-empty">No SMILES available.</div>}
      {state.status === 'loading' && <div className="reaction-visualization-empty">{state.message}</div>}
      {state.status === 'error' && <div className="reaction-visualization-error">{state.message}</div>}
      {state.status === 'ready' && state.data && <ReactionDiagramRows data={state.data} />}
    </div>
  );
}

function ReactionDiagramRows(props: { data: ReactionDiagramData }) {
  const sections = props.data.mode === 'reaction'
    ? [
        { label: 'Reactants', molecules: props.data.reactants },
        ...(props.data.agents.length ? [{ label: 'Agents', molecules: props.data.agents }] : []),
        { label: 'Products', molecules: props.data.products },
      ]
    : [{ label: 'Target', molecules: props.data.products }];

  return (
    <div className="reaction-flow">
      {sections.map((section, index) => (
        <React.Fragment key={section.label}>
          {index > 0 && <div className="reaction-arrow" aria-hidden="true">-&gt;</div>}
          <div className="reaction-section">
            <div className="reaction-section-label">{section.label}</div>
            <div className="molecule-list">
              {section.molecules.length === 0 ? (
                <div className="reaction-visualization-empty compact">None</div>
              ) : section.molecules.map((molecule, moleculeIndex) => (
                <React.Fragment key={`${molecule.smiles}-${moleculeIndex}`}>
                  {moleculeIndex > 0 && <div className="molecule-plus" aria-hidden="true">+</div>}
                  <MoleculeCard molecule={molecule} />
                </React.Fragment>
              ))}
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function MoleculeCard(props: { molecule: MoleculeSvg }) {
  return (
    <div className={`molecule-card ${props.molecule.error ? 'invalid' : ''}`}>
      {props.molecule.svg ? (
        <div className="molecule-svg" role="img" aria-label={props.molecule.smiles} dangerouslySetInnerHTML={{ __html: props.molecule.svg }} />
      ) : (
        <div className="molecule-error">{props.molecule.error || 'Unable to render molecule.'}</div>
      )}
      <div className="molecule-smiles" title={props.molecule.smiles}>{props.molecule.smiles}</div>
    </div>
  );
}

let rdkitModulePromise: Promise<RDKitModule> | null = null;
let rdkitScriptPromise: Promise<void> | null = null;

function loadRdkit(): Promise<RDKitModule> {
  if (!rdkitModulePromise) {
    rdkitModulePromise = loadRdkitScript().then(async () => {
      const rdkit = await window.initRDKitModule({ locateFile: () => rdkitWasmUrl });
      rdkit.prefer_coordgen(true);
      return rdkit;
    });
  }
  return rdkitModulePromise;
}

function loadRdkitScript(): Promise<void> {
  if (window.initRDKitModule) return Promise.resolve();
  if (rdkitScriptPromise) return rdkitScriptPromise;

  rdkitScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-rdkit-script="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('RDKit script failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = rdkitScriptUrl;
    script.async = true;
    script.dataset.rdkitScript = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('RDKit script failed to load.'));
    document.head.appendChild(script);
  });

  return rdkitScriptPromise;
}

function buildReactionDiagram(rdkit: RDKitModule, reactionSmiles: string, targetSmiles: string): ReactionDiagramData {
  const parsed = parseReactionSmiles(reactionSmiles);
  if (parsed) {
    return {
      reactants: parsed.reactants.map((smiles) => renderMolecule(rdkit, smiles)),
      agents: parsed.agents.map((smiles) => renderMolecule(rdkit, smiles)),
      products: parsed.products.map((smiles) => renderMolecule(rdkit, smiles)),
      mode: 'reaction',
    };
  }

  return {
    reactants: [],
    agents: [],
    products: [renderMolecule(rdkit, targetSmiles || reactionSmiles)],
    mode: 'target',
  };
}

function parseReactionSmiles(value: string): { reactants: string[]; agents: string[]; products: string[] } | null {
  const parts = value.trim().split('>');
  if (parts.length !== 3) return null;
  const [reactants, agents, products] = parts.map(splitSmilesGroup);
  if (reactants.length === 0 && products.length === 0) return null;
  return { reactants, agents, products };
}

function splitSmilesGroup(value: string): string[] {
  return value.split('.').map((item) => item.trim()).filter(Boolean);
}

function renderMolecule(rdkit: RDKitModule, smiles: string): MoleculeSvg {
  let molecule: JSMol | null = null;
  try {
    molecule = rdkit.get_mol(smiles);
    if (!molecule) return { smiles, error: 'Invalid SMILES' };
    return { smiles, svg: molecule.get_svg(190, 150) };
  } catch (error) {
    return { smiles, error: String(error) };
  } finally {
    molecule?.delete();
  }
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

function shouldShowUnitInput(parameter: ParameterDef, current: ParameterValue): boolean {
  const meta = parameter.meta_data || {};
  if (typeof meta.unit === 'string' && meta.unit.trim()) return true;
  if (typeof current.unit === 'string' && current.unit.trim()) return true;
  const category = String(parameter.category || '').toUpperCase();
  if (category === 'FLOAT' || category === 'INTEGER') return true;
  if (category === 'ARRAY') {
    const childType = String(meta.child_type || '').toUpperCase();
    return childType === 'FLOAT' || childType === 'INTEGER' || Boolean(meta.quantity_for);
  }
  return false;
}

function isPlatformInternalIdentifier(parameter: ParameterDef): boolean {
  const key = parameter.key.toLowerCase();
  const name = String(parameter.name || '');
  return (
    key.includes('scheme') ||
    key.includes('method') ||
    key.endsWith('_id') ||
    key.includes('code') ||
    key.includes('tool_use') ||
    name.includes('方案') ||
    name.includes('方法') ||
    name.includes('编号') ||
    name.includes('工装')
  );
}

function shouldShowInternalIdentifierHint(parameter: ParameterDef, parent?: ParameterDef): boolean {
  const key = parameter.key.toLowerCase();
  const parentKey = String(parent?.key || '').toLowerCase();
  if (parentKey === 'filter_material' && key === 'name') return true;
  return isPlatformInternalIdentifier(parameter);
}

function parameterStub(registry: RegistryRecord[], platform: string, operation: string): Record<string, ParameterValue> {
  const params = operationParameters(findOperation(registry, platform, operation));
  return Object.fromEntries(params.map((item) => [item.key, parameterValueStub(item)]));
}

function parameterReviewStatus(parameter: ParameterDef, current: ParameterValue): { kind: string; label: string; help: string } {
  if (!parameter.required && current.review_status === 'not_applicable') {
    return {
      kind: 'skipped',
      label: '已跳过',
      help: '已标记为本步骤无需填写。若该参数其实需要，请取消勾选并补充数值。',
    };
  }
  if (!isMissingParameterValue(current.value)) {
    return {
      kind: 'filled',
      label: current.source === 'literature' ? 'LLM文献提取' : current.source === 'expert' ? '专家已填' : '已有候选值',
      help: current.source === 'literature' ? 'LLM 从文献中提取的候选值，请核对；不正确时直接修改。' : '请核对数值和单位；不正确时直接修改。',
    };
  }
  if (parameter.required) {
    return {
      kind: 'missing-required',
      label: '待补充',
      help: '平台必填。请根据文献或实验常识补充；若这个参数确实不适用于当前实验，请调整平台步骤或操作类型。',
    };
  }
  return {
    kind: 'missing-optional',
    label: '可选未填',
    help: '平台可选。有明确信息时请填写；若本参数真的不需要，可以选择跳过。',
  };
}

function displayConditionState(parameter: ParameterDef, step: ReviewStep): { status: 'active' | 'inactive' | 'waiting'; help?: string } {
  const values = Object.fromEntries(
    Object.entries(step.parameters || {}).map(([key, record]) => [key, record?.value])
  );
  return displayConditionStateForValues(parameter, values);
}

function displayConditionStateForValues(parameter: ParameterDef, values: Record<string, JsonValue | undefined>): { status: 'active' | 'inactive' | 'waiting'; help?: string } {
  const condition = parameter.meta_data?.display_condition;
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return { status: 'active' };
  const property = String((condition as JsonObject).property || '');
  if (!property) return { status: 'active' };
  const expected = (condition as JsonObject).value;
  const controllerValue = values[property];
  if (isMissingParameterValue(controllerValue)) {
    return {
      status: 'waiting',
      help: `该参数只有在 ${property} = ${String(expected)} 时才需要填写；请先确认上方控制参数。`,
    };
  }
  return valuesMatchCondition(controllerValue, expected) ? { status: 'active' } : { status: 'inactive' };
}

function applyParameterConditions(step: ReviewStep, schema: ParameterDef[]): ReviewStep {
  const next = structuredClone(step);
  next.parameters = next.parameters || {};
  for (const parameter of schema) {
    if (!parameter.meta_data?.display_condition) continue;
    const current = next.parameters[parameter.key] || parameterValueStub(parameter);
    const state = displayConditionState(parameter, next);
    if (state.status === 'inactive') {
      next.parameters[parameter.key] = { ...current, value: null, source: 'derived', review_status: 'not_applicable' };
    }
    if (state.status === 'active' && isMissingParameterValue(current.value)) {
      if (current.review_status === 'needs_expert' || (!parameter.required && current.source === 'expert' && current.review_status === 'not_applicable')) {
        next.parameters[parameter.key] = current;
        continue;
      }
      next.parameters[parameter.key] = {
        ...current,
        source: current.source || 'missing',
        review_status: parameter.meta_data?.display_condition || parameter.required ? 'needs_expert' : 'not_applicable',
      };
    }
  }
  return next;
}

function valuesMatchCondition(actual: JsonValue, expected: JsonValue): boolean {
  if (actual === expected) return true;
  if (typeof expected === 'boolean') return actual === expected || String(actual).toLowerCase() === String(expected);
  if (typeof expected === 'number') return Number(actual) === expected;
  return String(actual) === String(expected);
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
    const schema = operationParameters(findOperation(registry, platform, operation));
    const allowedParams = Object.fromEntries(schema.map((item) => [item.key, item]));
    for (const key of Object.keys(step.parameters || {})) {
      if (!allowedParams[key]) errors.push({ path: `${location}.parameters.${key}`, message: 'Parameter key is not in operation schema.' });
    }
    for (const parameter of Object.values(allowedParams)) {
      const condition = displayConditionState(parameter, step);
      if (condition.status !== 'active') continue;
      const value = step.parameters?.[parameter.key];
      if (!parameter.required && value?.review_status === 'not_applicable') continue;
      if (parameter.required && (!value || isMissingParameterValue(value.value))) {
        errors.push({ path: `${location}.parameters.${parameter.key}.value`, message: 'Required platform parameter needs a value.' });
      }
      validateNestedRequiredFields(value?.value, parameter, `${location}.parameters.${parameter.key}.value`, errors);
    }
  });
  return errors;
}

function validateNestedRequiredFields(value: JsonValue | undefined, parameter: ParameterDef, path: string, errors: JsonObject[]) {
  validateEnumValue(value, parameter, path, errors);
  const fields = objectFields(parameter);
  if (fields.length === 0) return;
  const objectValue = value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
  for (const field of fields) {
    if (displayConditionStateForValues(field, objectValue).status !== 'active') continue;
    const childPath = `${path}.${field.key}`;
    const childValue = objectValue[field.key];
    if (field.required && isMissingParameterValue(childValue)) {
      errors.push({ path: childPath, message: 'Required nested parameter needs a value.' });
    }
    validateNestedRequiredFields(childValue, field, childPath, errors);
  }
}

function validateEnumValue(value: JsonValue | undefined, parameter: ParameterDef, path: string, errors: JsonObject[]) {
  if (parameter.category !== 'ENUM' || isMissingParameterValue(value)) return;
  const options = enumOptions(parameter);
  if (options.length === 0) return;
  const normalized = normalizeEnumValue(value, options);
  if (!options.some((option) => option.value === normalized)) {
    errors.push({
      path,
      message: `ENUM value must be one of: ${options.map((option) => `${option.value}(${option.label})`).join(', ')}.`,
    });
  }
}

function confirmDownloadWithErrors(errors: JsonObject[], targetLabel: string): boolean {
  if (errors.length === 0) return true;
  const preview = errors.slice(0, 12).map((error, index) => (
    `${index + 1}. ${String(error.path || '')}: ${String(error.message || '')}`
  ));
  const hiddenCount = Math.max(0, errors.length - preview.length);
  const message = [
    `${targetLabel} 仍有 ${errors.length} 个明显问题。`,
    '这些问题可能导致导出的 gold answer 不完整或无法用于 exact match。',
    '',
    ...preview,
    hiddenCount ? `……还有 ${hiddenCount} 个问题未显示。` : '',
    '',
    '你确定要下载吗？',
  ].filter(Boolean).join('\n');
  return window.confirm(message);
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

function stripStepEvidence(packet: ReviewPacket): ReviewPacket {
  const next = structuredClone(packet);
  for (const step of next.platform_review_steps || []) {
    delete (step as ReviewStep & { evidence?: string[] }).evidence;
  }
  return next;
}

function normalizeRequiredParameterStatuses(packet: ReviewPacket, registry: RegistryRecord[]): ReviewPacket {
  const next = structuredClone(packet);
  for (const step of next.platform_review_steps || []) {
    const schema = operationParameters(findOperation(registry, step.platform || '', step.operation || ''));
    for (const parameter of schema) {
      const current = step.parameters?.[parameter.key];
      if (current) current.value = normalizeParameterValue(current.value, parameter);
      if (!parameter.required || displayConditionState(parameter, step).status !== 'active') continue;
      if (!current || current.review_status !== 'not_applicable') continue;
      current.source = isMissingParameterValue(current.value) ? 'missing' : current.source || 'expert';
      current.review_status = isMissingParameterValue(current.value) ? 'needs_expert' : 'ok';
    }
  }
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

function asObjectValue(value: JsonValue | undefined): JsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') return { name: value };
  return {};
}

function asArrayValue(value: JsonValue | undefined): JsonValue[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function objectFields(parameter: ParameterDef): ParameterDef[] {
  const schema = parameter.meta_data?.schema;
  if (!Array.isArray(schema)) return [];
  return schema.filter((item): item is ParameterDef => Boolean(item && typeof item === 'object' && item.key));
}

function enumOptions(parameter: ParameterDef): Array<{ value: string; label: string }> {
  const options = parameter.meta_data?.options;
  if (!options) return [];
  if (Array.isArray(options)) {
    return options.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as JsonObject;
        const value = String(record.value ?? record.key ?? record.id ?? record.label ?? '');
        const label = String(record.label ?? record.name ?? record.value ?? value);
        return { value, label };
      }
      return { value: String(item), label: String(item) };
    }).filter((item) => item.value);
  }
  if (typeof options === 'object') {
    return Object.entries(options).map(([value, label]) => ({ value, label: String(label) }));
  }
  return [];
}

function normalizeEnumValue(value: JsonValue | undefined, options: Array<{ value: string; label: string }>): string {
  if (value === null || value === undefined) return '';
  const text = stringifyInputValue(value);
  const byValue = options.find((option) => option.value === text);
  if (byValue) return byValue.value;
  const byLabel = options.find((option) => option.label === text);
  return byLabel?.value || text;
}

function normalizeParameterValue(value: JsonValue | undefined, parameter: ParameterDef): JsonValue {
  if (parameter.category === 'ENUM') {
    const options = enumOptions(parameter);
    const normalized = normalizeEnumValue(value, options);
    return options.some((option) => option.value === normalized) ? normalized : value ?? null;
  }
  if (parameter.category === 'OBJECT') {
    const fields = objectFields(parameter);
    if (fields.length === 0 || !value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
    const next = { ...(value as JsonObject) };
    for (const field of fields) {
      if (displayConditionStateForValues(field, next).status !== 'active') continue;
      next[field.key] = normalizeParameterValue(next[field.key], field);
    }
    return next;
  }
  return value ?? null;
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
