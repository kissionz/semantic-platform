import type { AuditEvent, Metric, OntologyObject, OntologyProperty, OntologySnapshot, SearchHit, ValidationIssue } from "./types";

const valueMeanings = new Set(["CODE", "NAME", "CATEGORY", "BOOLEAN", "GEOGRAPHY"]);

function hasUnsafeSql(sql = "") {
  return /;|--|\/\*|\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|EXECUTE|LOAD|OUTFILE|DUMPFILE|LOCK|UNLOCK|SET|USE)\b/i.test(sql);
}

export function validateSnapshot(snapshot: OntologySnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (code: string, entityId: string, message: string) => issues.push({ code, entityId, message, level: "ERROR" });
  const warn = (code: string, entityId: string, message: string) => issues.push({ code, entityId, message, level: "WARNING" });
  const objectIds = new Set(snapshot.objects.map((item) => item.id));
  const propertyMap = new Map<string, { property: OntologyProperty; object: OntologyObject }>();
  const metricMap = new Map(snapshot.metrics.map((item) => [item.id, item]));

  if (snapshot.schemaVersion !== 2) error("SCHEMA_VERSION_UNSUPPORTED", "snapshot", "仅支持 schemaVersion 2");
  const objectNames = new Set<string>();
  snapshot.objects.forEach((object) => {
    const normalized = object.name.trim().toLowerCase();
    if (!object.name.trim() || !object.label.trim()) error("OBJECT_REQUIRED_FIELDS", object.id, "对象名称和业务名称不能为空");
    if (objectNames.has(normalized)) error("OBJECT_NAME_DUPLICATE", object.id, "对象机器名称在快照内不唯一");
    objectNames.add(normalized);
    if (!object.sourceTableId.trim()) error("SOURCE_TABLE_REQUIRED", object.id, "对象必须绑定物理表或视图");

    const ids = object.properties.filter((property) => property.meaning === "ID");
    if (object.objectType === "ENTITY" && ids.length !== 1) error("ENTITY_ID_REQUIRED", object.id, "ENTITY 必须且只能包含一个 ID 属性");
    if (object.objectType === "EVENT" && ids.length > 1) error("EVENT_ID_LIMIT", object.id, "EVENT 最多只能包含一个 ID 属性");
    if (["SNAPSHOT", "AGGREGATE", "RELATIONSHIP"].includes(object.objectType) && ids.length) error("OBJECT_ID_FORBIDDEN", object.id, `${object.objectType} 不允许配置 ID 属性`);
    if (ids.length === 0 && object.grainPropertyIds.length === 0) error("GRAIN_REQUIRED", object.id, "无 ID 对象必须声明组合粒度");

    const propertyNames = new Set<string>();
    object.properties.forEach((property) => {
      propertyMap.set(property.id, { property, object });
      const key = property.name.toLowerCase();
      if (propertyNames.has(key)) error("PROPERTY_NAME_DUPLICATE", property.id, "属性机器名称在对象内不唯一");
      propertyNames.add(key);
      if (property.meaning === "ID" && (!property.unique || property.visibility !== "ANALYTICAL")) error("ID_PROPERTY_INVALID", property.id, "ID 必须唯一且可分析");
      if (property.meaning === "ENTITY_REFERENCE" && property.visibility !== "ANALYTICAL") error("REFERENCE_VISIBILITY_INVALID", property.id, "实体引用必须为 ANALYTICAL");
      if (property.meaning === "NUMBER" && !property.numericSpec) error("NUMERIC_SPEC_REQUIRED", property.id, "NUMBER 属性必须声明聚合规则");
      if (property.numericSpec?.kind === "RATIO" && property.numericSpec.defaultAggregation === "SUM") error("NON_ADDITIVE_SUM", property.id, "比例属性不能默认求和");
      if (property.numericSpec?.aggregationBehavior === "NON_ADDITIVE" && property.numericSpec.defaultAggregation === "SUM") error("NON_ADDITIVE_SUM", property.id, "不可加属性不能默认求和");
      if (property.valueSearchable && (property.sensitive || property.visibility !== "ANALYTICAL" || !valueMeanings.has(property.meaning))) error("VALUE_SEARCH_INVALID", property.id, "值检索仅允许非敏感、可分析且语义在白名单内的属性");
    });
    object.grainPropertyIds.forEach((id) => {
      const property = object.properties.find((item) => item.id === id);
      if (!property || property.visibility !== "ANALYTICAL") error("GRAIN_PROPERTY_INVALID", object.id, "粒度字段必须存在且可分析");
    });
  });

  snapshot.relations.forEach((relation) => {
    const source = snapshot.objects.find((item) => item.id === relation.sourceObjectId);
    const target = snapshot.objects.find((item) => item.id === relation.targetObjectId);
    if (!source || !target) return error("RELATION_OBJECT_NOT_FOUND", relation.id, "关系两端对象必须存在");
    const sourceProperty = propertyMap.get(relation.sourcePropertyId)?.property;
    const targetProperty = propertyMap.get(relation.targetPropertyId)?.property;
    if (!sourceProperty || !targetProperty) error("RELATION_PROPERTY_NOT_FOUND", relation.id, "关系键属性不存在");
    if (targetProperty?.meaning !== "ID") error("RELATION_TARGET_NOT_ID", relation.id, "关系目标属性必须是目标对象 ID");
    if (sourceProperty && targetProperty && sourceProperty.dataType !== targetProperty.dataType) error("RELATION_KEY_TYPE_MISMATCH", relation.id, "关系两端属性数据类型不一致");
    if (relation.cardinality === "MANY_TO_MANY") warn("RELATION_FANOUT_UNSAFE", relation.id, "多对多关系将在聚合计划中被拒绝");
    if (relation.fanoutRisk === "HIGH") warn("RELATION_HIGH_RISK", relation.id, "高扇出关系不会进入安全计划");
    if (relation.type === "COMPOSITION") {
      const composition = relation.composition;
      if (!composition || composition.childObjectId !== relation.sourceObjectId || composition.parentObjectId !== relation.targetObjectId || !["MANY_TO_ONE", "ONE_TO_ONE"].includes(relation.cardinality)) {
        error("COMPOSITION_INVALID", relation.id, "主子关系必须按子对象到主对象配置合法基数和聚合策略");
      }
    }
  });

  snapshot.objects.forEach((object) => object.properties.filter((item) => item.meaning === "ENTITY_REFERENCE").forEach((property) => {
    if (!snapshot.relations.some((relation) => relation.sourcePropertyId === property.id)) error("REFERENCE_RELATION_REQUIRED", property.id, "实体引用必须存在由该属性发出的关系");
  }));

  snapshot.metrics.forEach((metric) => {
    const object = snapshot.objects.find((item) => item.id === metric.objectId);
    if (!object) return error("METRIC_OBJECT_NOT_FOUND", metric.id, "指标所属对象不存在");
    if (metric.definitionMode === "SQL" && (hasUnsafeSql(metric.expression) || !metric.expression.trim())) error("METRIC_SQL_UNSAFE", metric.id, "受治理表达式为空或包含不安全 SQL");
    if (metric.metricType === "BASE" && metric.aggregation !== "COUNT") {
      const property = object.properties.find((item) => item.id === metric.sourcePropertyId);
      if (!property || property.meaning !== "NUMBER" || property.visibility !== "ANALYTICAL") error("METRIC_SOURCE_INVALID", metric.id, "基础指标必须引用可分析数值属性");
      if (metric.aggregation === "SUM" && property?.numericSpec?.aggregationBehavior === "NON_ADDITIVE") error("NON_ADDITIVE_SUM", metric.id, "不可加数值不能使用 SUM 指标");
    }
    if (metric.metricType === "DERIVED") {
      const left = metric.leftMetricId ? metricMap.get(metric.leftMetricId) : undefined;
      const right = metric.rightMetricId ? metricMap.get(metric.rightMetricId) : undefined;
      if (!left || !right) error("DERIVED_METRIC_DEPENDENCY_NOT_FOUND", metric.id, "派生指标依赖不存在");
      if (left?.id === right?.id) error("DERIVED_METRIC_DUPLICATE_OPERAND", metric.id, "派生指标左右依赖不能相同");
      if (left?.objectId !== metric.objectId || right?.objectId !== metric.objectId) error("CROSS_FACT_MEASURE", metric.id, "派生指标依赖必须属于同一对象");
    }
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (metric: Metric): boolean => {
    if (visiting.has(metric.id)) return true;
    if (visited.has(metric.id) || metric.metricType !== "DERIVED") return false;
    visiting.add(metric.id);
    const cycle = [metric.leftMetricId, metric.rightMetricId].some((id) => id && metricMap.has(id) && visit(metricMap.get(id)!));
    visiting.delete(metric.id);
    visited.add(metric.id);
    return cycle;
  };
  snapshot.metrics.forEach((metric) => {
    if (visit(metric)) error("DERIVED_METRIC_CYCLE", metric.id, "派生指标依赖形成闭环");
  });

  return issues;
}

function match(query: string, label: string, synonyms: string[]) {
  const normalized = query.trim().toLowerCase();
  const target = label.toLowerCase();
  if (normalized === target || normalized.includes(target)) return { tier: "EXACT_LABEL" as const, score: 100 };
  if (synonyms.some((item) => normalized.includes(item.toLowerCase()))) return { tier: "SYNONYM" as const, score: 80 };
  const chars = [...target].filter((char) => normalized.includes(char)).length;
  if (chars >= Math.min(2, target.length)) return { tier: "NGRAM" as const, score: Math.round((chars / target.length) * 50) };
  return null;
}

export function semanticSearch(snapshot: OntologySnapshot, query: string): SearchHit[] {
  const hits: Array<Omit<SearchHit, "ref"> & { priority: number }> = [];
  snapshot.objects.forEach((object) => {
    const objectMatch = match(query, object.label, object.synonyms);
    if (objectMatch) hits.push({ id: object.id, label: object.label, kind: "OBJECT", priority: object.bindingPriority, ...objectMatch });
    object.properties.filter((property) => property.visibility === "ANALYTICAL" && !property.sensitive && property.meaning !== "NUMBER").forEach((property) => {
      const propertyMatch = match(query, property.label, property.synonyms);
      if (propertyMatch) hits.push({ id: property.id, label: property.label, kind: "DIMENSION", priority: property.bindingPriority, ...propertyMatch });
    });
  });
  snapshot.metrics.forEach((metric) => {
    const metricMatch = match(query, metric.label, metric.synonyms);
    const object = snapshot.objects.find((item) => item.id === metric.objectId);
    if (metricMatch) hits.push({ id: metric.id, label: metric.label, kind: "METRIC", priority: object?.bindingPriority ?? 0, ...metricMatch });
  });
  const order = { EXACT_LABEL: 3, SYNONYM: 2, NGRAM: 1 };
  hits.sort((a, b) => order[b.tier] - order[a.tier] || b.priority - a.priority || b.score - a.score || a.id.localeCompare(b.id));
  const counters = { OBJECT: 0, METRIC: 0, DIMENSION: 0 };
  return hits.slice(0, 24).map((hit) => ({ ...hit, ref: `${hit.kind === "OBJECT" ? "O" : hit.kind === "METRIC" ? "M" : "D"}${++counters[hit.kind]}` }));
}

export function bindValue(snapshot: OntologySnapshot, value: string) {
  const bindings: Array<{ ref: string; value: string; propertyId: string; propertyLabel: string; objectId: string; objectLabel: string }> = [];
  const known: Record<string, string[]> = { prop_region_name: ["华东", "华北", "华南", "西南"], prop_channel: ["线上渠道", "线下门店", "经销商"] };
  snapshot.objects.forEach((object) => object.properties.filter((property) => property.valueSearchable && !property.sensitive).forEach((property) => {
    if (known[property.id]?.some((item) => item === value || item.startsWith(value))) bindings.push({ ref: `B${bindings.length + 1}`, value, propertyId: property.id, propertyLabel: property.label, objectId: object.id, objectLabel: object.label });
  }));
  return bindings;
}

export interface CompileRequest {
  query: string;
  metricId: string;
  dimensionId?: string;
  timeGrain?: "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  boundValue?: ReturnType<typeof bindValue>[number];
}

export function compilePlan(snapshot: OntologySnapshot, request: CompileRequest) {
  const metric = snapshot.metrics.find((item) => item.id === request.metricId);
  if (!metric) throw new Error("UNKNOWN_REFERENCE");
  const root = snapshot.objects.find((item) => item.id === metric.objectId)!;
  const source = root.properties.find((item) => item.id === metric.sourcePropertyId);
  const time = root.properties.find((item) => item.id === root.defaultTimePropertyId);
  const select: string[] = [];
  const groupBy: string[] = [];
  const joins: string[] = [];
  const where = [`(t0.${root.defaultFilter ?? "1 = 1"})`];
  const params: string[] = [];
  let alias = 1;

  if (request.timeGrain && time) {
    const expression = `DATE_TRUNC(t0.${time.sourceColumn}, '${request.timeGrain.toLowerCase()}')`;
    select.push(`${expression} AS \`时间\``);
    groupBy.push(expression);
    where.push(`t0.${time.sourceColumn} >= ?`, `t0.${time.sourceColumn} < ?`);
    params.push("2026-01-01", "2027-01-01");
  }

  if (request.dimensionId) {
    const owner = snapshot.objects.find((object) => object.properties.some((property) => property.id === request.dimensionId));
    const property = owner?.properties.find((item) => item.id === request.dimensionId);
    if (owner && property) {
      if (owner.id === root.id) {
        select.push(`t0.${property.sourceColumn} AS \`${property.label}\``);
        groupBy.push(`t0.${property.sourceColumn}`);
      } else {
        const relation = snapshot.relations.find((item) => item.enabled && item.sourceObjectId === root.id && item.targetObjectId === owner.id);
        if (!relation || relation.fanoutRisk === "HIGH" || relation.cardinality === "MANY_TO_MANY") throw new Error("RELATION_FANOUT_UNSAFE");
        const sourceKey = root.properties.find((item) => item.id === relation.sourcePropertyId)!;
        const targetKey = owner.properties.find((item) => item.id === relation.targetPropertyId)!;
        const currentAlias = `t${alias++}`;
        joins.push(`${relation.required ? "INNER" : "LEFT"} JOIN ${owner.sourceTableId} AS ${currentAlias} ON t0.${sourceKey.sourceColumn} = ${currentAlias}.${targetKey.sourceColumn}`);
        select.push(`${currentAlias}.${property.sourceColumn} AS \`${property.label}\``);
        groupBy.push(`${currentAlias}.${property.sourceColumn}`);
        if (owner.defaultFilter) where.push(`(${currentAlias}.${owner.defaultFilter})`);
      }
    }
  }

  if (request.boundValue) {
    const binding = request.boundValue;
    const owner = snapshot.objects.find((item) => item.id === binding.objectId)!;
    const property = owner.properties.find((item) => item.id === binding.propertyId)!;
    if (owner.id === root.id) {
      where.push(`t0.${property.sourceColumn} = ?`);
    } else {
      const relation = snapshot.relations.find((item) => item.enabled && item.sourceObjectId === root.id && item.targetObjectId === owner.id);
      if (!relation) throw new Error("RELATION_PATH_NOT_FOUND");
      const sourceKey = root.properties.find((item) => item.id === relation.sourcePropertyId)!;
      const targetKey = owner.properties.find((item) => item.id === relation.targetPropertyId)!;
      where.push(`EXISTS (SELECT 1 FROM ${owner.sourceTableId} AS vf0 WHERE t0.${sourceKey.sourceColumn} = vf0.${targetKey.sourceColumn}${owner.defaultFilter ? ` AND vf0.${owner.defaultFilter}` : ""} AND vf0.${property.sourceColumn} = ?)`);
    }
    params.push(binding.value);
  }

  const metricSql = (current: Metric, stack = new Set<string>()): string => {
    if (stack.has(current.id)) throw new Error("DERIVED_METRIC_CYCLE");
    if (current.metricType === "BASE") {
      const currentSource = root.properties.find((item) => item.id === current.sourcePropertyId);
      return current.aggregation === "COUNT" ? "COUNT(*)" : `${current.aggregation}(t0.${currentSource?.sourceColumn})`;
    }
    const nextStack = new Set(stack).add(current.id);
    const left = snapshot.metrics.find((item) => item.id === current.leftMetricId);
    const right = snapshot.metrics.find((item) => item.id === current.rightMetricId);
    if (!left || !right) throw new Error("DERIVED_METRIC_DEPENDENCY_NOT_FOUND");
    const leftSql = metricSql(left, nextStack);
    const rightSql = metricSql(right, nextStack);
    switch (current.calculationOperator) {
      case "ADD": return `((${leftSql}) + (${rightSql}))`;
      case "SUBTRACT": return `((${leftSql}) - (${rightSql}))`;
      case "MULTIPLY": return `((${leftSql}) * (${rightSql}))`;
      case "DIVIDE":
      case "RATIO": return `((${leftSql}) / NULLIF((${rightSql}), 0) * ${current.scale ?? 1})`;
      default: throw new Error("DERIVED_METRIC_OPERATOR_INVALID");
    }
  };
  const measureSql = metricSql(metric);
  select.push(`${measureSql} AS \`${metric.label}\``);
  const sql = [
    `SELECT ${select.join(",\n       ")}`,
    `FROM ${root.sourceTableId} AS t0`,
    ...joins,
    `WHERE ${where.join("\n  AND ")}`,
    ...(groupBy.length ? [`GROUP BY ${groupBy.join(", ")}`] : []),
    "ORDER BY 1 ASC",
    "LIMIT 200",
  ].join("\n");
  if (hasUnsafeSql(sql)) throw new Error("READ_ONLY_VIOLATION");
  return {
    planId: `plan_${Math.random().toString(36).slice(2, 9)}`,
    ontologyVersion: snapshot.version,
    sql,
    params,
    ir: {
      version: 3,
      ontologyVersion: snapshot.version,
      rootObjectId: root.id,
      measureIds: [metric.id],
      dimensionPropertyIds: request.dimensionId ? [request.dimensionId] : [],
      relationIds: joins.length ? [snapshot.relations.find((relation) => joins.some((join) => join.includes(snapshot.objects.find((item) => item.id === relation.targetObjectId)?.sourceTableId ?? "__")))?.id].filter(Boolean) : [],
      grain: request.timeGrain ? `${request.timeGrain} 时间粒度` : root.grain,
      resultKind: "aggregate",
      limit: 200,
      resultContract: { calculationSource: "DORIS_SQL", businessLogicBeforeLimit: true, completeness: "COMPLETE_IF_NOT_TRUNCATED", exhaustiveRequested: false },
    },
  };
}

export function auditEvent(sequence: number, stage: AuditEvent["stage"], action: string, detail: string, outcome: AuditEvent["outcome"] = "SUCCESS"): AuditEvent {
  return { sequence, stage, action, detail, outcome, durationMs: 18 + sequence * 7, timestamp: new Date(Date.now() - (8 - sequence) * 60_000).toISOString() };
}
