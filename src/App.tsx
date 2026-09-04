import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
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
  GearSix,
  GitBranch,
  ListMagnifyingGlass,
  MagnifyingGlass,
  Moon,
  PencilSimple,
  PlugsConnected,
  Plus,
  RocketLaunch,
  ShieldCheck,
  SidebarSimple,
  Sun,
  SignOut,
  Users,
  Warning,
} from "@phosphor-icons/react";
import { validateSnapshot } from "./domain/engine";
import { inferCardinality, inferObjectType, inferRelationType, propertyMeaningLabels, relationTypeLabels } from "./domain/modeling";
import type { Metric, ObjectType, OntologyObject, OntologyProperty, OntologyRelation, OntologySnapshot, ValidationIssue } from "./domain/types";
import { api, type Audit as AuditRecord, type Bootstrap, type Source, type Table } from "./api";

type Page = "dashboard" | "ontology" | "data" | "query" | "audit" | "api" | "users";
type EntityTab = "objects" | "metrics" | "relations";
type DashboardTab = "metrics" | "graph";

const objectTypeLabels: Record<ObjectType, string> = {
  ENTITY: "实体",
  EVENT: "事件",
  SNAPSHOT: "快照",
  AGGREGATE: "聚合",
  RELATIONSHIP: "关系对象",
};

const cardinalityLabels: Record<OntologyRelation["cardinality"], string> = {
  ONE_TO_ONE: "1:1",
  ONE_TO_MANY: "1:N",
  MANY_TO_ONE: "N:1",
  MANY_TO_MANY: "N:N",
};

const reverseCardinality: Record<OntologyRelation["cardinality"], OntologyRelation["cardinality"]> = {
  ONE_TO_ONE: "ONE_TO_ONE",
  ONE_TO_MANY: "MANY_TO_ONE",
  MANY_TO_ONE: "ONE_TO_MANY",
  MANY_TO_MANY: "MANY_TO_MANY",
};

const semanticBrand: BrandVariants = {
  10: "#001533", 20: "#00295c", 30: "#003d85", 40: "#0051ad",
  50: "#0863d5", 60: "#146ef5", 70: "#2c7df7", 80: "#478df8",
  90: "#639dfa", 100: "#80adfb", 110: "#9cbdfc", 120: "#b6cdfd",
  130: "#ceddfe", 140: "#e0eaff", 150: "#eef4ff", 160: "#f8faff",
};

const semanticLightTheme = createLightTheme(semanticBrand);
const semanticDarkTheme = createDarkTheme(semanticBrand);

const primaryNav = [
  { id: "dashboard" as const, label: "总览", icon: ChartBar },
  { id: "ontology" as const, label: "本体", icon: CirclesThreePlus },
];

const systemNav = [
  { id: "data" as const, label: "数据目录", icon: Database },
  { id: "query" as const, label: "查询工作台", icon: ListMagnifyingGlass },
  { id: "audit" as const, label: "审计", icon: ClockCounterClockwise },
  { id: "api" as const, label: "API", icon: BracketsCurly },
  { id: "users" as const, label: "用户管理", icon: Users },
];

const pageLabels = new Map([...primaryNav, ...systemNav].map((item) => [item.id, item.label]));
const systemPages = new Set<Page>(systemNav.map((item) => item.id));

function Logo() {
  return <div className="logo-mark" aria-label="语义平台">S</div>;
}

function StatusBadge({ status }: { status: string }) {
  const appearance = status === "PUBLISHED" || status === "VERIFIED" ? "filled" : "tint";
  const color = status === "PUBLISHED" ? "success" : status === "VERIFIED" ? "informative" : "warning";
  return <Badge appearance={appearance} color={color}>{status}</Badge>;
}

function Sidebar({ page, setPage, collapsed, setCollapsed }: { page: Page; setPage: (page: Page) => void; collapsed: boolean; setCollapsed: (value: boolean) => void }) {
  const [systemOpen, setSystemOpen] = useState(true);
  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="brand">
        <Logo />
        {!collapsed && <div><strong>语义平台</strong><span>MaxCompute</span></div>}
      </div>
      <nav aria-label="主要导航">
        {primaryNav.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)} aria-label={item.label} aria-current={page === item.id ? "page" : undefined}>
              <Icon size={20} weight={page === item.id ? "fill" : "regular"} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
        <div className="nav-group">
          <button className={`nav-item nav-group-trigger ${systemPages.has(page) ? "contains-page" : ""}`} onClick={() => setSystemOpen((value) => !value)} aria-expanded={systemOpen} aria-controls="system-navigation">
            <GearSix size={20} weight={systemPages.has(page) ? "fill" : "regular"} />
            {!collapsed && <><span>系统管理</span><CaretDown className={systemOpen ? "expanded" : ""} size={14} /></>}
          </button>
          {systemOpen && <div id="system-navigation" className="nav-submenu">
            {systemNav.map((item) => {
              const Icon = item.icon;
              return <button key={item.id} className={`nav-item nav-subitem ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)} aria-label={item.label} aria-current={page === item.id ? "page" : undefined}><Icon size={18} weight={page === item.id ? "fill" : "regular"} />{!collapsed && <span>{item.label}</span>}</button>;
            })}
          </div>}
        </div>
      </nav>
      <div className="sidebar-footer">
        <button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}>
          <SidebarSimple size={19} />
        </button>
      </div>
    </aside>
  );
}

function Header({ page, dark, setDark }: { page: Page; dark: boolean; setDark: (value: boolean) => void }) {
  const title = pageLabels.get(page) ?? "语义平台";
  return (
    <header className="topbar">
      <div className="breadcrumb">{systemPages.has(page) && <><span>系统管理</span><CaretRight size={13} /></>}<strong>{title}</strong></div>
      <div className="top-actions">
        <Tooltip content={dark ? "切换浅色模式" : "切换深色模式"} relationship="label">
          <Button appearance="subtle" icon={dark ? <Sun /> : <Moon />} onClick={() => setDark(!dark)} aria-label="切换主题" />
        </Tooltip>
        <Button appearance="subtle" icon={<SignOut/>} onClick={async()=>{await api.logout();window.location.reload()}} aria-label="退出登录" />
      </div>
    </header>
  );
}

function EmptyState({ kind }: { kind: string }) {
  return <div className="empty-state"><CirclesThreePlus size={32} /><h3>暂无{kind}</h3></div>;
}

function ObjectGlyph() {
  return <span className="object-glyph" aria-hidden="true"><i /><i /><i /><i /></span>;
}

function formatRelativeTime(value?: string) {
  if (!value) return "尚未更新";
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return "刚刚更新";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "刚刚更新";
  if (minutes < 60) return `${minutes} 分钟前更新`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前更新`;
  return `${Math.floor(hours / 24)} 天前更新`;
}

type GraphPoint = { x: number; y: number };

function graphLayout(snapshot: OntologySnapshot) {
  const degree = new Map(snapshot.objects.map((object) => [object.id, 0]));
  snapshot.relations.forEach((relation) => {
    degree.set(relation.sourceObjectId, (degree.get(relation.sourceObjectId) ?? 0) + 1);
    degree.set(relation.targetObjectId, (degree.get(relation.targetObjectId) ?? 0) + 1);
  });
  const ordered = [...snapshot.objects].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
  const positions = new Map<string, GraphPoint>();
  if (!ordered.length) return positions;
  positions.set(ordered[0].id, { x: 500, y: 282 });
  const presets = [
    { x: 235, y: 126 }, { x: 765, y: 126 }, { x: 155, y: 314 },
    { x: 845, y: 314 }, { x: 300, y: 456 }, { x: 700, y: 456 }, { x: 500, y: 88 },
  ];
  ordered.slice(1).forEach((object, index) => {
    const preset = presets[index];
    if (preset) positions.set(object.id, preset);
    else {
      const angle = ((index - presets.length) / Math.max(1, ordered.length - presets.length - 1)) * Math.PI * 2;
      positions.set(object.id, { x: 500 + Math.cos(angle) * 360, y: 275 + Math.sin(angle) * 205 });
    }
  });
  return positions;
}

function edgePoints(source: GraphPoint, target: GraphPoint) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const sourceScale = Math.min(83 / Math.max(Math.abs(dx), 0.01), 33 / Math.max(Math.abs(dy), 0.01));
  const targetScale = Math.min(91 / Math.max(Math.abs(dx), 0.01), 39 / Math.max(Math.abs(dy), 0.01));
  return { x1: source.x + dx * sourceScale, y1: source.y + dy * sourceScale, x2: target.x - dx * targetScale, y2: target.y - dy * targetScale };
}

function metricFormula(metric: Metric, snapshot: OntologySnapshot) {
  const owner = snapshot.objects.find((object) => object.id === metric.objectId);
  if (metric.definitionMode === "SQL") return metric.expression || "SQL 口径";
  if (metric.metricType === "BASE") {
    const property = owner?.properties.find((item) => item.id === metric.sourcePropertyId);
    return `${metric.aggregation}(${property?.sourceColumn ?? "*"})`;
  }
  const left = snapshot.metrics.find((item) => item.id === metric.leftMetricId)?.label ?? "左指标";
  const right = snapshot.metrics.find((item) => item.id === metric.rightMetricId)?.label ?? "右指标";
  const operator = { ADD: "+", SUBTRACT: "−", MULTIPLY: "×", DIVIDE: "÷", RATIO: "÷" }[metric.calculationOperator ?? "DIVIDE"];
  return `${left} ${operator} ${right}${metric.scale && metric.scale !== 1 ? ` × ${metric.scale}` : ""}`;
}

function Dashboard({ data, snapshot, onNavigate }: { data: Bootstrap; snapshot: OntologySnapshot; onNavigate: (page: Page) => void }) {
  const [tab, setTab] = useState<DashboardTab>("graph");
  const [query, setQuery] = useState("");
  const [selectedObjectId, setSelectedObjectId] = useState(snapshot.objects[0]?.id ?? "");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchedRelationIds = new Set(snapshot.relations.filter((relation) => relation.name.toLocaleLowerCase().includes(normalizedQuery)).flatMap((relation) => [relation.sourceObjectId, relation.targetObjectId]));
  const visibleObjects = normalizedQuery ? snapshot.objects.filter((object) => `${object.label} ${object.name}`.toLocaleLowerCase().includes(normalizedQuery) || matchedRelationIds.has(object.id)) : snapshot.objects;
  const visibleIds = new Set(visibleObjects.map((object) => object.id));
  const visibleRelations = snapshot.relations.filter((relation) => visibleIds.has(relation.sourceObjectId) && visibleIds.has(relation.targetObjectId) && (!normalizedQuery || relation.name.toLocaleLowerCase().includes(normalizedQuery) || matchedRelationIds.has(relation.sourceObjectId)));
  const positions = graphLayout({ ...snapshot, objects: visibleObjects, relations: visibleRelations });
  const selectedObject = visibleObjects.find((object) => object.id === selectedObjectId) ?? visibleObjects[0] ?? (!normalizedQuery ? snapshot.objects[0] : undefined);
  const analyticalProperties = selectedObject?.properties.filter((property) => property.visibility === "ANALYTICAL") ?? [];
  const today = new Date().toDateString();
  const todayQueries = data.audits.filter((event) => event.action === "QUERY_EXECUTED" && new Date(event.at).toDateString() === today);
  const failedQueries = todayQueries.filter((event) => event.outcome !== "SUCCESS").length;
  const published = data.published;
  const lastUpdatedAt = published?.publishedAt ?? data.source?.lastTestedAt ?? data.audits[0]?.at;

  return <main className="page dashboard-page">
    <section className="dashboard-header">
      <div><h1>平台总览</h1>{published ? <Badge appearance="tint" color="success">已发布 v{published.version}</Badge> : <Badge appearance="tint" color="warning">本体草稿 v{snapshot.version}</Badge>}<span>{formatRelativeTime(lastUpdatedAt)}</span></div>
      <Button appearance="primary" onClick={() => onNavigate("ontology")}>进入本体</Button>
    </section>
    <section className="dashboard-kpis" aria-label="平台关键数据">
      <div><span className="dashboard-kpi-icon"><ChartBar size={24} /></span><div><span>{published ? "已发布指标" : "草稿指标"}</span><strong>{snapshot.metrics.length}</strong></div></div>
      <div><span className="dashboard-kpi-icon"><CirclesThreePlus size={25} /></span><div><span>业务对象</span><strong>{snapshot.objects.length}</strong></div></div>
      <div><span className="dashboard-kpi-icon"><GitBranch size={25} /></span><div><span>对象关系</span><strong>{snapshot.relations.length}</strong></div></div>
      <div><span className="dashboard-kpi-icon"><Database size={24} /></span><div><span>已接入表</span><strong>{data.tables.length}</strong></div></div>
    </section>
    <section className="panel analysis-flow-panel">
      <div className="dashboard-section-title"><h2>数据到分析</h2></div>
      <div className="analysis-flow">
        <div className="analysis-step"><span><PlugsConnected size={23} /></span><div><strong>MaxCompute</strong><small className={data.source?.status === "CONNECTED" ? "healthy" : "pending"}>{data.source?.status === "CONNECTED" ? "● 已连接" : "待连接"}</small></div></div><ArrowRight className="flow-arrow" size={24} />
        <div className="analysis-step"><span><Database size={23} /></span><div><strong>物理表</strong><small>{data.tables.length} 张</small></div></div><ArrowRight className="flow-arrow" size={24} />
        <div className="analysis-step"><span><CirclesThreePlus size={23} /></span><div><strong>业务本体</strong><small>{snapshot.objects.length} 对象 · {snapshot.relations.length} 关系</small></div></div><ArrowRight className="flow-arrow" size={24} />
        <div className="analysis-step"><span><RocketLaunch size={23} /></span><div><strong>发布版本</strong><small className={published ? "healthy" : "pending"}>{published ? `v${published.version} 生效` : "尚未发布"}</small></div></div><ArrowRight className="flow-arrow" size={24} />
        <div className="analysis-step"><span><ArrowRight size={23} /></span><div><strong>查询运行</strong><small>今日 {todayQueries.length} 次{failedQueries ? <em> · {failedQueries} 次失败</em> : ""}</small></div></div>
      </div>
    </section>
    <section className="panel analyzable-panel">
      <header className="analyzable-header">
        <div><h2>可分析内容</h2><div className="dashboard-tabs" role="tablist" aria-label="可分析内容类型"><button role="tab" aria-selected={tab === "metrics"} className={tab === "metrics" ? "active" : ""} onClick={() => setTab("metrics")}>指标清单 <span>{snapshot.metrics.length}</span></button><button role="tab" aria-selected={tab === "graph"} className={tab === "graph" ? "active" : ""} onClick={() => setTab("graph")}>本体图谱</button></div></div>
        {tab === "graph" && <div className="dashboard-search"><MagnifyingGlass size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索对象或关系" aria-label="搜索对象或关系" /></div>}
      </header>
      {tab === "metrics" ? <div className="dashboard-metric-list">
        <div className="dashboard-metric-row dashboard-metric-head"><span>指标</span><span>类型</span><span>所属对象</span><span>计算口径</span><span>状态</span></div>
        {snapshot.metrics.length ? snapshot.metrics.map((metric) => <button className="dashboard-metric-row" key={metric.id} onClick={() => onNavigate("ontology")}><span><strong>{metric.label}</strong><small>{metric.name}</small></span><span>{metric.metricType === "BASE" ? "基础指标" : "派生指标"}</span><span>{snapshot.objects.find((object) => object.id === metric.objectId)?.label ?? "—"}</span><code>{metricFormula(metric, snapshot)}</code><StatusBadge status={metric.status} /></button>) : <EmptyState kind="指标" />}
      </div> : <div className="ontology-overview">
        <div className="graph-canvas">
          <div className="graph-toolbar"><span>全部对象</span><span>适应画布</span><span>100%</span></div>
          {!visibleObjects.length ? <EmptyState kind="匹配的对象" /> : <div className="graph-stage">
            <svg viewBox="0 0 1000 540" role="img" aria-label="本体对象关系图">
              <defs><marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
              {visibleRelations.map((relation) => { const relationSource = positions.get(relation.sourceObjectId); const relationTarget = positions.get(relation.targetObjectId); if (!relationSource || !relationTarget) return null; const source = relation.direction === "TARGET_TO_SOURCE" ? relationTarget : relationSource; const target = relation.direction === "TARGET_TO_SOURCE" ? relationSource : relationTarget; const edge = edgePoints(source, target); const mx = (edge.x1 + edge.x2) / 2; const my = (edge.y1 + edge.y2) / 2; return <g key={relation.id} className="graph-edge"><line {...edge} markerEnd="url(#graph-arrow)" markerStart={relation.direction === "BIDIRECTIONAL" ? "url(#graph-arrow)" : undefined} /><text x={mx} y={my - 8} textAnchor="middle">{relation.name}</text><text className="graph-cardinality" x={mx} y={my + 10} textAnchor="middle">{cardinalityLabels[relation.cardinality]}</text></g>; })}
            </svg>
            {visibleObjects.map((object) => { const position = positions.get(object.id); if (!position) return null; return <button key={object.id} aria-label={`查看${object.label}`} className={`graph-node ${selectedObject?.id === object.id ? "active" : ""}`} style={{ left: `${position.x / 10}%`, top: `${position.y / 5.4}%` }} onClick={() => setSelectedObjectId(object.id)}><ObjectGlyph /><span><strong>{object.label}</strong><small>{object.objectType}</small></span><i className={`node-status ${object.status === "PUBLISHED" ? "" : "draft"}`} /></button>; })}
          </div>}
        </div>
        <aside className="graph-inspector">
          {selectedObject ? <><div className="graph-inspector-title"><ObjectGlyph /><div><h3>{selectedObject.label}</h3><span>{selectedObject.objectType} · {selectedObject.status === "PUBLISHED" ? "已发布" : "草稿"}</span></div></div><div className="queryable-title"><strong>可查询属性</strong><span>{analyticalProperties.length}</span></div><div className="queryable-list">{analyticalProperties.map((property) => <div key={property.id}><span><strong>{property.label}</strong><small>{property.sourceColumn}</small></span><code>{property.meaning === "ENTITY_REFERENCE" ? "REFERENCE" : property.meaning}</code></div>)}</div><dl className="graph-object-meta"><div><dt>默认时间</dt><dd>{selectedObject.properties.find((property) => property.id === selectedObject.defaultTimePropertyId)?.label ?? "未配置"}</dd></div><div><dt>业务粒度</dt><dd>{selectedObject.grain}</dd></div></dl><button className="object-detail-link" onClick={() => onNavigate("ontology")}>查看对象详情 <ArrowRight size={16} /></button></> : <EmptyState kind="对象" />}
        </aside>
      </div>}
    </section>
  </main>;
}

function NewFromTableDialog({ tables, snapshot, onCreated }: { tables: Table[]; snapshot: OntologySnapshot; onCreated: () => Promise<void> }) {
  type TableConfig = { label: string; objectType: ObjectType };
  const modeled = new Set(snapshot.objects.map((object) => object.sourceTableId));
  const available = tables.filter((table) => !modeled.has([table.project, table.schema, table.name].filter(Boolean).join(".")));
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [configs, setConfigs] = useState<Record<string, TableConfig>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const initialize = () => {
    setSelectedIds([]);
    setConfigs(Object.fromEntries(available.map((table) => [table.id, { label: table.comment || table.name, objectType: inferObjectType(table.name, table.columns) }])));
    setError("");
  };
  const toggle = (tableId: string, checked: boolean) => setSelectedIds((current) => checked ? [...current, tableId] : current.filter((id) => id !== tableId));
  const update = (tableId: string, changes: Partial<TableConfig>) => setConfigs((current) => ({ ...current, [tableId]: { ...current[tableId], ...changes } }));
  const create = async () => {
    setSaving(true); setError("");
    try {
      await api.modelTables({ tables: selectedIds.map((tableId) => ({ tableId, label: configs[tableId]?.label, objectType: configs[tableId]?.objectType })) });
      await onCreated(); setOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "创建失败"); }
    finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={(_, data) => { setOpen(data.open); if (data.open) initialize(); }}>
    <DialogTrigger disableButtonEnhancement><Button appearance="primary" icon={<Database />} disabled={!available.length}>从物理表建模</Button></DialogTrigger>
    <DialogSurface className="wide-dialog"><DialogBody><DialogTitle>选择物理表建模</DialogTitle><DialogContent className="dialog-form">
      <div className="batch-table-summary"><span>可选物理表</span><strong>{available.length}</strong><span>已选择</span><strong>{selectedIds.length}</strong></div>
      <div className="batch-table-list">
        {available.map((table) => {
          const selected = selectedIds.includes(table.id); const config = configs[table.id];
          return <div className={`batch-table-row ${selected ? "selected" : ""}`} key={table.id}>
            <Checkbox aria-label={`选择 ${table.name}`} checked={selected} onChange={(_, data) => toggle(table.id, data.checked === true)} />
            <div className="batch-table-identity"><strong>{table.name}</strong><span>{table.project}{table.schema ? ` · ${table.schema}` : ""} · {table.columns.length} 个字段</span></div>
            {selected && <div className="batch-table-config"><Field label="业务名称"><Input value={config?.label || ""} onChange={(_, data) => update(table.id, { label: data.value })} /></Field><Field label="对象类型"><Select value={config?.objectType || "ENTITY"} onChange={(event) => update(table.id, { objectType: event.target.value as ObjectType })}>{Object.entries(objectTypeLabels).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</Select></Field></div>}
          </div>;
        })}
        {!available.length && <div className="catalog-empty-state"><CheckCircle size={26} /><span>目录中的物理表都已建模</span></div>}
      </div>
      {error && <div className="form-error">{error}</div>}
    </DialogContent><DialogActions><Button appearance="secondary" onClick={() => setOpen(false)}>取消</Button><Button appearance="primary" onClick={create} disabled={!selectedIds.length || selectedIds.some((id) => !configs[id]?.label.trim()) || saving}>{saving ? "正在创建" : `创建 ${selectedIds.length} 个对象`}</Button></DialogActions></DialogBody></DialogSurface>
  </Dialog>;
}

function NewMetricDialog({ snapshot, onCreate }: { snapshot: OntologySnapshot; onCreate: (metric:Metric)=>void }) {
  const [open,setOpen]=useState(false); const [label,setLabel]=useState(""); const [objectId,setObjectId]=useState(snapshot.objects[0]?.id||""); const [propertyId,setPropertyId]=useState(""); const [aggregation,setAggregation]=useState<Metric["aggregation"]>("SUM");
  const object=snapshot.objects.find(item=>item.id===objectId); const numbers=object?.properties.filter(property=>property.meaning==="NUMBER")||[];
  const create=()=>{if(!label||!objectId||!propertyId)return;const id=crypto.randomUUID();onCreate({id,metricType:"BASE",name:`metric_${id.replaceAll("-","").slice(0,12)}`,label,description:`${label}业务口径`,objectId,definitionMode:"VISUAL",expression:"",sourcePropertyId:propertyId,aggregation,format:"number",synonyms:[],status:"DRAFT"});setLabel("");setOpen(false)};
  return <Dialog open={open} onOpenChange={(_,data)=>setOpen(data.open)}><DialogTrigger disableButtonEnhancement><Button appearance="secondary" icon={<ChartBar/>} disabled={!snapshot.objects.length}>新建指标</Button></DialogTrigger><DialogSurface><DialogBody><DialogTitle>创建基础指标</DialogTitle><DialogContent className="dialog-form"><Field label="指标名称" required><Input value={label} onChange={(_,data)=>setLabel(data.value)}/></Field><Field label="事实对象" required><Select value={objectId} onChange={event=>{setObjectId(event.target.value);setPropertyId("")}}><option value="">选择对象</option>{snapshot.objects.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</Select></Field><Field label="数值属性" required><Select value={propertyId} onChange={event=>setPropertyId(event.target.value)}><option value="">选择属性</option>{numbers.map(property=><option value={property.id} key={property.id}>{property.label}</option>)}</Select></Field><Field label="聚合方式"><Select value={aggregation} onChange={event=>setAggregation(event.target.value as Metric["aggregation"])}>{["SUM","COUNT","COUNT_DISTINCT","AVG","MIN","MAX"].map(value=><option value={value} key={value}>{value}</option>)}</Select></Field></DialogContent><DialogActions><Button appearance="secondary" onClick={()=>setOpen(false)}>取消</Button><Button appearance="primary" onClick={create} disabled={!label||!propertyId}>创建指标</Button></DialogActions></DialogBody></DialogSurface></Dialog>;
}

function EditPropertyDialog({ object, property, relations, onChange }: { object: OntologyObject; property: OntologyProperty; relations: OntologyRelation[]; onChange: (property: OntologyProperty) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(property);
  const sourceRelation = relations.find((relation) => relation.sourcePropertyId === property.id);
  const targetRelation = relations.find((relation) => relation.targetPropertyId === property.id);
  const sourceMeaningLocked = Boolean(sourceRelation && !["HIERARCHY", "IDENTITY"].includes(sourceRelation.type));
  const structural = sourceMeaningLocked || Boolean(targetRelation);
  const allowIdMeaning = ["ENTITY", "EVENT"].includes(object.objectType) && (property.meaning === "ID" || !object.properties.some((item) => item.meaning === "ID"));
  const set = <K extends keyof OntologyProperty>(key: K, value: OntologyProperty[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const save = () => {
    let next = { ...draft, label: draft.label.trim(), name: draft.name.trim(), description: draft.description.trim(), synonyms: draft.synonyms.map((item) => item.trim()).filter(Boolean) };
    if (sourceMeaningLocked) next = { ...next, meaning: "ENTITY_REFERENCE", visibility: "ANALYTICAL", valueSearchable: false };
    if (targetRelation || next.meaning === "ID") next = { ...next, meaning: "ID", unique: true, visibility: "ANALYTICAL", valueSearchable: false };
    if (next.meaning !== "NUMBER") next = { ...next, numericSpec: undefined };
    if (next.meaning === "NUMBER" && !next.numericSpec) next = { ...next, numericSpec: { kind: "GENERAL", defaultAggregation: "SUM", aggregationBehavior: "ADDITIVE" } };
    if (next.sensitive || next.visibility !== "ANALYTICAL") next = { ...next, valueSearchable: false };
    onChange(next); setOpen(false);
  };
  return <Dialog open={open} onOpenChange={(_, data) => { setOpen(data.open); if (data.open) setDraft(property); }}>
    <DialogTrigger disableButtonEnhancement><Tooltip content="编辑属性" relationship="label"><Button appearance="subtle" size="small" icon={<PencilSimple />} aria-label={`编辑${property.label}`} /></Tooltip></DialogTrigger>
    <DialogSurface className="wide-dialog"><DialogBody><DialogTitle>编辑属性</DialogTitle><DialogContent className="dialog-form property-editor">
      <div className="physical-property"><div><span>物理字段</span><strong>{property.sourceColumn}</strong></div><div><span>数据类型</span><strong>{property.dataType}</strong></div><div><span>所属对象</span><strong>{object.label}</strong></div></div>
      <div className="property-editor-grid"><Field label="业务名称" required><Input value={draft.label} onChange={(_, data) => set("label", data.value)} /></Field><Field label="机器名称" required><Input value={draft.name} onChange={(_, data) => set("name", data.value)} /></Field><Field label="语义类型" required hint={structural ? "关系键的语义由关系约束" : undefined}><Select value={targetRelation ? "ID" : sourceMeaningLocked ? "ENTITY_REFERENCE" : draft.meaning} disabled={structural} onChange={(event) => set("meaning", event.target.value as OntologyProperty["meaning"])}>{Object.entries(propertyMeaningLabels).filter(([value]) => value !== "ID" || allowIdMeaning).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="查询可见性"><Select value={structural ? "ANALYTICAL" : draft.visibility} disabled={structural} onChange={(event) => set("visibility", event.target.value as OntologyProperty["visibility"])}><option value="ANALYTICAL">可分析</option><option value="DETAIL_ONLY">仅明细</option><option value="HIDDEN">隐藏</option></Select></Field><Field label="绑定优先级"><Input type="number" min={0} max={1000} value={String(draft.bindingPriority)} onChange={(_, data) => set("bindingPriority", Number(data.value) || 0)} /></Field><Field label="同义词" hint="使用逗号分隔"><Input value={draft.synonyms.join("，")} onChange={(_, data) => set("synonyms", data.value.split(/[,，]/))} /></Field></div>
      <Field label="业务描述"><Textarea resize="vertical" value={draft.description} onChange={(_, data) => set("description", data.value)} /></Field>
      <div className="property-options" aria-label="属性规则"><Checkbox label="唯一值" checked={targetRelation || draft.meaning === "ID" ? true : draft.unique} disabled={Boolean(targetRelation) || draft.meaning === "ID"} onChange={(_, data) => set("unique", data.checked === true)} /><Checkbox label="敏感字段" checked={draft.sensitive} onChange={(_, data) => set("sensitive", data.checked === true)} /><Checkbox label="支持值检索" checked={draft.valueSearchable} disabled={structural || draft.sensitive || draft.visibility !== "ANALYTICAL"} onChange={(_, data) => set("valueSearchable", data.checked === true)} /><Checkbox label="默认展示" checked={draft.defaultDisplay} onChange={(_, data) => set("defaultDisplay", data.checked === true)} /><Checkbox label="允许导出" checked={draft.exportable} onChange={(_, data) => set("exportable", data.checked === true)} /></div>
      {draft.meaning === "NUMBER" && <div className="numeric-rules"><Field label="数值类型"><Select value={draft.numericSpec?.kind || "GENERAL"} onChange={(event) => set("numericSpec", { ...(draft.numericSpec || { defaultAggregation: "SUM", aggregationBehavior: "ADDITIVE" }), kind: event.target.value as "GENERAL" | "CURRENCY" | "RATIO" })}><option value="GENERAL">普通数值</option><option value="CURRENCY">金额</option><option value="RATIO">比例</option></Select></Field><Field label="默认聚合"><Select value={draft.numericSpec?.defaultAggregation || "SUM"} onChange={(event) => set("numericSpec", { ...(draft.numericSpec || { kind: "GENERAL", aggregationBehavior: "ADDITIVE" }), defaultAggregation: event.target.value as "SUM" | "AVG" | "MIN" | "MAX" | "NONE" })}><option value="SUM">SUM</option><option value="AVG">AVG</option><option value="MIN">MIN</option><option value="MAX">MAX</option><option value="NONE">NONE</option></Select></Field><Field label="可加性"><Select value={draft.numericSpec?.aggregationBehavior || "ADDITIVE"} onChange={(event) => set("numericSpec", { ...(draft.numericSpec || { kind: "GENERAL", defaultAggregation: "SUM" }), aggregationBehavior: event.target.value as "ADDITIVE" | "SEMI_ADDITIVE" | "NON_ADDITIVE" })}><option value="ADDITIVE">可加</option><option value="SEMI_ADDITIVE">半可加</option><option value="NON_ADDITIVE">不可加</option></Select></Field></div>}
    </DialogContent><DialogActions><Button appearance="secondary" onClick={() => setOpen(false)}>取消</Button><Button appearance="primary" onClick={save} disabled={!draft.label.trim() || !draft.name.trim()}>保存属性</Button></DialogActions></DialogBody></DialogSurface>
  </Dialog>;
}

function NewRelationDialog({ snapshot, onCreate }: { snapshot: OntologySnapshot; onCreate:(relation:OntologyRelation)=>void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [sourcePropertyId, setSourcePropertyId] = useState("");
  const [targetPropertyId, setTargetPropertyId] = useState("");
  const [type, setType] = useState<OntologyRelation["type"]>("REFERENCE");
  const [ownership, setOwnership] = useState<"OWNED" | "SHARED">("OWNED");
  const [aggregationPolicy, setAggregationPolicy] = useState<"PRE_AGGREGATE_CHILD" | "EXISTS_ONLY">("PRE_AGGREGATE_CHILD");
  const source = snapshot.objects.find((item) => item.id === sourceId);
  const target = snapshot.objects.find((item) => item.id === targetId);
  const sourceProperty = source?.properties.find((item) => item.id === sourcePropertyId);
  const targetProperty = target?.properties.find((item) => item.id === targetPropertyId);
  const cardinality = sourceProperty && targetProperty ? inferCardinality(sourceProperty, targetProperty) : null;
  const keyTypeMismatch = Boolean(sourceProperty && targetProperty && sourceProperty.dataType !== targetProperty.dataType);
  const initialize = () => {
    const initialSource = snapshot.objects[0]; const initialTarget = snapshot.objects[1] || snapshot.objects[0];
    const sourceKey = initialSource?.properties.find((property) => property.meaning === "ENTITY_REFERENCE") || initialSource?.properties[0];
    const targetKey = initialTarget?.properties.find((property) => property.meaning === "ID");
    setName(""); setSourceId(initialSource?.id || ""); setTargetId(initialTarget?.id || ""); setSourcePropertyId(sourceKey?.id || ""); setTargetPropertyId(targetKey?.id || "");
    setType(initialSource && initialTarget && sourceKey && targetKey ? inferRelationType(initialSource, initialTarget, sourceKey, targetKey) : "REFERENCE");
    setOwnership("OWNED"); setAggregationPolicy("PRE_AGGREGATE_CHILD");
  };
  const chooseSource = (id: string) => { const next = snapshot.objects.find((object) => object.id === id); const key = next?.properties.find((property) => property.meaning === "ENTITY_REFERENCE") || next?.properties[0]; setSourceId(id); setSourcePropertyId(key?.id || ""); if (next && target && key && targetProperty) setType(inferRelationType(next, target, key, targetProperty)); };
  const chooseTarget = (id: string) => { const next = snapshot.objects.find((object) => object.id === id); const key = next?.properties.find((property) => property.meaning === "ID"); setTargetId(id); setTargetPropertyId(key?.id || ""); if (source && next && sourceProperty && key) setType(inferRelationType(source, next, sourceProperty, key)); };
  const create = () => {
    if (!name.trim() || !source || !target || !sourceProperty || !targetProperty || !cardinality) return;
    onCreate({ id: crypto.randomUUID(), name: name.trim(), sourceObjectId: source.id, targetObjectId: target.id, type, cardinality, sourcePropertyId, targetPropertyId, joinExpression: `${source.name}.${sourceProperty.sourceColumn} = ${target.name}.${targetProperty.sourceColumn}`, direction: "SOURCE_TO_TARGET", required: false, enabled: true, fanoutRisk: cardinality === "MANY_TO_MANY" ? "HIGH" : cardinality === "ONE_TO_MANY" ? "LOW" : "NONE", ...(type === "COMPOSITION" ? { composition: { childObjectId: source.id, parentObjectId: target.id, ownership, aggregationPolicy } } : {}), status: "DRAFT" });
    setOpen(false);
  };
  const invalidSelfRelation = sourceId === targetId && type !== "HIERARCHY";
  const invalidComposition = type === "COMPOSITION" && cardinality !== "MANY_TO_ONE" && cardinality !== "ONE_TO_ONE";
  return <Dialog open={open} onOpenChange={(_, data) => { setOpen(data.open); if (data.open) initialize(); }}>
    <DialogTrigger disableButtonEnhancement><Button appearance="secondary" icon={<GitBranch />} disabled={!snapshot.objects.length}>新建关系</Button></DialogTrigger>
    <DialogSurface className="wide-dialog"><DialogBody><DialogTitle>创建对象关系</DialogTitle><DialogContent className="dialog-form">
      <div className="relation-form-grid"><Field label="关系名称" required><Input value={name} onChange={(_, data) => setName(data.value)} /></Field><Field label="关系类型" required><Select value={type} onChange={(event) => setType(event.target.value as OntologyRelation["type"])}>{Object.entries(relationTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="来源对象" required><Select value={sourceId} onChange={(event) => chooseSource(event.target.value)}>{snapshot.objects.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</Select></Field><Field label="来源字段" required><Select value={sourcePropertyId} onChange={(event) => { const id = event.target.value; setSourcePropertyId(id); const property = source?.properties.find((item) => item.id === id); if (source && target && property && targetProperty) setType(inferRelationType(source, target, property, targetProperty)); }}><option value="">选择字段</option>{source?.properties.map((item) => <option value={item.id} key={item.id}>{item.label}{item.unique ? " · 唯一" : ""}</option>)}</Select></Field><Field label="目标对象" required><Select value={targetId} onChange={(event) => chooseTarget(event.target.value)}>{snapshot.objects.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</Select></Field><Field label="目标字段" required hint="目标端使用对象唯一标识"><Select value={targetPropertyId} onChange={(event) => { const id = event.target.value; setTargetPropertyId(id); const property = target?.properties.find((item) => item.id === id); if (source && target && sourceProperty && property) setType(inferRelationType(source, target, sourceProperty, property)); }}><option value="">选择 ID 字段</option>{target?.properties.filter((item) => item.meaning === "ID").map((item) => <option value={item.id} key={item.id}>{item.label} · 唯一</option>)}</Select></Field></div>
      {cardinality && <div className="relation-inference" role="status"><span>自动推断</span><strong>{source?.label} → {target?.label}：{cardinalityLabels[cardinality]}</strong><small>反向：{cardinalityLabels[reverseCardinality[cardinality]]} · 根据两端字段唯一性确定</small></div>}
      {type === "COMPOSITION" && <div className="composition-grid"><Field label="归属方式"><Select value={ownership} onChange={(event) => setOwnership(event.target.value as "OWNED" | "SHARED")}><option value="OWNED">独占归属</option><option value="SHARED">共享归属</option></Select></Field><Field label="聚合策略"><Select value={aggregationPolicy} onChange={(event) => setAggregationPolicy(event.target.value as "PRE_AGGREGATE_CHILD" | "EXISTS_ONLY")}><option value="PRE_AGGREGATE_CHILD">子对象预聚合</option><option value="EXISTS_ONLY">仅用于存在性判断</option></Select></Field></div>}
      {invalidSelfRelation && <div className="form-error">同一对象之间请使用父子层级关系</div>}{invalidComposition && <div className="form-error">主子关系需要 N:1 或 1:1 的字段唯一性</div>}{keyTypeMismatch && <div className="form-error">关系两端字段的数据类型需要一致</div>}
    </DialogContent><DialogActions><Button appearance="secondary" onClick={() => setOpen(false)}>取消</Button><Button appearance="primary" disabled={!name.trim() || !sourcePropertyId || !targetPropertyId || invalidSelfRelation || invalidComposition || keyTypeMismatch} onClick={create}>创建关系</Button></DialogActions></DialogBody></DialogSurface>
  </Dialog>;
}

function Ontology({ snapshot, setSnapshot, issues, onValidate, onSave, onPublish, tables, onModelTable }: { snapshot: OntologySnapshot; setSnapshot: (snapshot: OntologySnapshot) => void; issues: ValidationIssue[] | null; onValidate: () => void; onSave: () => void; onPublish: () => void; tables: Table[]; onModelTable: () => Promise<void> }) {
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
  const updateProperty = (objectId: string, nextProperty: OntologyProperty) => {
    const nextObjects = snapshot.objects.map((object) => {
      if (object.id !== objectId) return object;
      const properties = object.properties.map((property) => property.id === nextProperty.id ? nextProperty : nextProperty.meaning === "ID" && property.meaning === "ID" ? { ...property, meaning: "CODE" as const, unique: false } : property);
      const idProperty = properties.find((property) => property.meaning === "ID");
      return { ...object, properties, grainPropertyIds: idProperty ? [idProperty.id] : object.grainPropertyIds, grain: idProperty ? `${idProperty.label} 唯一记录` : object.grain };
    });
    setSnapshot({ ...snapshot, status: "DRAFT", objects: nextObjects });
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
      <div className="property-table" role="table" aria-label={`${selectedObject.label}属性列表`}><div className="property-row table-head" role="row"><span>名称</span><span>语义</span><span>物理字段</span><span>可见性</span><span>操作</span></div>{selectedObject.properties.map((property) => <div className="property-row" role="row" key={property.id}><span><strong>{property.label}</strong><small>{property.name}</small></span><span><code>{propertyMeaningLabels[property.meaning]}</code></span><span className="mono">{property.sourceColumn}</span><span>{property.visibility === "ANALYTICAL" ? "可分析" : property.visibility === "DETAIL_ONLY" ? "仅明细" : "隐藏"}</span><span><EditPropertyDialog object={selectedObject} property={property} relations={snapshot.relations} onChange={(next) => updateProperty(selectedObject.id, next)} /></span></div>)}</div>
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
    <section className="compact-page-header"><div><h1>业务本体</h1><div className="header-status"><StatusBadge status={snapshot.status} /><span>v{snapshot.version}</span></div></div><div className="header-actions"><NewMetricDialog snapshot={snapshot} onCreate={metric=>setSnapshot({...snapshot,status:"DRAFT",metrics:[...snapshot.metrics,metric]})}/><NewRelationDialog snapshot={snapshot} onCreate={relation=>{const objects=snapshot.objects.map(object=>object.id!==relation.sourceObjectId?object:{...object,properties:object.properties.map(property=>property.id===relation.sourcePropertyId&&!["HIERARCHY","IDENTITY"].includes(relation.type)?{...property,meaning:"ENTITY_REFERENCE" as const,visibility:"ANALYTICAL" as const,valueSearchable:false}:property)});setSnapshot({...snapshot,status:"DRAFT",objects,relations:[...snapshot.relations,relation]})}}/><NewFromTableDialog tables={tables} snapshot={snapshot} onCreated={onModelTable}/></div></section>
    <section className="ontology-stats" aria-label="本体统计"><div><CirclesThreePlus size={18} /><span>对象</span><strong>{snapshot.objects.length}</strong></div><div><ChartBar size={18} /><span>指标</span><strong>{snapshot.metrics.length}</strong></div><div><GitBranch size={18} /><span>关系</span><strong>{snapshot.relations.length}</strong></div><div><ShieldCheck size={18} /><span>校验</span><strong>{issues === null ? "未运行" : hasErrors ? `${issues.length} 项` : "通过"}</strong></div></section>
    <section className="ontology-workspace">
      <section className="panel ontology-catalog"><div className="workspace-panel-heading"><h2>目录</h2><span>{resultCount}</span></div><div className="catalog-tabs" role="tablist" aria-label="本体类型">{(["objects", "metrics", "relations"] as EntityTab[]).map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} key={item} onClick={() => { setTab(item); setQuery(""); }}>{item === "objects" ? "对象" : item === "metrics" ? "指标" : "关系"}</button>)}</div><div className="catalog-search"><MagnifyingGlass size={15} /><input aria-label="搜索本体目录" placeholder="搜索" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="catalog-list">{renderCatalog()}</div></section>
      <section className="panel ontology-inspector">{renderInspector()}</section>
      <aside className="panel release-panel">
        <div className="workspace-panel-heading"><h2>草稿与发布</h2><span>v{snapshot.version}</span></div>
        <div className="release-state"><span className={snapshot.status === "PUBLISHED" ? "state-icon published" : "state-icon"}>{snapshot.status === "PUBLISHED" ? <Check size={17} weight="bold" /> : <Code size={17} />}</span><div><strong>{snapshot.status === "PUBLISHED" ? "已发布" : "草稿"}</strong><small>{snapshot.objects.length} 对象，{snapshot.metrics.length} 指标</small></div></div>
        {issues && <div className={`compact-validation ${hasErrors ? "invalid" : "valid"}`} role="status">{hasErrors ? <Warning size={18} weight="fill" /> : <CheckCircle size={18} weight="fill" />}<div><strong>{hasErrors ? "需要修正" : "校验通过"}</strong><span>{hasErrors ? `${issues.filter((issue) => issue.level === "ERROR").length} 个错误` : snapshot.status === "PUBLISHED" ? "已生效" : "可以发布"}</span></div></div>}
        {!!issues?.length && <ul className="validation-list">{issues.map((issue, index) => <li key={`${issue.code}-${issue.entityId}-${index}`}><strong>{snapshot.objects.find((object) => object.id === issue.entityId)?.label ?? issue.entityId}</strong><span>{issue.message}</span></li>)}</ul>}
        <div className="release-actions"><Button appearance="secondary" icon={<ShieldCheck />} onClick={onValidate}>校验草稿</Button><Button appearance="secondary" onClick={onSave} disabled={snapshot.status === "PUBLISHED"}>保存草稿</Button><Button appearance="primary" icon={<RocketLaunch />} onClick={onPublish} disabled={snapshot.status === "PUBLISHED" || hasErrors}>发布版本</Button></div>
      </aside>
    </section>
  </main>;
}

function QueryPage({ snapshot, refresh }: { snapshot: OntologySnapshot | null; refresh: () => Promise<void> }) {
  const [metricId,setMetricId]=useState(snapshot?.metrics[0]?.id||"");
  const [dimensionId,setDimensionId]=useState("");
  const [timeGrain,setTimeGrain]=useState("");
  const [running,setRunning]=useState(false);
  const [error,setError]=useState("");
  const [output,setOutput]=useState<Awaited<ReturnType<typeof api.execute>>|null>(null);
  const dimensions=snapshot?.objects.flatMap(object=>object.properties.filter(property=>property.visibility==="ANALYTICAL"&&property.meaning!=="NUMBER"&&property.meaning!=="TEXT"))||[];
  const run=async()=>{setRunning(true);setError("");setOutput(null);try{setOutput(await api.execute({metricId,dimensionId:dimensionId||undefined,timeGrain:timeGrain||undefined}));await refresh();}catch(reason){setError(reason instanceof Error?reason.message:"查询失败");}finally{setRunning(false);}};
  return <main className="page lab-page"><section className="compact-page-header"><div><h1>查询工作台</h1><div className="header-status">{snapshot&&<Badge appearance="tint" color="informative">本体 v{snapshot.version}</Badge>}</div></div></section>
    {!snapshot?<section className="panel guided-empty"><Database size={30}/><div><h2>发布本体后开始查询</h2><p>查询只使用已经发布的指标、维度和关系。</p></div></section>:<section className="query-layout"><aside className="panel query-builder"><div className="workspace-panel-heading"><h2>查询条件</h2></div><Field label="指标" required><Select value={metricId} onChange={e=>setMetricId(e.target.value)}><option value="">选择指标</option>{snapshot.metrics.map(metric=><option value={metric.id} key={metric.id}>{metric.label}</option>)}</Select></Field><Field label="分组维度"><Select value={dimensionId} onChange={e=>setDimensionId(e.target.value)}><option value="">不分组</option>{dimensions.map(property=><option value={property.id} key={property.id}>{property.label}</option>)}</Select></Field><Field label="时间粒度"><Select value={timeGrain} onChange={e=>setTimeGrain(e.target.value)}><option value="">不按时间展开</option><option value="DAY">日</option><option value="WEEK">周</option><option value="MONTH">月</option><option value="QUARTER">季度</option><option value="YEAR">年</option></Select></Field><Button appearance="primary" icon={running?<Spinner size="tiny"/>:<ArrowRight/>} iconPosition="after" disabled={!metricId||running} onClick={run}>{running?"查询中":"执行查询"}</Button></aside><section className="query-results">{error&&<div className="error-state"><Warning size={20}/><div><strong>查询失败</strong><span>{error}</span></div></div>}{!output&&!running&&!error&&<div className="lab-placeholder"><ChartBar size={34}/><h2>选择受治理指标</h2></div>}{running&&<article className="panel loading-state"><div className="skeleton wide"/><div className="skeleton code"/></article>}{output&&<><article className="panel result-meta"><div><CheckCircle size={22} weight="fill"/><div><strong>查询完成</strong><span>{output.result.durationMs} ms · {output.result.rows.length} 行 · Instance {output.result.instanceId}</span></div></div><Badge color={output.result.truncated?"warning":"success"}>{output.result.truncated?"结果已截断":"完整结果"}</Badge></article><article className="panel data-result"><div className="data-scroll"><table><thead><tr>{output.result.columns.map(column=><th key={column}>{column}</th>)}</tr></thead><tbody>{output.result.rows.map((row,index)=><tr key={index}>{output.result.columns.map(column=><td key={column}>{String(row[column]??"")}</td>)}</tr>)}</tbody></table></div></article><article className="panel sql-panel"><div className="sql-heading"><div><Code size={20}/><h2>执行 SQL</h2></div><Button appearance="subtle" onClick={()=>navigator.clipboard?.writeText(output.plan.sql)}>复制 SQL</Button></div><pre><code>{output.plan.sql}</code></pre></article></>}</section></section>}
  </main>;
}

function Login({onDone}:{onDone:()=>Promise<void>}){const[username,setUsername]=useState("admin");const[password,setPassword]=useState("");const[error,setError]=useState("");const[loading,setLoading]=useState(false);const submit=async(e:React.FormEvent)=>{e.preventDefault();setLoading(true);setError("");try{await api.login(username,password);await onDone();}catch(reason){setError(reason instanceof Error?reason.message:"登录失败");}finally{setLoading(false);}};return <div className="login-shell"><form className="login-panel" onSubmit={submit}><Logo/><div><h1>登录语义平台</h1><p>进入数据接入、本体管理与查询工作台</p></div><Field label="账号"><Input value={username} onChange={(_,data)=>setUsername(data.value)} autoComplete="username"/></Field><Field label="密码"><Input type="password" value={password} onChange={(_,data)=>setPassword(data.value)} autoComplete="current-password"/></Field>{error&&<div className="form-error">{error}</div>}<Button type="submit" appearance="primary" size="large" disabled={!username||!password||loading}>{loading?"正在登录":"登录"}</Button></form></div>}

function DataPage({source,tables,refresh}:{source:Source|null;tables:Table[];refresh:()=>Promise<void>}){const[form,setForm]=useState({name:source?.name||"MaxCompute",endpoint:source?.endpoint||"",project:source?.project||"",schema:source?.schema||"",quota:source?.quota||"",accessId:"",accessKey:"",stsToken:""});const[tableName,setTableName]=useState("");const[found,setFound]=useState<Awaited<ReturnType<typeof api.findTable>>["table"]>();const[busy,setBusy]=useState("");const[message,setMessage]=useState("");const[error,setError]=useState("");const update=(key:string,value:string)=>setForm(current=>({...current,[key]:value}));const act=async(kind:string,task:()=>Promise<unknown>)=>{setBusy(kind);setMessage("");setError("");try{await task();setMessage(kind==="test"?"连接成功":kind==="save"?"数据源已保存":"操作完成");await refresh();}catch(reason){setError(reason instanceof Error?reason.message:"操作失败");}finally{setBusy("");}};const find=()=>act("find",async()=>{const result=await api.findTable(tableName);setFound(result.table);if(!result.found)setError("没有找到该表，请检查表名与 Schema");});const add=()=>act("add",async()=>{await api.addTable(tableName);setFound(undefined);setTableName("");});return <main className="page data-page"><section className="compact-page-header"><div><h1>数据目录</h1><div className="header-status"><Badge color={source?.status==="CONNECTED"?"success":"warning"}>{source?.status==="CONNECTED"?"已连接":"待配置"}</Badge></div></div></section><div className="data-layout"><section className="panel connection-panel"><div className="workspace-panel-heading"><h2>MaxCompute 数据源</h2><PlugsConnected size={20}/></div><div className="form-grid"><Field label="连接名称"><Input value={form.name} onChange={(_,d)=>update("name",d.value)}/></Field><Field label="Endpoint"><Input value={form.endpoint} onChange={(_,d)=>update("endpoint",d.value)} placeholder="https://service.cn-shanghai.maxcompute.aliyun.com/api"/></Field><Field label="Project"><Input value={form.project} onChange={(_,d)=>update("project",d.value)}/></Field><Field label="Schema"><Input value={form.schema} onChange={(_,d)=>update("schema",d.value)} placeholder="可选"/></Field><Field label="Quota"><Input value={form.quota} onChange={(_,d)=>update("quota",d.value)} placeholder="可选"/></Field><Field label="AccessKey ID"><Input value={form.accessId} onChange={(_,d)=>update("accessId",d.value)} placeholder={source?.credentialStored?"已安全保存，留空保持不变":""}/></Field><Field label="AccessKey Secret"><Input type="password" value={form.accessKey} onChange={(_,d)=>update("accessKey",d.value)} placeholder={source?.credentialStored?"已安全保存，留空保持不变":""}/></Field><Field label="STS Token"><Input type="password" value={form.stsToken} onChange={(_,d)=>update("stsToken",d.value)} placeholder="可选"/></Field></div><div className="panel-actions"><Button appearance="secondary" disabled={!!busy} onClick={()=>act("test",()=>api.testSource(form))}>测试连接</Button><Button appearance="primary" disabled={!!busy} onClick={()=>act("save",()=>api.saveSource(form))}>{busy==="save"?"正在保存":"保存数据源"}</Button></div></section><section className="panel catalog-panel"><div className="workspace-panel-heading"><h2>按表名添加</h2><span>{tables.length}</span></div><div className="table-lookup"><Input value={tableName} onChange={(_,d)=>{setTableName(d.value);setFound(undefined)}} placeholder="输入准确的 MaxCompute 表名"/><Button appearance="primary" disabled={!source||!tableName||!!busy} onClick={find}>查找表</Button></div>{found&&<div className="found-table"><div><Database size={22}/><div><strong>{found.name}</strong><span>{found.type} · {found.columns.length} 个字段</span></div></div><Button appearance="secondary" onClick={add} disabled={!!busy}>添加到目录</Button></div>}<div className="managed-table-list">{tables.length?tables.map(table=><div className="managed-table" key={table.id}><Database size={18}/><div><strong>{table.name}</strong><span>{table.project} · {table.columns.length} 个字段 · {new Date(table.addedAt).toLocaleString("zh-CN")}</span></div><Badge appearance="tint">已添加</Badge></div>):<div className="catalog-empty-state"><Database size={28}/><span>输入准确表名开始添加</span></div>}</div></section></div>{message&&<div className="toast-line success">{message}</div>}{error&&<div className="toast-line error">{error}</div>}</main>}

function UserManagementPage({data,refresh}:{data:Bootstrap;refresh:()=>Promise<void>}){const[open,setOpen]=useState(false);const[form,setForm]=useState({username:"",displayName:"",role:"ANALYST",password:""});const[error,setError]=useState("");const create=async()=>{try{await api.createUser(form);setOpen(false);setForm({username:"",displayName:"",role:"ANALYST",password:""});await refresh();}catch(reason){setError(reason instanceof Error?reason.message:"创建失败")}};return <main className="page user-management-page"><section className="compact-page-header"><div><h1>用户管理</h1><div className="header-status"><span>{data.users.length} 位用户</span></div></div>{data.principal.role==="ADMIN"&&<Button appearance="primary" icon={<Plus/>} onClick={()=>setOpen(true)}>添加用户</Button>}</section><section className="panel user-management-panel"><div className="user-table-head"><span>用户</span><span>登录账号</span><span>角色</span></div><div className="user-list">{data.users.map(user=><div key={user.id}><span className="user-avatar">{user.displayName.slice(0,1)}</span><div><strong>{user.displayName}</strong><small>{user.username}</small></div><span className="user-account">{user.username}</span><Badge appearance="tint">{user.role}</Badge></div>)}</div></section><Dialog open={open} onOpenChange={(_,d)=>setOpen(d.open)}><DialogSurface><DialogBody><DialogTitle>添加平台用户</DialogTitle><DialogContent className="dialog-form"><Field label="登录账号"><Input value={form.username} onChange={(_,d)=>setForm(v=>({...v,username:d.value}))}/></Field><Field label="显示名称"><Input value={form.displayName} onChange={(_,d)=>setForm(v=>({...v,displayName:d.value}))}/></Field><Field label="角色"><Select value={form.role} onChange={e=>setForm(v=>({...v,role:e.target.value}))}><option value="ADMIN">管理员</option><option value="MODELER">建模者</option><option value="ANALYST">分析者</option><option value="VIEWER">只读</option></Select></Field><Field label="初始密码"><Input type="password" value={form.password} onChange={(_,d)=>setForm(v=>({...v,password:d.value}))}/></Field>{error&&<div className="form-error">{error}</div>}</DialogContent><DialogActions><Button appearance="secondary" onClick={()=>setOpen(false)}>取消</Button><Button appearance="primary" onClick={create}>创建用户</Button></DialogActions></DialogBody></DialogSurface></Dialog></main>}

function Audit({ events }: { events: AuditRecord[] }) {
  return <main className="page audit-page"><section className="compact-page-header"><div><h1>审计日志</h1></div></section><section className="panel audit-table"><div className="audit-row audit-head"><span>时间</span><span>操作者</span><span>动作</span><span>资源</span><span>结果</span><span>耗时</span></div>{events.map(event => <div className="audit-row" key={event.id}><span>{new Date(event.at).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit",month:"2-digit",day:"2-digit" })}</span><span>{event.actor}</span><span><strong>{event.action}</strong><small>{event.detail}</small></span><span className="mono">{event.resource}</span><span><Badge appearance="tint" color={event.outcome === "SUCCESS" ? "success" : "danger"}>{event.outcome}</Badge></span><span className="mono">{event.durationMs} ms</span></div>)}</section></main>;
}

function ApiPage() {
  const endpoints = [
    ["GET", "/api/bootstrap", "读取当前平台状态"],
    ["POST", "/api/catalog/find", "按准确表名检索元数据"],
    ["POST", "/api/catalog/add", "添加确认后的物理表"],
    ["PUT", "/api/ontology/draft", "保存本体草稿"],
    ["POST", "/api/ontology/publish", "校验并发布本体"],
    ["POST", "/api/query/execute", "执行受治理查询计划"],
  ];
  return <main className="page api-page"><section className="compact-page-header"><div><h1>API</h1></div></section><section className="api-layout"><article className="panel endpoint-panel"><div className="workspace-panel-heading"><h2>当前端点</h2></div><div className="endpoint-list">{endpoints.map(([method, path, description]) => <div className="endpoint-row" key={path}><code>{method}</code><div><strong>{path}</strong><span>{description}</span></div><CaretRight size={15} /></div>)}</div></article><aside className="panel access-panel"><ShieldCheck size={24}/><h2>访问控制</h2><div><span>浏览器会话</span><strong>HttpOnly + SameSite</strong></div><div><span>变更请求</span><strong>CSRF 校验</strong></div><div><span>执行入口</span><strong>已发布本体</strong></div></aside></section></main>;
}

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [data,setData]=useState<Bootstrap|null>(null);
  const [authRequired,setAuthRequired]=useState(false);
  const [loading,setLoading]=useState(true);
  const [snapshot, setSnapshot] = useState<OntologySnapshot|null>(null);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const [globalError,setGlobalError]=useState("");

  const refresh=async()=>{try{const next=await api.bootstrap();setData(next);setSnapshot(next.draft);setAuthRequired(false);setGlobalError("");}catch(reason){if((reason as {status?:number}).status===401)setAuthRequired(true);else setGlobalError(reason instanceof Error?reason.message:"平台加载失败");}finally{setLoading(false);}};
  useEffect(()=>{void refresh()},[]);

  const validate = () => {
    if(!snapshot)return;
    const result = validateSnapshot(snapshot);
    setIssues(result);
  };
  const save = async () => {
    if(!snapshot)return;
    try{const result=await api.saveDraft(snapshot);setSnapshot(result.draft);setIssues(result.validation);setGlobalError("");}catch(reason){setGlobalError(reason instanceof Error?reason.message:"保存失败");}
  };
  const publish = async () => {
    if(!snapshot)return;
    const result = validateSnapshot(snapshot);
    setIssues(result);
    if (result.some((item) => item.level === "ERROR")) return;
    try{await api.saveDraft(snapshot);await api.publish();await refresh();}catch(reason){setGlobalError(reason instanceof Error?reason.message:"发布失败");}
  };

  if(loading)return <div className="app-loading"><Spinner/><span>正在加载平台</span></div>;
  if(authRequired)return <FluentProvider theme={semanticLightTheme} className="app-theme"><Login onDone={refresh}/></FluentProvider>;
  if(!data||!snapshot)return <div className="app-loading"><Warning/><span>{globalError||"平台暂时不可用"}</span><Button onClick={refresh}>重试</Button></div>;

  return <FluentProvider theme={dark ? semanticDarkTheme : semanticLightTheme} className={dark ? "app-theme dark" : "app-theme"}>
    {/* FluentProvider copies its classes to portals; keep page layout on this child. */}
    <div className="app-root">
      <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="app-body">
        <Header page={page} dark={dark} setDark={setDark} />
        {globalError&&<div className="global-error" role="alert">{globalError}<button onClick={()=>setGlobalError("")}>关闭</button></div>}
        {page === "dashboard" && <Dashboard data={data} snapshot={data.published ?? snapshot} onNavigate={setPage} />}
        {page === "data" && (
          <DataPage source={data.source} tables={data.tables} refresh={refresh}/>
        )}
        {page === "ontology" && (
          <Ontology snapshot={snapshot} setSnapshot={(next) => { setSnapshot(next); setIssues(null); }} issues={issues} onValidate={validate} onSave={()=>void save()} onPublish={()=>void publish()} tables={data.tables} onModelTable={refresh}/>
        )}
        {page === "query" && (
          <QueryPage snapshot={data.published} refresh={refresh}/>
        )}
        {page === "audit" && <Audit events={data.audits} />}
        {page === "api" && <ApiPage />}
        {page === "users" && (
          <UserManagementPage data={data} refresh={refresh}/>
        )}
      </div>
    </div>
  </FluentProvider>;
}
