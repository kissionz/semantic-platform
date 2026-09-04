import { describe, expect, it } from "vitest";
import { applyOntologyDefaults, defaultNumericSpec, hydrateNumericSpec, inferCardinality, inferNumericKind, inferObjectType, inferPropertyMeaning, inferRelationType } from "./modeling.js";
import { sampleSnapshot } from "./sample.js";

describe("ontology modeling inference", () => {
  it("infers cardinality from key uniqueness", () => {
    const sales = sampleSnapshot.objects[0];
    const customer = sampleSnapshot.objects[1];
    expect(inferCardinality(sales.properties[1], customer.properties[0])).toBe("MANY_TO_ONE");
    expect(inferCardinality({ ...sales.properties[1], unique: true }, customer.properties[0])).toBe("ONE_TO_ONE");
  });

  it("infers structural relation types", () => {
    const customer = sampleSnapshot.objects[1];
    expect(inferRelationType(customer, customer, { ...customer.properties[0], meaning: "ENTITY_REFERENCE", unique: false }, customer.properties[0])).toBe("HIERARCHY");
    expect(inferRelationType(customer, sampleSnapshot.objects[2], customer.properties[0], sampleSnapshot.objects[2].properties[0])).toBe("IDENTITY");
  });

  it("infers object and property defaults for imported tables", () => {
    expect(inferObjectType("fact_order", [{ name: "amount", dataType: "DECIMAL" }])).toBe("EVENT");
    expect(inferObjectType("dim_customer", [{ name: "customer_id", dataType: "BIGINT" }])).toBe("ENTITY");
    expect(inferPropertyMeaning("customer_id", "BIGINT", "sale_id")).toBe("ENTITY_REFERENCE");
  });

  it("provides complete editable defaults for numeric properties", () => {
    expect(defaultNumericSpec("GENERAL")).toMatchObject({ unit: "个", defaultAggregation: "SUM", aggregationBehavior: "ADDITIVE" });
    expect(defaultNumericSpec("CURRENCY")).toMatchObject({ unit: "元", currency: "CNY" });
    expect(defaultNumericSpec("RATIO")).toMatchObject({ defaultAggregation: "AVG", aggregationBehavior: "NON_ADDITIVE" });
    expect(hydrateNumericSpec({ kind: "CURRENCY", defaultAggregation: "SUM", aggregationBehavior: "ADDITIVE" })).toMatchObject({ unit: "元", currency: "CNY" });
  });

  it("infers practical numeric defaults from physical column names", () => {
    expect(inferNumericKind("sales_amount")).toBe("CURRENCY");
    expect(inferNumericKind("conversion_rate")).toBe("RATIO");
    expect(inferNumericKind("item_count")).toBe("GENERAL");
  });

  it("repairs missing required numeric defaults across an existing snapshot", () => {
    const legacy = structuredClone(sampleSnapshot);
    const property = legacy.objects[0].properties.find((item) => item.meaning === "NUMBER")!;
    property.numericSpec = { kind: "GENERAL", defaultAggregation: "SUM", aggregationBehavior: "ADDITIVE" };
    const repaired = applyOntologyDefaults(legacy).objects[0].properties.find((item) => item.id === property.id)!;
    expect(repaired.numericSpec?.unit).toBe("个");
  });
});
