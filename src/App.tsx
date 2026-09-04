import { useEffect, useState } from "react";
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
import type { Metric, ObjectType, OntologyRelation, OntologySnapshot, ValidationIssue } from "./domain/types";
import { api, type Audit as AuditRecord, type Bootstrap, type Source, type Table } from "./api";

type Page = "data" | "ontology" | "query" | "audit" | "api" | "system";
type EntityTab = "objects" | "metrics" | "relations";

const objectTypeLabels: Record<ObjectType, string> = {
  ENTITY: "实体",
  EVENT: "事件",
  SNAPSHOT: "快照",
  AGGREGATE: "聚合",
  RELATIONSHIP: "关系对象",
};

const semanticBrand: BrandVariants = {
  10: "#001533", 20: "#00295c", 30: "#003d85", 40: "#0051ad",
  50: "#0863d5", 60: "#146ef5", 70: "#2c7df7", 80: "#478df8",
  90: "#639dfa", 100: "#80adfb", 110: "#9cbdfc", 120: "#b6cdfd",
  130: "#ceddfe", 140: "#e0eaff", 150: "#eef4ff", 160: "#f8faff",
};

const semanticLightTheme = createLightTheme(semanticBrand);
const semanticDarkTheme = createDarkTheme(semanticBrand);

const nav = [
  { id: "data" as const, label: "数据目录", icon: Database },
  { id: "ontology" as const, label: "本体", icon: CirclesThreePlus },
  { id: "query" as const, label: "查询工作台", icon: ListMagnifyingGlass },
  { id: "audit" as const, label: "审计", icon: ClockCounterClockwise },
  { id: "api" as const, label: "API", icon: BracketsCurly },
  { id: "system" as const, label: "系统管理", icon: Users },
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
        {!collapsed && <div><strong>语义平台</strong><span>default</span></div>}
      </div>
      <nav aria-label="主要导航">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)} aria-label={item.label} aria-current={page === item.id ? "page" : undefined}>
              <Icon size={20} weight={page === item.id ? "fill" : "regular"} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        {!collapsed && <div className="workspace-switch"><Database size={18} /><div><span>命名空间</span><strong>default</strong></div><CaretDown size={14} /></div>}
        <button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}>
          <SidebarSimple size={19} />
        </button>
      </div>
    </aside>
  );
}

function Header({ page, dark, setDark }: { page: Page; dark: boolean; setDark: (value: boolean) => void }) {
  const title = nav.find((item) => item.id === page)?.label ?? "语义平台";
  return (
    <header className="topbar">
      <div className="breadcrumb"><span>default</span><CaretRight size={13} /><strong>{title}</strong></div>
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

function NewFromTableDialog({ tables, onCreated }: { tables: Table[]; onCreated: () => Promise<void> }) {
  const [open,setOpen]=useState(false); const [tableId,setTableId]=useState(tables[0]?.id||""); const [label,setLabel]=useState(""); const [objectType,setObjectType]=useState<ObjectType>("ENTITY"); const [idColumn,setIdColumn]=useState(""); const [timeColumn,setTimeColumn]=useState(""); const [error,setError]=useState(""); const [saving,setSaving]=useState(false);
  const table=tables.find(item=>item.id===tableId); const choose=(id:string)=>{setTableId(id);const next=tables.find(item=>item.id===id);setLabel(next?.comment||next?.name||"");setIdColumn(next?.columns.find(column=>/(^|_)id$/.test(column.name))?.name||"");setTimeColumn(next?.columns.find(column=>column.partition||/date|time|_dt$/.test(column.name))?.name||"")};
  const create=async()=>{setSaving(true);setError("");try{await api.modelTable({tableId,label,objectType,idColumn:idColumn||undefined,timeColumn:timeColumn||undefined});await onCreated();setOpen(false);}catch(reason){setError(reason instanceof Error?reason.message:"创建失败")}finally{setSaving(false)}};
  return <Dialog open={open} onOpenChange={(_,data)=>{setOpen(data.open);if(data.open&&tables[0]&&!label)choose(tableId||tables[0].id)}}><DialogTrigger disableButtonEnhancement><Button appearance="primary" icon={<Database/>} disabled={!tables.length}>从物理表建模</Button></DialogTrigger><DialogSurface><DialogBody><DialogTitle>从物理表创建对象</DialogTitle><DialogContent className="dialog-form"><Field label="物理表" required><Select value={tableId} onChange={event=>choose(event.target.value)}><option value="">选择已添加的表</option>{tables.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="业务名称" required><Input value={label} onChange={(_,data)=>setLabel(data.value)}/></Field><Field label="对象类型" required><Select value={objectType} onChange={event=>setObjectType(event.target.value as ObjectType)}>{Object.entries(objectTypeLabels).map(([value,text])=><option value={value} key={value}>{text}</option>)}</Select></Field><Field label="ID 字段"><Select value={idColumn} onChange={event=>setIdColumn(event.target.value)}><option value="">待后续配置</option>{table?.columns.map(column=><option value={column.name} key={column.name}>{column.name}</option>)}</Select></Field><Field label="时间字段"><Select value={timeColumn} onChange={event=>setTimeColumn(event.target.value)}><option value="">不指定</option>{table?.columns.map(column=><option value={column.name} key={column.name}>{column.name}</option>)}</Select></Field>{error&&<div className="form-error">{error}</div>}</DialogContent><DialogActions><Button appearance="secondary" onClick={()=>setOpen(false)}>取消</Button><Button appearance="primary" onClick={create} disabled={!tableId||!label||saving}>{saving?"正在创建":"创建草稿对象"}</Button></DialogActions></DialogBody></DialogSurface></Dialog>;
}

function NewMetricDialog({ snapshot, onCreate }: { snapshot: OntologySnapshot; onCreate: (metric:Metric)=>void }) {
  const [open,setOpen]=useState(false); const [label,setLabel]=useState(""); const [objectId,setObjectId]=useState(snapshot.objects[0]?.id||""); const [propertyId,setPropertyId]=useState(""); const [aggregation,setAggregation]=useState<Metric["aggregation"]>("SUM");
  const object=snapshot.objects.find(item=>item.id===objectId); const numbers=object?.properties.filter(property=>property.meaning==="NUMBER")||[];
  const create=()=>{if(!label||!objectId||!propertyId)return;const id=crypto.randomUUID();onCreate({id,metricType:"BASE",name:`metric_${id.replaceAll("-","").slice(0,12)}`,label,description:`${label}业务口径`,objectId,definitionMode:"VISUAL",expression:"",sourcePropertyId:propertyId,aggregation,format:"number",synonyms:[],status:"DRAFT"});setLabel("");setOpen(false)};
  return <Dialog open={open} onOpenChange={(_,data)=>setOpen(data.open)}><DialogTrigger disableButtonEnhancement><Button appearance="secondary" icon={<ChartBar/>} disabled={!snapshot.objects.length}>新建指标</Button></DialogTrigger><DialogSurface><DialogBody><DialogTitle>创建基础指标</DialogTitle><DialogContent className="dialog-form"><Field label="指标名称" required><Input value={label} onChange={(_,data)=>setLabel(data.value)}/></Field><Field label="事实对象" required><Select value={objectId} onChange={event=>{setObjectId(event.target.value);setPropertyId("")}}><option value="">选择对象</option>{snapshot.objects.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</Select></Field><Field label="数值属性" required><Select value={propertyId} onChange={event=>setPropertyId(event.target.value)}><option value="">选择属性</option>{numbers.map(property=><option value={property.id} key={property.id}>{property.label}</option>)}</Select></Field><Field label="聚合方式"><Select value={aggregation} onChange={event=>setAggregation(event.target.value as Metric["aggregation"])}>{["SUM","COUNT","COUNT_DISTINCT","AVG","MIN","MAX"].map(value=><option value={value} key={value}>{value}</option>)}</Select></Field></DialogContent><DialogActions><Button appearance="secondary" onClick={()=>setOpen(false)}>取消</Button><Button appearance="primary" onClick={create} disabled={!label||!propertyId}>创建指标</Button></DialogActions></DialogBody></DialogSurface></Dialog>;
}

function NewRelationDialog({ snapshot, onCreate }: { snapshot: OntologySnapshot; onCreate:(relation:OntologyRelation)=>void }) {
  const [open,setOpen]=useState(false); const [name,setName]=useState(""); const [sourceId,setSourceId]=useState(snapshot.objects[0]?.id||""); const [targetId,setTargetId]=useState(snapshot.objects[1]?.id||""); const [sourcePropertyId,setSourcePropertyId]=useState(""); const [targetPropertyId,setTargetPropertyId]=useState(""); const [cardinality,setCardinality]=useState<OntologyRelation["cardinality"]>("MANY_TO_ONE");
  const source=snapshot.objects.find(item=>item.id===sourceId); const target=snapshot.objects.find(item=>item.id===targetId);
  const create=()=>{const sourceProperty=source?.properties.find(item=>item.id===sourcePropertyId);const targetProperty=target?.properties.find(item=>item.id===targetPropertyId);if(!name||!source||!target||!sourceProperty||!targetProperty)return;onCreate({id:crypto.randomUUID(),name,sourceObjectId:source.id,targetObjectId:target.id,type:"REFERENCE",cardinality,sourcePropertyId,targetPropertyId,joinExpression:`${source.name}.${sourceProperty.sourceColumn} = ${target.name}.${targetProperty.sourceColumn}`,direction:"SOURCE_TO_TARGET",required:false,enabled:true,fanoutRisk:cardinality==="MANY_TO_MANY"?"HIGH":"NONE",status:"DRAFT"});setName("");setOpen(false)};
  return <Dialog open={open} onOpenChange={(_,data)=>setOpen(data.open)}><DialogTrigger disableButtonEnhancement><Button appearance="secondary" icon={<GitBranch/>} disabled={snapshot.objects.length<2}>新建关系</Button></DialogTrigger><DialogSurface><DialogBody><DialogTitle>创建对象关系</DialogTitle><DialogContent className="dialog-form"><Field label="关系名称" required><Input value={name} onChange={(_,data)=>setName(data.value)}/></Field><Field label="来源对象" required><Select value={sourceId} onChange={event=>{setSourceId(event.target.value);setSourcePropertyId("")}}>{snapshot.objects.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</Select></Field><Field label="来源字段" required><Select value={sourcePropertyId} onChange={event=>setSourcePropertyId(event.target.value)}><option value="">选择字段</option>{source?.properties.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</Select></Field><Field label="目标对象" required><Select value={targetId} onChange={event=>{setTargetId(event.target.value);setTargetPropertyId("")}}>{snapshot.objects.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</Select></Field><Field label="目标字段" required><Select value={targetPropertyId} onChange={event=>setTargetPropertyId(event.target.value)}><option value="">选择字段</option>{target?.properties.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</Select></Field><Field label="基数"><Select value={cardinality} onChange={event=>setCardinality(event.target.value as OntologyRelation["cardinality"])}>{["ONE_TO_ONE","ONE_TO_MANY","MANY_TO_ONE","MANY_TO_MANY"].map(value=><option value={value} key={value}>{value}</option>)}</Select></Field></DialogContent><DialogActions><Button appearance="secondary" onClick={()=>setOpen(false)}>取消</Button><Button appearance="primary" disabled={!name||!sourcePropertyId||!targetPropertyId||sourceId===targetId} onClick={create}>创建关系</Button></DialogActions></DialogBody></DialogSurface></Dialog>;
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
    <section className="compact-page-header"><div><h1>业务本体</h1><div className="header-status"><StatusBadge status={snapshot.status} /><span>v{snapshot.version}</span></div></div><div className="header-actions"><NewMetricDialog snapshot={snapshot} onCreate={metric=>setSnapshot({...snapshot,status:"DRAFT",metrics:[...snapshot.metrics,metric]})}/><NewRelationDialog snapshot={snapshot} onCreate={relation=>setSnapshot({...snapshot,status:"DRAFT",relations:[...snapshot.relations,relation]})}/><NewFromTableDialog tables={tables} onCreated={onModelTable}/></div></section>
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

function SystemPage({data,refresh}:{data:Bootstrap;refresh:()=>Promise<void>}){const[open,setOpen]=useState(false);const[form,setForm]=useState({username:"",displayName:"",role:"ANALYST",password:""});const[error,setError]=useState("");const create=async()=>{try{await api.createUser(form);setOpen(false);setForm({username:"",displayName:"",role:"ANALYST",password:""});await refresh();}catch(reason){setError(reason instanceof Error?reason.message:"创建失败")}};return <main className="page system-page"><section className="compact-page-header"><div><h1>系统管理</h1></div>{data.principal.role==="ADMIN"&&<Button appearance="primary" icon={<Plus/>} onClick={()=>setOpen(true)}>添加用户</Button>}</section><div className="system-grid"><section className="panel"><div className="workspace-panel-heading"><h2>用户与角色</h2><span>{data.users.length}</span></div><div className="user-list">{data.users.map(user=><div key={user.id}><span className="user-avatar">{user.displayName.slice(0,1)}</span><div><strong>{user.displayName}</strong><small>{user.username}</small></div><Badge appearance="tint">{user.role}</Badge></div>)}</div></section><section className="panel system-facts"><div className="workspace-panel-heading"><h2>运行配置</h2></div><dl className="definition-list"><div><dt>数据源</dt><dd>{data.source?.name||"未配置"}</dd></div><div><dt>物理目录</dt><dd>{data.tables.length} 张表</dd></div><div><dt>发布版本</dt><dd>{data.published?`v${data.published.version}`:"未发布"}</dd></div><div><dt>凭据存储</dt><dd>AES-256-GCM</dd></div></dl></section></div><Dialog open={open} onOpenChange={(_,d)=>setOpen(d.open)}><DialogSurface><DialogBody><DialogTitle>添加平台用户</DialogTitle><DialogContent className="dialog-form"><Field label="登录账号"><Input value={form.username} onChange={(_,d)=>setForm(v=>({...v,username:d.value}))}/></Field><Field label="显示名称"><Input value={form.displayName} onChange={(_,d)=>setForm(v=>({...v,displayName:d.value}))}/></Field><Field label="角色"><Select value={form.role} onChange={e=>setForm(v=>({...v,role:e.target.value}))}><option value="ADMIN">管理员</option><option value="MODELER">建模者</option><option value="ANALYST">分析者</option><option value="VIEWER">只读</option></Select></Field><Field label="初始密码"><Input type="password" value={form.password} onChange={(_,d)=>setForm(v=>({...v,password:d.value}))}/></Field>{error&&<div className="form-error">{error}</div>}</DialogContent><DialogActions><Button appearance="secondary" onClick={()=>setOpen(false)}>取消</Button><Button appearance="primary" onClick={create}>创建用户</Button></DialogActions></DialogBody></DialogSurface></Dialog></main>}

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
  const [page, setPage] = useState<Page>("data");
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
        {page === "system" && (
          <SystemPage data={data} refresh={refresh}/>
        )}
      </div>
    </div>
  </FluentProvider>;
}
