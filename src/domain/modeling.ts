import type { OntologyObject, OntologyProperty, OntologyRelation, ObjectType, PropertyMeaning } from "./types.js";

export const relationTypeLabels: Record<OntologyRelation["type"], string> = {
  REFERENCE: "引用关系",
  COMPOSITION: "主子关系",
  ASSOCIATION: "业务关联",
  HIERARCHY: "父子层级",
  EVENT_PARTICIPATION: "事件参与",
  IDENTITY: "同一身份",
  DERIVED: "派生关系",
};

export const propertyMeaningLabels: Record<PropertyMeaning, string> = {
  ID: "唯一标识",
  CODE: "业务编码",
  NAME: "展示名称",
  ENTITY_REFERENCE: "实体引用",
  CATEGORY: "分类",
  TIME: "时间",
  NUMBER: "数值",
  BOOLEAN: "布尔值",
  GEOGRAPHY: "地理位置",
  TEXT: "文本",
};

export function inferCardinality(sourceProperty: OntologyProperty, targetProperty: OntologyProperty): OntologyRelation["cardinality"] {
  if (sourceProperty.unique && targetProperty.unique) return "ONE_TO_ONE";
  if (sourceProperty.unique && !targetProperty.unique) return "ONE_TO_MANY";
  if (!sourceProperty.unique && targetProperty.unique) return "MANY_TO_ONE";
  return "MANY_TO_MANY";
}

export function inferRelationType(source: OntologyObject, target: OntologyObject, sourceProperty: OntologyProperty, targetProperty: OntologyProperty): OntologyRelation["type"] {
  if (source.id === target.id) return "HIERARCHY";
  if (sourceProperty.unique && targetProperty.unique && sourceProperty.meaning !== "ENTITY_REFERENCE") return "IDENTITY";
  if (source.objectType === "RELATIONSHIP" && target.objectType === "EVENT") return "EVENT_PARTICIPATION";
  if (source.objectType === "RELATIONSHIP") return "ASSOCIATION";
  return "REFERENCE";
}

export function inferObjectType(tableName: string, columns: Array<{ name: string; dataType: string }>): ObjectType {
  const normalized = tableName.toLowerCase();
  if (/(^|_)(bridge|mapping|relation|link)(_|$)/.test(normalized)) return "RELATIONSHIP";
  if (/(^|_)(snapshot|inventory|balance|stock)(_|$)/.test(normalized)) return "SNAPSHOT";
  if (/(^|_)(agg|aggregate|summary|report|stat)(_|$)|_(daily|monthly|weekly)$/.test(normalized)) return "AGGREGATE";
  const hasTime = columns.some((column) => /date|time/i.test(column.dataType) || /(^|_)(date|time|dt|at)$/.test(column.name));
  const hasMeasure = columns.some((column) => /BIGINT|INT|DECIMAL|DOUBLE|FLOAT/i.test(column.dataType) && !/(^|_)id$/.test(column.name));
  if (/(^|_)(fact|event|order|transaction|payment|sale)(_|$)/.test(normalized) || (hasTime && hasMeasure)) return "EVENT";
  return "ENTITY";
}

export function inferPropertyMeaning(name: string, type: string, idColumn?: string, timeColumn?: string): PropertyMeaning {
  if (name === idColumn) return "ID";
  if (name === timeColumn) return "TIME";
  if (/date|time/i.test(type) || /(^|_)(date|time|dt|at)$/.test(name)) return "TIME";
  if (/(^|_)id$/.test(name)) return "ENTITY_REFERENCE";
  if (/BIGINT|INT|DECIMAL|DOUBLE|FLOAT/i.test(type)) return "NUMBER";
  if (/(^|_)name$/.test(name)) return "NAME";
  if (/(^|_)code$/.test(name)) return "CODE";
  if (/region|province|city|country/i.test(name)) return "GEOGRAPHY";
  if (/^is_|^has_|bool/i.test(name) || /BOOLEAN/i.test(type)) return "BOOLEAN";
  return "TEXT";
}
