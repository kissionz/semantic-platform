import { describe, expect, it } from "vitest";
import { inferCardinality, inferObjectType, inferPropertyMeaning, inferRelationType } from "./modeling.js";
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
});
