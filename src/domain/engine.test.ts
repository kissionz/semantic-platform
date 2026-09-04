import { describe, expect, it } from "vitest";
import { sampleSnapshot } from "./sample";
import { bindValue, compilePlan, semanticSearch, validateSnapshot } from "./engine";

describe("ontology validation", () => {
  it("accepts the sample ontology", () => {
    expect(validateSnapshot(sampleSnapshot).filter((issue) => issue.level === "ERROR")).toEqual([]);
  });

  it("rejects an entity without one ID", () => {
    const snapshot = structuredClone(sampleSnapshot);
    snapshot.objects[1].properties = snapshot.objects[1].properties.filter((property) => property.meaning !== "ID");
    expect(validateSnapshot(snapshot).map((issue) => issue.code)).toContain("ENTITY_ID_REQUIRED");
  });

  it("rejects a non-additive default SUM", () => {
    const snapshot = structuredClone(sampleSnapshot);
    const amount = snapshot.objects[0].properties.find((property) => property.id === "prop_sales_amount")!;
    amount.numericSpec!.aggregationBehavior = "NON_ADDITIVE";
    expect(validateSnapshot(snapshot).map((issue) => issue.code)).toContain("NON_ADDITIVE_SUM");
  });

  it("rejects relationship cardinality that differs from endpoint uniqueness", () => {
    const snapshot = structuredClone(sampleSnapshot);
    snapshot.relations[0].cardinality = "ONE_TO_ONE";
    expect(validateSnapshot(snapshot).map((issue) => issue.code)).toContain("RELATION_CARDINALITY_MISMATCH");
  });

  it("requires a governed reference property on the relationship source", () => {
    const snapshot = structuredClone(sampleSnapshot);
    snapshot.objects[0].properties.find((property) => property.id === "prop_customer_id")!.meaning = "NUMBER";
    expect(validateSnapshot(snapshot).map((issue) => issue.code)).toContain("RELATION_SOURCE_NOT_REFERENCE");
  });
});

describe("runtime and compiler", () => {
  it("returns deterministic semantic hits", () => {
    expect(semanticSearch(sampleSnapshot, "今年华东销售额按月趋势")).toEqual(semanticSearch(sampleSnapshot, "今年华东销售额按月趋势"));
  });

  it("binds known business values", () => {
    expect(bindValue(sampleSnapshot, "华东")[0].propertyId).toBe("prop_region_name");
  });

  it("uses EXISTS for a related value filter", () => {
    const plan = compilePlan(sampleSnapshot, { query: "今年华东销售额按月趋势", metricId: "metric_sales", timeGrain: "MONTH", boundValue: bindValue(sampleSnapshot, "华东")[0] });
    expect(plan.sql).toContain("EXISTS (SELECT 1 FROM `dim_region`");
    expect(plan.sql).not.toContain("DELETE");
    const year = new Date().getUTCFullYear();
    expect(plan.params).toEqual([`${year}-01-01`, `${year + 1}-01-01`, "华东"]);
  });

  it("guards a derived ratio denominator with NULLIF", () => {
    const plan = compilePlan(sampleSnapshot, { query: "毛利率", metricId: "metric_margin" });
    expect(plan.sql).toContain("NULLIF");
    expect(plan.sql).toContain("* 100");
  });
});
