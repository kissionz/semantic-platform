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
  ArrowRight,
  BracketsCurly,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  ChartBar,
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
} from "@phosphor-icons/react";
import { auditEvent, bindValue, compilePlan, semanticSearch, validateSnapshot } from "./domain/engine";
import { sampleSnapshot } from "./domain/sample";
import type { AuditEvent, ObjectType, OntologyObject, OntologySnapshot, ValidationIssue } from "./domain/types";

type Page = "ontology" | "lab" | "audit" | "api";
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
  { id: "ontology" as const, label: "本体", icon: CirclesThreePlus },
  { id: "lab" as const, label: "语义测试", icon: ListMagnifyingGlass },
  { id: "audit" as const, label: "审计", icon: ClockCounterClockwise },
  { id: "api" as const, label: "API", icon: BracketsCurly },
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
        {!collapsed && <div><strong>语义平台</strong><span>retail</span></div>}
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
    {nav.map((item) => {
      const Icon = item.icon;
      return <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)}><Icon size={19} weight={page === item.id ? "fill" : "regular"} /><span>{item.label}</span></button>;
    })}
  </nav>;
}

function Header({ page, dark, setDark }: { page: Page; dark: boolean; setDark: (value: boolean) => void }) {
  const title = nav.find((item) => item.id === page)?.label ?? "语义平台";
  return (
    <header className="topbar">
      <div className="mobile-brand"><Logo /><strong>{title}</strong></div>
      <div className="breadcrumb"><span>retail</span><CaretRight size={13} /><strong>{title}</strong></div>
      <div className="top-actions">
        <Tooltip content={dark ? "切换浅色模式" : "切换深色模式"} relationship="label">
          <Button appearance="subtle" icon={dark ? <Sun /> : <Moon />} onClick={() => setDark(!dark)} aria-label="切换主题" />
        </Tooltip>
      </div>
    </header>
  );
}

function EmptyState({ kind }: { kind: string }) {
  return <div className="empty-state"><CirclesThreePlus size={32} /><h3>暂无{kind}</h3></div>;
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
      <Field label="业务名称" required><Input value={label} onChange={(_, data) => setLabel(data.value)} placeholder="例如：商品" /></Field>
      <Field label="对象类型" required><Select value={type} onChange={(_, data) => setType(data.value as ObjectType)}>{Object.keys(objectTypeLabels).map((key) => <option key={key} value={key}>{objectTypeLabels[key as ObjectType]}</option>)}</Select></Field>
      <Field label="来源表" required><Input value={source} onChange={(_, data) => setSource(data.value)} placeholder="例如：dim_product" /></Field>
    </DialogContent><DialogActions><DialogTrigger disableButtonEnhancement><Button appearance="secondary">取消</Button></DialogTrigger><Button appearance="primary" onClick={create} disabled={!label.trim() || !source.trim()}>创建对象</Button></DialogActions></DialogBody></DialogSurface>
  </Dialog>;
}

function Ontology({ snapshot, setSnapshot, issues, onValidate, onPublish }: { snapshot: OntologySnapshot; setSnapshot: (snapshot: OntologySnapshot) => void; issues: ValidationIssue[] | null; onValidate: () => void; onPublish: () => void }) {
  const [tab, setTab] = useState<EntityTab>("objects");
  const [query, setQuery] = useState("");
  const [selectedObjectId, setSelectedObjectId] = useState(snapshot.objects[0]?.id ?? "");
  const [selectedMetricId, setSelectedMetricId] = useState(snapshot.metrics[0]?.id ?? "");
  const [selectedRelationId, setSelectedRelationId] = useState(snapshot.relations[0]?.id ?? "");
  const selectedObject = snapshot.objects.find((item) => item.id === selectedObjectId) ?? snapshot.objects[0];
  const selectedMetric = snapshot.metrics.find((item) => item.id === selectedMetricId) ?? snapshot.metrics[0];
  const selectedRelation = snapshot.relations.find((item) => item.id === selectedRelationId) ?? snapshot.relations[0];
  const matchesQuery = (name: string, label = "") => `${name} ${label}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const objects = snapshot.objects.filter((object) => matchesQuery(object.name, object.label));
  const metrics = snapshot.metrics.filter((metric) => matchesQuery(metric.name, metric.label));
  const relations = snapshot.relations.filter((relation) => matchesQuery(relation.name));
  const resultCount = tab === "objects" ? objects.length : tab === "metrics" ? metrics.length : relations.length;
  const hasErrors = Boolean(issues?.some((issue) => issue.level === "ERROR"));
  const addObject = (object: OntologyObject) => {
    setSnapshot({ ...snapshot, status: "DRAFT", objects: [...snapshot.objects, object] });
    setSelectedObjectId(object.id);
    setTab("objects");
    setQuery("");
  };

  const renderCatalog = () => {
    if (!resultCount) return <p className="catalog-empty">{query ? "未找到结果" : "暂无内容"}</p>;
    if (tab === "objects") return objects.map((object) => <button key={object.id} onClick={() => setSelectedObjectId(object.id)} className={`catalog-row ${selectedObject?.id === object.id ? "active" : ""}`}><span className="catalog-icon"><Database size={17} /></span><span><strong>{object.label}</strong><small>{object.properties.length} 个属性</small></span><CaretRight size={14} /></button>);
    if (tab === "metrics") return metrics.map((metric) => <button key={metric.id} onClick={() => setSelectedMetricId(metric.id)} className={`catalog-row ${selectedMetric?.id === metric.id ? "active" : ""}`}><span className="catalog-icon"><ChartBar size={17} /></span><span><strong>{metric.label}</strong><small>{metric.metricType === "BASE" ? "基础指标" : "派生指标"}</small></span><CaretRight size={14} /></button>);
    return relations.map((relation) => <button key={relation.id} onClick={() => setSelectedRelationId(relation.id)} className={`catalog-row ${selectedRelation?.id === relation.id ? "active" : ""}`}><span className="catalog-icon"><GitBranch size={17} /></span><span><strong>{relation.name}</strong><small>{relation.cardinality}</small></span><CaretRight size={14} /></button>);
  };

  const renderInspector = () => {
    if (tab === "objects" && selectedObject) return <>
      <div className="inspector-heading"><div><h2>{selectedObject.label}</h2><span>{selectedObject.name}</span></div><StatusBadge status={selectedObject.status} /></div>
      <div className="object-summary"><div><span>类型</span><strong>{objectTypeLabels[selectedObject.objectType]}</strong></div><div><span>粒度</span><strong>{selectedObject.grain}</strong></div><div><span>来源</span><strong className="mono">{selectedObject.sourceTableId}</strong></div><div><span>时间</span><strong>{selectedObject.properties.find((property) => property.id === selectedObject.defaultTimePropertyId)?.label ?? "未配置"}</strong></div></div>
      <div className="table-title"><h3>属性</h3><span>{selectedObject.properties.length}</span></div>
      <div className="property-table" role="table" aria-label={`${selectedObject.label}属性列表`}><div className="property-row table-head" role="row"><span>名称</span><span>语义</span><span>物理字段</span><span>可见性</span></div>{selectedObject.properties.map((property) => <div className="property-row" role="row" key={property.id}><span><strong>{property.label}</strong><small>{property.name}</small></span><span><code>{property.meaning}</code></span><span className="mono">{property.sourceColumn}</span><span>{property.visibility === "ANALYTICAL" ? "可分析" : "受限"}</span></div>)}</div>
    </>;
    if (tab === "metrics" && selectedMetric) {
      const owner = snapshot.objects.find((object) => object.id === selectedMetric.objectId);
      const left = snapshot.metrics.find((metric) => metric.id === selectedMetric.leftMetricId);
      const right = snapshot.metrics.find((metric) => metric.id === selectedMetric.rightMetricId);
      const operator = { ADD: "+", SUBTRACT: "-", MULTIPLY: "×", DIVIDE: "/", RATIO: "/" }[selectedMetric.calculationOperator ?? "DIVIDE"];
      const calculation = `${left?.label ?? "左指标"} ${operator} ${right?.label ?? "右指标"}`;
      const formula = selectedMetric.definitionMode === "SQL" ? selectedMetric.expression : selectedMetric.metricType === "BASE" ? `${selectedMetric.aggregation}(${owner?.properties.find((property) => property.id === selectedMetric.sourcePropertyId)?.sourceColumn ?? "*"})` : selectedMetric.scale && selectedMetric.scale !== 1 ? `(${calculation}) × ${selectedMetric.scale}` : calculation;
      return <><div className="inspector-heading"><div><h2>{selectedMetric.label}</h2><span>{selectedMetric.name}</span></div><StatusBadge status={selectedMetric.status} /></div><div className="metric-definition"><span>计算口径</span><strong>{formula}</strong></div><dl className="definition-list"><div><dt>所属对象</dt><dd>{owner?.label}</dd></div><div><dt>指标类型</dt><dd>{selectedMetric.metricType}</dd></div><div><dt>展示格式</dt><dd>{selectedMetric.format}</dd></div><div><dt>单位</dt><dd>{selectedMetric.unit ?? "无"}</dd></div></dl></>;
    }
    if (tab === "relations" && selectedRelation) {
      const source = snapshot.objects.find((object) => object.id === selectedRelation.sourceObjectId);
      const target = snapshot.objects.find((object) => object.id === selectedRelation.targetObjectId);
      return <><div className="inspector-heading"><div><h2>{selectedRelation.name}</h2><span>{selectedRelation.type}</span></div><StatusBadge status={selectedRelation.status} /></div><div className="relation-visual"><strong>{source?.label}</strong><span><GitBranch size={18} />{selectedRelation.cardinality}</span><strong>{target?.label}</strong></div><dl className="definition-list"><div><dt>寻路方向</dt><dd>{selectedRelation.direction}</dd></div><div><dt>Join</dt><dd>{selectedRelation.required ? "INNER JOIN" : "LEFT JOIN"}</dd></div><div><dt>扇出风险</dt><dd>{selectedRelation.fanoutRisk}</dd></div><div><dt>状态</dt><dd>{selectedRelation.enabled ? "已启用" : "已停用"}</dd></div></dl></>;
    }
    return <EmptyState kind={tab === "objects" ? "对象" : tab === "metrics" ? "指标" : "关系"} />;
  };

  return <main className="page ontology-page">
    <section className="compact-page-header"><div><h1>业务本体</h1><div className="header-status"><StatusBadge status={snapshot.status} /><span>v{snapshot.version}</span></div></div><NewObjectDialog onCreate={addObject} /></section>
    <section className="ontology-stats" aria-label="本体统计"><div><CirclesThreePlus size={18} /><span>对象</span><strong>{snapshot.objects.length}</strong></div><div><ChartBar size={18} /><span>指标</span><strong>{snapshot.metrics.length}</strong></div><div><GitBranch size={18} /><span>关系</span><strong>{snapshot.relations.length}</strong></div><div><ShieldCheck size={18} /><span>校验</span><strong>{issues === null ? "未运行" : hasErrors ? `${issues.length} 项` : "通过"}</strong></div></section>
    <section className="ontology-workspace">
      <section className="panel ontology-catalog"><div className="workspace-panel-heading"><h2>目录</h2><span>{resultCount}</span></div><div className="catalog-tabs" role="tablist" aria-label="本体类型">{(["objects", "metrics", "relations"] as EntityTab[]).map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} key={item} onClick={() => { setTab(item); setQuery(""); }}>{item === "objects" ? "对象" : item === "metrics" ? "指标" : "关系"}</button>)}</div><div className="catalog-search"><MagnifyingGlass size={15} /><input aria-label="搜索本体目录" placeholder="搜索" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="catalog-list">{renderCatalog()}</div></section>
      <section className="panel ontology-inspector">{renderInspector()}</section>
      <aside className="panel release-panel">
        <div className="workspace-panel-heading"><h2>草稿与发布</h2><span>v{snapshot.version}</span></div>
        <div className="release-state"><span className={snapshot.status === "PUBLISHED" ? "state-icon published" : "state-icon"}>{snapshot.status === "PUBLISHED" ? <Check size={17} weight="bold" /> : <Code size={17} />}</span><div><strong>{snapshot.status === "PUBLISHED" ? "已发布" : "草稿"}</strong><small>{snapshot.objects.length} 对象，{snapshot.metrics.length} 指标</small></div></div>
        {issues && <div className={`compact-validation ${hasErrors ? "invalid" : "valid"}`} role="status">{hasErrors ? <Warning size={18} weight="fill" /> : <CheckCircle size={18} weight="fill" />}<div><strong>{hasErrors ? "需要修正" : "校验通过"}</strong><span>{hasErrors ? `${issues.filter((issue) => issue.level === "ERROR").length} 个错误` : snapshot.status === "PUBLISHED" ? "已生效" : "可以发布"}</span></div></div>}
        {!!issues?.length && <ul className="validation-list">{issues.map((issue, index) => <li key={`${issue.code}-${issue.entityId}-${index}`}><strong>{snapshot.objects.find((object) => object.id === issue.entityId)?.label ?? issue.entityId}</strong><span>{issue.message}</span></li>)}</ul>}
        <div className="release-actions"><Button appearance="secondary" icon={<ShieldCheck />} onClick={onValidate}>校验草稿</Button><Button appearance="primary" icon={<RocketLaunch />} onClick={onPublish} disabled={snapshot.status === "PUBLISHED" || hasErrors}>发布版本</Button></div>
      </aside>
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
    <section className="compact-page-header"><div><h1>语义测试</h1><div className="header-status"><Badge appearance="tint" color="informative">v{snapshot.version}</Badge></div></div></section>
    <section className="lab-grid">
      <div className="lab-main">
        <article className="panel question-panel"><Field label="业务问题"><Textarea size="large" value={question} onChange={(_, data) => setQuestion(data.value)} resize="vertical" /><div className="question-actions"><div className="example-list"><button onClick={() => setQuestion("今年华东销售额按月趋势")}>月度趋势</button><button onClick={() => setQuestion("线上渠道销售额")}>渠道销售</button></div><Button appearance="primary" size="large" onClick={run} disabled={!question.trim() || loading} icon={loading ? <Spinner size="tiny" /> : <ArrowRight />} iconPosition="after">{loading ? "正在规划" : "生成计划"}</Button></div></Field></article>
        {error && <div className="error-state"><Warning size={20} /><div><strong>计划被规则层拒绝</strong><span>{error}</span></div></div>}
        {!result && !loading && <article className="lab-placeholder"><Code size={36} /><h2>等待生成计划</h2></article>}
        {loading && <article className="panel loading-state"><div className="skeleton wide" /><div className="skeleton medium" /><div className="skeleton code" /></article>}
        {result && <>
          <article className="panel plan-summary"><div className="result-title"><div><CheckCircle size={24} weight="fill" /><div><h2>计划已通过安全校验</h2><p>{result.planId}，使用本体版本 v{result.ontologyVersion}</p></div></div><Badge appearance="filled" color="success">可执行</Badge></div><div className="plan-facts"><div><span>事实根</span><strong>销售事件</strong><code>O1</code></div><div><span>指标</span><strong>{hits.find((item) => item.kind === "METRIC")?.label ?? "销售额"}</strong><code>M1</code></div><div><span>时间粒度</span><strong>按月</strong><code>D1</code></div>{binding && <div><span>业务值</span><strong>{binding.value}</strong><code>B1</code></div>}</div></article>
          <article className="panel sql-panel"><div className="sql-heading"><div><Code size={20} /><h2>参数化 SQL 预览</h2></div><Button appearance="subtle" onClick={() => navigator.clipboard?.writeText(result.sql)}>复制 SQL</Button></div><pre><code>{result.sql}</code></pre><div className="params"><span>参数</span>{result.params.map((param, index) => <code key={`${param}-${index}`}>${index + 1} {param}</code>)}</div></article>
        </>}
      </div>
    </section>
  </main>;
}

function Audit({ events }: { events: AuditEvent[] }) {
  return <main className="page audit-page"><section className="compact-page-header"><div><h1>审计</h1></div><Button appearance="secondary">导出记录</Button></section><section className="panel audit-table"><div className="audit-row audit-head"><span>序号</span><span>时间</span><span>阶段</span><span>动作</span><span>结果</span><span>耗时</span></div>{[...events].reverse().map((event) => <div className="audit-row" key={`${event.sequence}-${event.timestamp}`}><span className="mono">#{event.sequence.toString().padStart(2, "0")}</span><span>{new Date(event.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span><span>{event.stage}</span><span><strong>{event.action}</strong><small>{event.detail}</small></span><span><Badge appearance="tint" color={event.outcome === "SUCCESS" ? "success" : "danger"}>{event.outcome}</Badge></span><span className="mono">{event.durationMs} ms</span></div>)}</section></main>;
}

function ApiPage() {
  const endpoints = [
    ["POST", "/v1/semantic-sessions", "创建固定版本会话"],
    ["POST", "/v1/semantic-sessions/{id}/question-frame", "提交问题框架"],
    ["POST", "/v1/semantic-sessions/{id}/search", "搜索语义候选"],
    ["POST", "/v1/semantic-sessions/{id}/plans:compile", "生成 IR 和 SQL 预览"],
    ["POST", "/v1/semantic-sessions/{id}/plans/{planId}:execute", "执行固定计划"],
  ];
  return <main className="page api-page"><section className="compact-page-header"><div><h1>API</h1></div></section><section className="api-layout"><article className="panel endpoint-panel"><div className="workspace-panel-heading"><h2>核心端点</h2></div><div className="endpoint-list">{endpoints.map(([method, path, description]) => <div className="endpoint-row" key={path}><code>{method}</code><div><strong>{path}</strong><span>{description}</span></div><CaretRight size={15} /></div>)}</div></article><aside className="panel access-panel"><BracketsCurly size={24} /><h2>客户端</h2><div><span>HTTP / OpenAPI</span><strong>标准契约</strong></div><div><span>TypeScript / Python</span><strong>类型与重试</strong></div><div><span>MCP Adapter</span><strong>Agent 工具协议</strong></div><Button appearance="secondary">创建密钥</Button></aside></section></main>;
}

export default function App() {
  const [page, setPage] = useState<Page>("ontology");
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
      <Header page={page} dark={dark} setDark={setDark} />
      {page === "ontology" && <Ontology snapshot={snapshot} setSnapshot={(next) => { setSnapshot(next); setIssues(null); }} issues={issues} onValidate={validate} onPublish={publish} />}
      {page === "lab" && <SemanticLab snapshot={snapshot} addAudit={(next) => setEvents((current) => [...current, ...next])} />}
      {page === "audit" && <Audit events={events} />}
      {page === "api" && <ApiPage />}
    </div>
    <MobileNav page={page} setPage={setPage} />
  </FluentProvider>;
}
