import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  createDarkTheme,
  createLightTheme,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  FluentProvider,
  Input,
  Select,
  Spinner,
  Textarea,
  Tooltip,
} from "@fluentui/react-components";
import type { BrandVariants } from "@fluentui/react-components";
import {
  ChartLineUp,
  ArrowRight,
  BracketsCurly,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  CirclesThreePlus,
  ClockCounterClockwise,
  Code,
  Database,
  GitBranch,
  ListMagnifyingGlass,
  MagnifyingGlass,
  Moon,
  Plus,
  RocketLaunch,
  ShieldCheck,
  SidebarSimple,
  Sun,
  Warning,
  X,
} from "@phosphor-icons/react";
import { auditEvent, bindValue, compilePlan, semanticSearch, validateSnapshot } from "./domain/engine";
import { sampleSnapshot } from "./domain/sample";
import type { AuditEvent, ObjectType, OntologyObject, OntologySnapshot, ValidationIssue } from "./domain/types";

type Page = "overview" | "ontology" | "lab" | "audit" | "api";
type EntityTab = "objects" | "metrics" | "relations";

const objectTypeLabels: Record<ObjectType, string> = {
  ENTITY: "实体",
  EVENT: "事件",
  SNAPSHOT: "快照",
  AGGREGATE: "聚合",
  RELATIONSHIP: "关系对象",
};

const semanticBrand: BrandVariants = {
  10: "#031d17",
  20: "#082c24",
  30: "#0b3c31",
  40: "#0c4c3f",
  50: "#0b5d4d",
  60: "#0b6b58",
  70: "#187b66",
  80: "#2a8b75",
  90: "#409b84",
  100: "#58aa93",
  110: "#72baa4",
  120: "#8cc9b5",
  130: "#a7d8c6",
  140: "#c2e7d8",
  150: "#ddf5ea",
  160: "#f2fcf8",
};

const semanticLightTheme = createLightTheme(semanticBrand);
const semanticDarkTheme = createDarkTheme(semanticBrand);

const nav = [
  { id: "overview" as const, label: "工作概览", icon: ChartLineUp },
  { id: "ontology" as const, label: "本体模型", icon: CirclesThreePlus },
  { id: "lab" as const, label: "语义实验室", icon: ListMagnifyingGlass },
  { id: "audit" as const, label: "审计记录", icon: ClockCounterClockwise },
  { id: "api" as const, label: "接入与 API", icon: BracketsCurly },
];

const initialAudit: AuditEvent[] = [
  auditEvent(1, "frame", "QUESTION_FRAME_SUBMITTED", "已固定问题语言角色"),
  auditEvent(2, "search", "ONTOLOGY_SEARCHED", "返回销售事件、销售额和时间维度"),
  auditEvent(3, "binding", "VALUE_BOUND", "华东已绑定到区域名称"),
  auditEvent(4, "planning", "PLAN_COMPILED", "计划通过粒度和扇出校验"),
  auditEvent(5, "sql", "SQL_GUARD_PASSED", "只读单语句检查通过"),
];

function Logo() {
  return <div className="logo-mark" aria-label="语义平台">S</div>;
}

function StatusBadge({ status }: { status: string }) {
  const appearance = status === "PUBLISHED" || status === "VERIFIED" ? "filled" : "tint";
  const color = status === "PUBLISHED" ? "success" : status === "VERIFIED" ? "informative" : "warning";
  return <Badge appearance={appearance} color={color}>{status}</Badge>;
}

function Sidebar({ page, setPage, collapsed, setCollapsed }: { page: Page; setPage: (page: Page) => void; collapsed: boolean; setCollapsed: (value: boolean) => void }) {
  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="brand">
        <Logo />
        {!collapsed && <div><strong>语义平台</strong><span>治理与分析工作台</span></div>}
      </div>
      <nav aria-label="主要导航">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <Tooltip key={item.id} content={collapsed ? item.label : ""} relationship="label">
              <button className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}>
                <Icon size={20} weight={page === item.id ? "fill" : "regular"} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            </Tooltip>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        {!collapsed && <div className="workspace-switch"><Database size={18} /><div><span>命名空间</span><strong>retail</strong></div><CaretDown size={14} /></div>}
        <button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}>
          <SidebarSimple size={19} />
        </button>
      </div>
    </aside>
  );
}

function MobileNav({ page, setPage }: { page: Page; setPage: (page: Page) => void }) {
  return <nav className="mobile-nav" aria-label="移动端主要导航">
    {nav.slice(0, 4).map((item) => {
      const Icon = item.icon;
      return <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)}><Icon size={19} weight={page === item.id ? "fill" : "regular"} /><span>{item.label.replace("工作概览", "概览").replace("本体模型", "本体").replace("语义实验室", "实验室").replace("审计记录", "审计")}</span></button>;
    })}
  </nav>;
}

function Header({ page, dark, setDark, onValidate, onPublish, status }: { page: Page; dark: boolean; setDark: (value: boolean) => void; onValidate: () => void; onPublish: () => void; status: string }) {
  const title = nav.find((item) => item.id === page)?.label ?? "语义平台";
  return (
    <header className="topbar">
      <div className="mobile-brand"><Logo /><strong>{title}</strong></div>
      <div className="breadcrumb"><span>retail</span><CaretRight size={13} /><strong>{title}</strong></div>
      <div className="top-actions">
        <Tooltip content={dark ? "切换浅色模式" : "切换深色模式"} relationship="label">
          <Button appearance="subtle" icon={dark ? <Sun /> : <Moon />} onClick={() => setDark(!dark)} aria-label="切换主题" />
        </Tooltip>
        {page === "ontology" && <>
          <Button appearance="secondary" icon={<ShieldCheck />} onClick={onValidate}>校验草稿</Button>
          <Button appearance="primary" icon={<RocketLaunch />} onClick={onPublish} disabled={status === "PUBLISHED"}>发布版本</Button>
        </>}
      </div>
    </header>
  );
}

function Kpi({ label, value, helper, tone = "default" }: { label: string; value: string; helper: string; tone?: "default" | "accent" }) {
  return (
    <article className={`kpi ${tone === "accent" ? "kpi-accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  );
}

function Overview({ snapshot, setPage }: { snapshot: OntologySnapshot; setPage: (page: Page) => void }) {
  const issues = validateSnapshot(snapshot);
  const checks = [
    { title: "完善本体草稿", detail: `${snapshot.objects.length} 个对象和 ${snapshot.metrics.length} 个指标已定义`, done: true, action: "查看模型", page: "ontology" as Page },
    { title: "运行发布校验", detail: issues.length ? `${issues.length} 项需要处理` : "当前草稿已通过核心规则", done: issues.length === 0, action: "检查规则", page: "ontology" as Page },
    { title: "验证语义调用链", detail: "从问题框架生成 Query IR 与 SQL", done: false, action: "开始测试", page: "lab" as Page },
  ];
  return (
    <main className="page overview-page">
      <section className="page-intro">
        <div><p className="eyebrow">本体控制平面</p><h1>让业务语义稳定进入每一次分析</h1><p>从本体草稿到受治理 SQL，在同一版本和证据链中完成。</p></div>
        <Button appearance="primary" size="large" icon={<ArrowRight />} iconPosition="after" onClick={() => setPage("lab")}>运行语义分析</Button>
      </section>
      <section className="kpi-grid" aria-label="平台指标">
        <Kpi label="本体对象" value={String(snapshot.objects.length)} helper="全部映射到物理表" />
        <Kpi label="正式指标" value={String(snapshot.metrics.length)} helper={`${snapshot.metrics.filter((metric) => metric.metricType === "BASE").length} 个基础指标`} />
        <Kpi label="安全关系" value={String(snapshot.relations.length)} helper="未发现高扇出路径" />
        <Kpi label="当前版本" value={`v${snapshot.version}`} helper={snapshot.status === "PUBLISHED" ? "已发布快照" : "基于已发布版本编辑"} tone="accent" />
      </section>
      <section className="overview-grid">
        <article className="panel getting-started">
          <div className="panel-heading"><div><h2>完成核心闭环</h2><p>按依赖顺序推进，避免在模型未稳定时接入 Agent。</p></div><span>{checks.filter((item) => item.done).length}/{checks.length}</span></div>
          <div className="task-list">
            {checks.map((item) => <button key={item.title} onClick={() => setPage(item.page)} className="task-row">
              <span className={`check-icon ${item.done ? "done" : ""}`}>{item.done ? <Check size={16} weight="bold" /> : null}</span>
              <span className="task-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
              <span className="task-action">{item.action}<CaretRight size={14} /></span>
            </button>)}
          </div>
        </article>
        <article className="panel flow-panel">
          <div className="panel-heading"><div><h2>平台调用链</h2><p>每一步都固定在同一本体版本。</p></div></div>
          <div className="flow-list">
            {["问题框架", "语义绑定", "规则规划", "Query IR", "只读 SQL"].map((step, index) => <div className="flow-step" key={step}><span>{index + 1}</span><strong>{step}</strong>{index < 4 && <CaretRight size={14} />}</div>)}
          </div>
          <div className="guard-note"><ShieldCheck size={20} /><div><strong>安全边界已启用</strong><span>Agent 只能提交结构化引用，不能提交自由 SQL。</span></div></div>
        </article>
      </section>
    </main>
  );
}

function EmptyState({ kind, onCreate }: { kind: string; onCreate: () => void }) {
  return <div className="empty-state"><CirclesThreePlus size={36} /><h3>还没有{kind}</h3><p>创建第一项后，可以在同一草稿中校验并发布。</p><Button appearance="primary" icon={<Plus />} onClick={onCreate}>立即创建</Button></div>;
}

function NewObjectDialog({ onCreate }: { onCreate: (object: OntologyObject) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [source, setSource] = useState("");
  const [type, setType] = useState<ObjectType>("ENTITY");
  const create = () => {
    if (!label.trim() || !source.trim()) return;
    const id = `obj_${Date.now()}`;
    onCreate({ id, name: label.trim().toLowerCase().replace(/\s+/g, "_"), label: label.trim(), description: `一行代表一个${label.trim()}`, sourceTableId: source.trim(), status: "DRAFT", objectType: type, grainPropertyIds: [], grain: label.trim(), synonyms: [], bindingPriority: 50, properties: [] });
    setLabel(""); setSource(""); setOpen(false);
  };
  return <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
    <DialogTrigger disableButtonEnhancement><Button appearance="primary" icon={<Plus />}>新建对象</Button></DialogTrigger>
    <DialogSurface><DialogBody><DialogTitle>创建本体对象</DialogTitle><DialogContent className="dialog-form">
      <Field label="业务名称" required hint="显示给建模者和 Agent"><Input value={label} onChange={(_, data) => setLabel(data.value)} placeholder="例如：商品" /></Field>
      <Field label="对象类型" required><Select value={type} onChange={(_, data) => setType(data.value as ObjectType)}>{Object.keys(objectTypeLabels).map((key) => <option key={key} value={key}>{objectTypeLabels[key as ObjectType]}</option>)}</Select></Field>
      <Field label="来源表" required hint="Physical Catalog 中的表或视图"><Input value={source} onChange={(_, data) => setSource(data.value)} placeholder="例如：dim_product" /></Field>
    </DialogContent><DialogActions><DialogTrigger disableButtonEnhancement><Button appearance="secondary">取消</Button></DialogTrigger><Button appearance="primary" onClick={create} disabled={!label.trim() || !source.trim()}>创建对象</Button></DialogActions></DialogBody></DialogSurface>
  </Dialog>;
}

function Ontology({ snapshot, setSnapshot, issues }: { snapshot: OntologySnapshot; setSnapshot: (snapshot: OntologySnapshot) => void; issues: ValidationIssue[] | null }) {
  const [tab, setTab] = useState<EntityTab>("objects");
  const [selectedId, setSelectedId] = useState(snapshot.objects[0]?.id ?? "");
  const selected = snapshot.objects.find((item) => item.id === selectedId) ?? snapshot.objects[0];
  const addObject = (object: OntologyObject) => { setSnapshot({ ...snapshot, status: "DRAFT", objects: [...snapshot.objects, object] }); setSelectedId(object.id); setTab("objects"); };
  return <main className="page ontology-page">
    <section className="page-title-row"><div><h1>本体模型</h1><p>定义业务对象、指标和安全关系，发布后生成不可变快照。</p></div><NewObjectDialog onCreate={addObject} /></section>
    {issues && <section className={`validation-banner ${issues.some((issue) => issue.level === "ERROR") ? "has-error" : "is-success"}`}>
      {issues.length ? <Warning size={22} weight="fill" /> : <CheckCircle size={22} weight="fill" />}
      <div><strong>{issues.length ? `发现 ${issues.length} 项校验结果` : "草稿通过发布校验"}</strong><span>{issues.length ? "选择模型实体并修正错误后再次校验。" : "对象粒度、指标依赖和关系路径均符合规范。"}</span></div>
      {issues.length > 0 && <div className="issue-codes">{issues.slice(0, 3).map((issue) => <code key={`${issue.code}-${issue.entityId}`}>{issue.code}</code>)}</div>}
    </section>}
    <section className="model-shell panel">
      <div className="entity-tabs" role="tablist">
        {(["objects", "metrics", "relations"] as EntityTab[]).map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item === "objects" ? `对象 ${snapshot.objects.length}` : item === "metrics" ? `指标 ${snapshot.metrics.length}` : `关系 ${snapshot.relations.length}`}</button>)}
      </div>
      {tab === "objects" && (snapshot.objects.length ? <div className="model-content">
        <div className="entity-list">
          <div className="list-search"><MagnifyingGlass size={17} /><input aria-label="搜索对象" placeholder="搜索对象" /></div>
          {snapshot.objects.map((object) => <button key={object.id} onClick={() => setSelectedId(object.id)} className={`entity-row ${selected?.id === object.id ? "active" : ""}`}><span className="entity-icon"><Database size={18} /></span><span><strong>{object.label}</strong><small>{object.sourceTableId}</small></span><CaretRight size={14} /></button>)}
        </div>
        {selected && <div className="entity-detail">
          <div className="detail-heading"><div><div className="title-with-status"><h2>{selected.label}</h2><StatusBadge status={selected.status} /></div><p>{selected.description}</p></div><Button appearance="secondary">编辑对象</Button></div>
          <div className="detail-meta"><div><span>对象类型</span><strong>{objectTypeLabels[selected.objectType]}</strong></div><div><span>业务粒度</span><strong>{selected.grain}</strong></div><div><span>来源表</span><strong className="mono">{selected.sourceTableId}</strong></div><div><span>默认时间</span><strong>{selected.properties.find((property) => property.id === selected.defaultTimePropertyId)?.label ?? "未配置"}</strong></div></div>
          <div className="property-heading"><div><h3>属性</h3><span>{selected.properties.length} 个字段</span></div><Button appearance="subtle" icon={<Plus />}>添加属性</Button></div>
          <div className="property-table" role="table" aria-label={`${selected.label}属性列表`}>
            <div className="property-row table-head" role="row"><span>业务名称</span><span>语义</span><span>物理字段</span><span>可见性</span></div>
            {selected.properties.map((property) => <div className="property-row" role="row" key={property.id}><span><strong>{property.label}</strong><small>{property.name}</small></span><span><code>{property.meaning}</code></span><span className="mono">{property.sourceColumn}</span><span>{property.visibility === "ANALYTICAL" ? "可分析" : "受限"}</span></div>)}
          </div>
        </div>}
      </div> : <EmptyState kind="对象" onCreate={() => undefined} />)}
      {tab === "metrics" && <div className="collection-view"><div className="collection-header"><div><h2>指标口径</h2><p>正式指标仅属于一个事实对象，派生依赖由服务端校验。</p></div><Button appearance="secondary" icon={<Plus />}>新建指标</Button></div><div className="metric-grid">{snapshot.metrics.map((metric) => <article className="metric-item" key={metric.id}><div><span className="metric-icon"><ChartLineUp size={18} /></span><StatusBadge status={metric.status} /></div><h3>{metric.label}</h3><p>{metric.description}</p><dl><div><dt>类型</dt><dd>{metric.metricType}</dd></div><div><dt>聚合</dt><dd>{metric.aggregation}</dd></div><div><dt>格式</dt><dd>{metric.format}</dd></div></dl></article>)}</div></div>}
      {tab === "relations" && <div className="collection-view"><div className="collection-header"><div><h2>关系路径</h2><p>基数、方向和必选性共同决定 Join 与聚合安全。</p></div><Button appearance="secondary" icon={<Plus />}>新建关系</Button></div><div className="relation-list">{snapshot.relations.map((relation) => { const source = snapshot.objects.find((item) => item.id === relation.sourceObjectId)!; const target = snapshot.objects.find((item) => item.id === relation.targetObjectId)!; return <article className="relation-row" key={relation.id}><div className="relation-nodes"><span>{source.label}</span><div><GitBranch size={17} /><small>{relation.cardinality}</small></div><span>{target.label}</span></div><div className="relation-meta"><StatusBadge status={relation.status} /><span>{relation.required ? "INNER JOIN" : "LEFT JOIN"}</span><span>扇出风险 {relation.fanoutRisk}</span></div></article>; })}</div></div>}
    </section>
  </main>;
}

function SemanticLab({ snapshot, addAudit }: { snapshot: OntologySnapshot; addAudit: (events: AuditEvent[]) => void }) {
  const [question, setQuestion] = useState("今年华东销售额按月趋势");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof compilePlan> | null>(null);
  const [error, setError] = useState("");
  const hits = useMemo(() => result ? semanticSearch(snapshot, question) : [], [result, snapshot, question]);
  const binding = result ? bindValue(snapshot, "华东")[0] : undefined;
  const run = () => {
    setLoading(true); setError(""); setResult(null);
    window.setTimeout(() => {
      try {
        const metric = semanticSearch(snapshot, question).find((item) => item.kind === "METRIC") ?? { id: "metric_sales" };
        const bound = question.includes("华东") ? bindValue(snapshot, "华东")[0] : undefined;
        const plan = compilePlan(snapshot, { query: question, metricId: metric.id, timeGrain: question.includes("月") ? "MONTH" : undefined, boundValue: bound });
        setResult(plan);
        addAudit([
          auditEvent(6, "frame", "QUESTION_FRAME_SUBMITTED", question),
          auditEvent(7, "search", "ONTOLOGY_SEARCHED", "语义候选已按稳定规则排序"),
          ...(bound ? [auditEvent(8, "binding", "VALUE_BOUND", `${bound.value}绑定到${bound.propertyLabel}`)] : []),
          auditEvent(9, "planning", "PLAN_COMPILED", plan.planId),
          auditEvent(10, "sql", "SQL_GUARD_PASSED", "参数和值已分离"),
        ]);
      } catch (caught) { setError(caught instanceof Error ? caught.message : "计划编译失败"); }
      setLoading(false);
    }, 520);
  };
  return <main className="page lab-page">
    <section className="page-title-row"><div><h1>语义实验室</h1><p>用一次受控分析验证本体的检索、绑定、规划和 SQL 行为。</p></div><Badge appearance="tint" color="informative">固定版本 v{snapshot.version}</Badge></section>
    <section className="lab-grid">
      <div className="lab-main">
        <article className="panel question-panel"><Field label="输入业务问题" hint="问题原文会保留到 Question Frame 中"><Textarea size="large" value={question} onChange={(_, data) => setQuestion(data.value)} resize="vertical" /><div className="question-actions"><div className="example-list"><button onClick={() => setQuestion("今年华东销售额按月趋势")}>月度趋势</button><button onClick={() => setQuestion("线上渠道销售额")}>渠道销售</button></div><Button appearance="primary" size="large" onClick={run} disabled={!question.trim() || loading} icon={loading ? <Spinner size="tiny" /> : <ArrowRight />} iconPosition="after">{loading ? "正在规划" : "生成分析计划"}</Button></div></Field></article>
        {error && <div className="error-state"><Warning size={20} /><div><strong>计划被规则层拒绝</strong><span>{error}</span></div></div>}
        {!result && !loading && <article className="lab-placeholder"><Code size={40} /><h2>从问题到安全 SQL</h2><p>平台会固定版本，绑定完整业务值，并在生成 SQL 前检查粒度和扇出。</p></article>}
        {loading && <article className="panel loading-state"><div className="skeleton wide" /><div className="skeleton medium" /><div className="skeleton code" /></article>}
        {result && <>
          <article className="panel plan-summary"><div className="result-title"><div><CheckCircle size={24} weight="fill" /><div><h2>计划已通过安全校验</h2><p>{result.planId}，使用本体版本 v{result.ontologyVersion}</p></div></div><Badge appearance="filled" color="success">可执行</Badge></div><div className="plan-facts"><div><span>事实根</span><strong>销售事件</strong><code>O1</code></div><div><span>指标</span><strong>{hits.find((item) => item.kind === "METRIC")?.label ?? "销售额"}</strong><code>M1</code></div><div><span>时间粒度</span><strong>按月</strong><code>D1</code></div>{binding && <div><span>业务值</span><strong>{binding.value}</strong><code>B1</code></div>}</div></article>
          <article className="panel sql-panel"><div className="sql-heading"><div><Code size={20} /><h2>参数化 SQL 预览</h2></div><Button appearance="subtle" onClick={() => navigator.clipboard?.writeText(result.sql)}>复制 SQL</Button></div><pre><code>{result.sql}</code></pre><div className="params"><span>参数</span>{result.params.map((param, index) => <code key={`${param}-${index}`}>${index + 1} {param}</code>)}</div></article>
        </>}
      </div>
      <aside className="pipeline panel"><h2>分析流水线</h2><p>服务端控制每一步的输入边界。</p>{["固定本体版本", "提交问题框架", "检索语义候选", "绑定业务值", "校验分析计划", "生成 Query IR", "只读 SQL Guard"].map((step, index) => { const done = result || (loading && index < 3); return <div className={`pipeline-step ${done ? "done" : ""}`} key={step}><span>{done ? <Check size={14} weight="bold" /> : index + 1}</span><div><strong>{step}</strong><small>{index === 0 ? `v${snapshot.version}` : index === 3 ? "B 引用不可改写" : index === 4 ? "粒度、关系、可加性" : ""}</small></div></div>; })}<div className="pipeline-note"><ShieldCheck size={19} /><span>Agent 不接触物理字段和 Join 路径。</span></div></aside>
    </section>
  </main>;
}

function Audit({ events }: { events: AuditEvent[] }) {
  return <main className="page audit-page"><section className="page-title-row"><div><h1>审计记录</h1><p>追踪问题框架、绑定、计划和 SQL 的完整证据链。</p></div><Button appearance="secondary">导出记录</Button></section><section className="audit-summary"><div><ShieldCheck size={22} /><div><strong>审计覆盖完整</strong><span>所有外部调用均保留版本、结果和耗时。</span></div></div><Badge appearance="filled" color="success">100%</Badge></section><section className="panel audit-table"><div className="audit-row audit-head"><span>序号</span><span>时间</span><span>阶段</span><span>动作</span><span>结果</span><span>耗时</span></div>{[...events].reverse().map((event) => <div className="audit-row" key={`${event.sequence}-${event.timestamp}`}><span className="mono">#{event.sequence.toString().padStart(2, "0")}</span><span>{new Date(event.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span><span>{event.stage}</span><span><strong>{event.action}</strong><small>{event.detail}</small></span><span><Badge appearance="tint" color={event.outcome === "SUCCESS" ? "success" : "danger"}>{event.outcome}</Badge></span><span className="mono">{event.durationMs} ms</span></div>)}</section></main>;
}

function ApiPage() {
  const endpoints = [
    ["POST", "/v1/semantic-sessions", "创建固定版本会话"],
    ["POST", "/v1/semantic-sessions/{id}/question-frame", "提交问题框架"],
    ["POST", "/v1/semantic-sessions/{id}/search", "搜索语义候选"],
    ["POST", "/v1/semantic-sessions/{id}/plans:compile", "生成 IR 和 SQL 预览"],
    ["POST", "/v1/semantic-sessions/{id}/plans/{planId}:execute", "执行固定计划"],
  ];
  return <main className="page api-page"><section className="page-title-row"><div><h1>接入与 API</h1><p>HTTP 是标准协议，SDK 与 MCP 只负责适配和重试。</p></div><Button appearance="primary">查看 OpenAPI</Button></section><section className="api-layout"><article className="panel endpoint-panel"><div className="collection-header"><div><h2>核心端点</h2><p>外部调用只传会话短引用。</p></div></div><div className="endpoint-list">{endpoints.map(([method, path, description]) => <div className="endpoint-row" key={path}><code>{method}</code><div><strong>{path}</strong><span>{description}</span></div><CaretRight size={15} /></div>)}</div></article><aside className="panel access-panel"><BracketsCurly size={28} /><h2>分层接入</h2><p>业务规则统一在服务端，调用适配层不复制语义和 SQL 规则。</p><div><span>HTTP / OpenAPI</span><strong>标准契约</strong></div><div><span>TypeScript / Python</span><strong>类型与重试</strong></div><div><span>MCP Adapter</span><strong>Agent 工具协议</strong></div><Button appearance="secondary">创建客户端密钥</Button></aside></section></main>;
}

export default function App() {
  const [page, setPage] = useState<Page>("overview");
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [snapshot, setSnapshot] = useState<OntologySnapshot>(structuredClone(sampleSnapshot));
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>(initialAudit);

  const validate = () => {
    const result = validateSnapshot(snapshot);
    setIssues(result);
    setEvents((current) => [...current, auditEvent(current.length + 1, "publish", "DRAFT_VALIDATED", result.length ? `${result.length} 项校验结果` : "草稿通过校验", result.some((item) => item.level === "ERROR") ? "REJECTED" : "SUCCESS")]);
  };
  const publish = () => {
    const result = validateSnapshot(snapshot);
    setIssues(result);
    if (result.some((item) => item.level === "ERROR")) return;
    setSnapshot({ ...snapshot, version: snapshot.version + 1, baseVersion: snapshot.version, status: "PUBLISHED", publishedAt: new Date().toISOString(), objects: snapshot.objects.map((item) => ({ ...item, status: "PUBLISHED" })), metrics: snapshot.metrics.map((item) => ({ ...item, status: "PUBLISHED" })), relations: snapshot.relations.map((item) => ({ ...item, status: "PUBLISHED" })) });
    setEvents((current) => [...current, auditEvent(current.length + 1, "publish", "ONTOLOGY_PUBLISHED", `retail v${snapshot.version + 1}`)]);
  };

  return <FluentProvider theme={dark ? semanticDarkTheme : semanticLightTheme} className={dark ? "app-root dark" : "app-root"}>
    <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} />
    <div className="app-body">
      <Header page={page} dark={dark} setDark={setDark} onValidate={validate} onPublish={publish} status={snapshot.status} />
      {page === "overview" && <Overview snapshot={snapshot} setPage={setPage} />}
      {page === "ontology" && <Ontology snapshot={snapshot} setSnapshot={setSnapshot} issues={issues} />}
      {page === "lab" && <SemanticLab snapshot={snapshot} addAudit={(next) => setEvents((current) => [...current, ...next])} />}
      {page === "audit" && <Audit events={events} />}
      {page === "api" && <ApiPage />}
    </div>
    <MobileNav page={page} setPage={setPage} />
  </FluentProvider>;
}
