export type EntityStatus = "DRAFT" | "VERIFIED" | "PUBLISHED" | "DEPRECATED";
export type ObjectType = "ENTITY" | "EVENT" | "SNAPSHOT" | "AGGREGATE" | "RELATIONSHIP";
export type PropertyMeaning = "ID" | "CODE" | "NAME" | "ENTITY_REFERENCE" | "CATEGORY" | "TIME" | "NUMBER" | "BOOLEAN" | "GEOGRAPHY" | "TEXT";
export type Visibility = "ANALYTICAL" | "DETAIL_ONLY" | "HIDDEN";
export type Cardinality = "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_ONE" | "MANY_TO_MANY";

export interface NumericPropertySpec {
  kind: "GENERAL" | "CURRENCY" | "RATIO";
  unit?: string;
  currency?: string;
  defaultAggregation: "SUM" | "AVG" | "MIN" | "MAX" | "NONE";
  aggregationBehavior: "ADDITIVE" | "SEMI_ADDITIVE" | "NON_ADDITIVE";
}

export interface OntologyProperty {
  id: string;
  name: string;
  label: string;
  description: string;
  dataType: string;
  sourceColumn: string;
  sensitive: boolean;
  meaning: PropertyMeaning;
  unique: boolean;
  valueSearchable: boolean;
  numericSpec?: NumericPropertySpec;
  visibility: Visibility;
  synonyms: string[];
  defaultDisplay: boolean;
  exportable: boolean;
  bindingPriority: number;
}

export interface OntologyObject {
  id: string;
  name: string;
  label: string;
  description: string;
  sourceTableId: string;
  status: EntityStatus;
  objectType: ObjectType;
  grainPropertyIds: string[];
  grain: string;
  defaultTimePropertyId?: string;
  defaultFilter?: string;
  synonyms: string[];
  bindingPriority: number;
  properties: OntologyProperty[];
}

export interface Metric {
  id: string;
  metricType: "BASE" | "DERIVED";
  name: string;
  label: string;
  description: string;
  objectId: string;
  definitionMode: "VISUAL" | "SQL";
  expression: string;
  sourcePropertyId?: string;
  filterExpression?: string;
  aggregation: "SUM" | "COUNT" | "COUNT_DISTINCT" | "AVG" | "MIN" | "MAX" | "CUSTOM";
  leftMetricId?: string;
  rightMetricId?: string;
  calculationOperator?: "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE" | "RATIO";
  scale?: number;
  format: "currency" | "number" | "percent";
  unit?: string;
  synonyms: string[];
  status: EntityStatus;
}

export interface OntologyRelation {
  id: string;
  name: string;
  sourceObjectId: string;
  targetObjectId: string;
  type: "REFERENCE" | "COMPOSITION" | "ASSOCIATION" | "HIERARCHY" | "EVENT_PARTICIPATION" | "IDENTITY" | "DERIVED";
  cardinality: Cardinality;
  sourcePropertyId: string;
  targetPropertyId: string;
  joinExpression: string;
  direction: "BIDIRECTIONAL" | "SOURCE_TO_TARGET" | "TARGET_TO_SOURCE";
  required: boolean;
  enabled: boolean;
  fanoutRisk: "NONE" | "LOW" | "HIGH";
  composition?: {
    parentObjectId: string;
    childObjectId: string;
    ownership: "OWNED" | "SHARED";
    aggregationPolicy: "PRE_AGGREGATE_CHILD" | "EXISTS_ONLY";
  };
  status: EntityStatus;
}

export interface OntologySnapshot {
  schemaVersion: 2;
  version: number;
  baseVersion?: number;
  status: EntityStatus;
  publishedAt?: string;
  objects: OntologyObject[];
  relations: OntologyRelation[];
  metrics: Metric[];
  dimensionHierarchies: Array<{ id: string; label: string; kind: "FIXED_LEVELS" | "ADJACENCY_LIST"; status: EntityStatus }>;
}

export interface ValidationIssue {
  code: string;
  level: "ERROR" | "WARNING";
  entityId: string;
  message: string;
}

export interface SearchHit {
  ref: string;
  id: string;
  label: string;
  kind: "OBJECT" | "METRIC" | "DIMENSION";
  tier: "EXACT_LABEL" | "SYNONYM" | "NGRAM";
  score: number;
}

export interface AuditEvent {
  sequence: number;
  timestamp: string;
  stage: "frame" | "search" | "binding" | "planning" | "sql" | "execution" | "publish";
  action: string;
  outcome: "SUCCESS" | "REJECTED" | "FAILED";
  durationMs: number;
  detail: string;
}
