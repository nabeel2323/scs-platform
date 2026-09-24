import { describe, it, expect } from 'vitest';
import { ConditionalRulesService, ConditionalRule, AttributeValueMap } from '../../../modules/catalog/conditional-rules.service';

/**
 * P1 remediation — conditional rule enforcement scenarios.
 *
 * Tests the warranty use-case end-to-end through the evaluator:
 * - warranty=No → warranty period not required
 * - warranty=Yes + period supplied → valid
 * - warranty=Yes + period missing → validation error
 * - hide / optional actions
 * - Multi-rule interactions (require + hide on same target)
 * - Scope semantics: PRODUCT attributes validated at product level
 */

const svc = new ConditionalRulesService();

function makeValues(entries: [string, unknown][]): AttributeValueMap {
  return new Map(entries);
}

// Attribute IDs for the warranty scenario
const HAS_WARRANTY = 'attr-has-warranty';
const WARRANTY_PERIOD = 'attr-warranty-period';
const WARRANTY_TERMS = 'attr-warranty-terms';

const warrantyRules: ConditionalRule[] = [
  {
    if: { attributeId: HAS_WARRANTY, operator: 'eq', value: 'true' },
    then: { action: 'require', targetAttributeId: WARRANTY_PERIOD },
  },
  {
    if: { attributeId: HAS_WARRANTY, operator: 'eq', value: 'true' },
    then: { action: 'require', targetAttributeId: WARRANTY_TERMS },
  },
];

describe('Warranty scenario — conditional require', () => {
  it('warranty=No → period and terms not required', () => {
    const values = makeValues([[HAS_WARRANTY, 'false']]);
    const result = svc.evaluate(warrantyRules, values, [HAS_WARRANTY, WARRANTY_PERIOD, WARRANTY_TERMS]);

    const periodEffect = result.effects.get(WARRANTY_PERIOD);
    expect(periodEffect?.required).toBe(false);

    const termsEffect = result.effects.get(WARRANTY_TERMS);
    expect(termsEffect?.required).toBe(false);

    expect(result.errors).toHaveLength(0);
  });

  it('warranty=Yes + period supplied + terms supplied → valid', () => {
    const values = makeValues([
      [HAS_WARRANTY, 'true'],
      [WARRANTY_PERIOD, '24'],
      [WARRANTY_TERMS, 'Full replacement'],
    ]);
    const result = svc.evaluate(warrantyRules, values, [HAS_WARRANTY, WARRANTY_PERIOD, WARRANTY_TERMS]);

    expect(result.effects.get(WARRANTY_PERIOD)?.required).toBe(true);
    expect(result.effects.get(WARRANTY_TERMS)?.required).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('warranty=Yes + period missing → validation error', () => {
    const values = makeValues([
      [HAS_WARRANTY, 'true'],
      [WARRANTY_TERMS, 'Full replacement'],
    ]);
    const result = svc.evaluate(warrantyRules, values, [HAS_WARRANTY, WARRANTY_PERIOD, WARRANTY_TERMS]);

    expect(result.effects.get(WARRANTY_PERIOD)?.required).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.attributeId).toBe(WARRANTY_PERIOD);
  });

  it('warranty=Yes + both missing → two validation errors', () => {
    const values = makeValues([[HAS_WARRANTY, 'true']]);
    const result = svc.evaluate(warrantyRules, values, [HAS_WARRANTY, WARRANTY_PERIOD, WARRANTY_TERMS]);

    expect(result.errors).toHaveLength(2);
    expect(result.errors.map(e => e.attributeId).sort()).toEqual([WARRANTY_PERIOD, WARRANTY_TERMS].sort());
  });

  it('update from No→Yes triggers requirement', () => {
    // Initially warranty=No
    const before = makeValues([[HAS_WARRANTY, 'false']]);
    const resultBefore = svc.evaluate(warrantyRules, before, [HAS_WARRANTY, WARRANTY_PERIOD, WARRANTY_TERMS]);
    expect(resultBefore.errors).toHaveLength(0);

    // Change to warranty=Yes without supplying period
    const after = makeValues([[HAS_WARRANTY, 'true']]);
    const resultAfter = svc.evaluate(warrantyRules, after, [HAS_WARRANTY, WARRANTY_PERIOD, WARRANTY_TERMS]);
    expect(resultAfter.errors.length).toBeGreaterThan(0);
  });

  it('update from Yes→No removes requirement', () => {
    // warranty=Yes without period → error
    const before = makeValues([[HAS_WARRANTY, 'true']]);
    const resultBefore = svc.evaluate(warrantyRules, before, [HAS_WARRANTY, WARRANTY_PERIOD, WARRANTY_TERMS]);
    expect(resultBefore.errors.length).toBeGreaterThan(0);

    // Change to warranty=No → no error
    const after = makeValues([[HAS_WARRANTY, 'false']]);
    const resultAfter = svc.evaluate(warrantyRules, after, [HAS_WARRANTY, WARRANTY_PERIOD, WARRANTY_TERMS]);
    expect(resultAfter.errors).toHaveLength(0);
  });
});

// ── hide action ────────────────────────────────────────────────

const HIDE_ATTR = 'attr-color';
const HIDE_TARGET = 'attr-custom-color';

const hideRules: ConditionalRule[] = [
  {
    if: { attributeId: HIDE_ATTR, operator: 'neq', value: 'custom' },
    then: { action: 'hide', targetAttributeId: HIDE_TARGET },
  },
];

describe('hide action', () => {
  it('hides attribute when condition is met (color ≠ custom)', () => {
    const values = makeValues([[HIDE_ATTR, 'red']]);
    const result = svc.evaluate(hideRules, values, [HIDE_ATTR, HIDE_TARGET]);

    expect(result.effects.get(HIDE_TARGET)?.hidden).toBe(true);
    expect(result.effects.get(HIDE_TARGET)?.required).toBe(false);
  });

  it('does not hide when condition is not met (color = custom)', () => {
    const values = makeValues([[HIDE_ATTR, 'custom']]);
    const result = svc.evaluate(hideRules, values, [HIDE_ATTR, HIDE_TARGET]);

    expect(result.effects.get(HIDE_TARGET)?.hidden).toBe(false);
  });

  it('hidden attribute is not required even if previously required by another rule', () => {
    const rules: ConditionalRule[] = [
      {
        if: { attributeId: HIDE_ATTR, operator: 'eq', value: 'custom' },
        then: { action: 'require', targetAttributeId: HIDE_TARGET },
      },
      {
        if: { attributeId: HIDE_ATTR, operator: 'eq', value: 'custom' },
        then: { action: 'hide', targetAttributeId: HIDE_TARGET },
      },
    ];
    const values = makeValues([[HIDE_ATTR, 'custom']]);
    const result = svc.evaluate(rules, values, [HIDE_ATTR, HIDE_TARGET]);

    // hide was applied after require → not required
    expect(result.effects.get(HIDE_TARGET)?.hidden).toBe(true);
    expect(result.effects.get(HIDE_TARGET)?.required).toBe(false);
  });
});

// ── optional action ────────────────────────────────────────────

const OPT_ATTR = 'attr-shipping';
const OPT_TARGET = 'attr-special-handling';

const optionalRules: ConditionalRule[] = [
  {
    if: { attributeId: OPT_ATTR, operator: 'eq', value: 'express' },
    then: { action: 'require', targetAttributeId: OPT_TARGET },
  },
  {
    if: { attributeId: OPT_ATTR, operator: 'eq', value: 'standard' },
    then: { action: 'optional', targetAttributeId: OPT_TARGET },
  },
];

describe('optional action', () => {
  it('makes attribute optional when condition is met (shipping=standard)', () => {
    const values = makeValues([[OPT_ATTR, 'standard']]);
    const result = svc.evaluate(optionalRules, values, [OPT_ATTR, OPT_TARGET]);

    expect(result.effects.get(OPT_TARGET)?.required).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  it('requires attribute when shipping=express', () => {
    const values = makeValues([[OPT_ATTR, 'express']]);
    const result = svc.evaluate(optionalRules, values, [OPT_ATTR, OPT_TARGET]);

    expect(result.effects.get(OPT_TARGET)?.required).toBe(true);
    expect(result.errors).toHaveLength(1);
  });
});

// ── Scope semantics ────────────────────────────────────────────

describe('Scope validation at correct layer', () => {
  it('PRODUCT scope rules are evaluated against product attribute values', () => {
    // Simulates a product type with a PRODUCT-scoped warranty attribute
    const productValues = makeValues([[HAS_WARRANTY, 'true']]);
    const result = svc.evaluate(warrantyRules, productValues, [HAS_WARRANTY, WARRANTY_PERIOD, WARRANTY_TERMS]);

    // PRODUCT scope → both period and terms are required at the product level
    expect(result.effects.get(WARRANTY_PERIOD)?.required).toBe(true);
    expect(result.errors).toHaveLength(2);
  });

  it('empty values map → no rules fire, no errors', () => {
    const result = svc.evaluate(warrantyRules, makeValues([]), [HAS_WARRANTY, WARRANTY_PERIOD]);

    // HAS_WARRANTY has no value, so eq 'true' is false → no rules fire
    expect(result.errors).toHaveLength(0);
  });
});

// ── Operator coverage ──────────────────────────────────────────

describe('All operators', () => {
  const TARGET = 'attr-target';

  it('in operator — matches when value is in the list', () => {
    const rules: ConditionalRule[] = [{
      if: { attributeId: 'x', operator: 'in', value: ['a', 'b', 'c'] },
      then: { action: 'require', targetAttributeId: TARGET },
    }];
    const result = svc.evaluate(rules, makeValues([['x', 'b']]), ['x', TARGET]);
    expect(result.effects.get(TARGET)?.required).toBe(true);
  });

  it('not_in operator — matches when value is NOT in the list', () => {
    const rules: ConditionalRule[] = [{
      if: { attributeId: 'x', operator: 'not_in', value: ['a', 'b'] },
      then: { action: 'require', targetAttributeId: TARGET },
    }];
    const result = svc.evaluate(rules, makeValues([['x', 'c']]), ['x', TARGET]);
    expect(result.effects.get(TARGET)?.required).toBe(true);
  });

  it('gt operator', () => {
    const rules: ConditionalRule[] = [{
      if: { attributeId: 'x', operator: 'gt', value: 10 },
      then: { action: 'require', targetAttributeId: TARGET },
    }];
    const above = svc.evaluate(rules, makeValues([['x', 15]]), ['x', TARGET]);
    expect(above.effects.get(TARGET)?.required).toBe(true);

    const below = svc.evaluate(rules, makeValues([['x', 5]]), ['x', TARGET]);
    expect(below.effects.get(TARGET)?.required).toBe(false);
  });

  it('lte operator', () => {
    const rules: ConditionalRule[] = [{
      if: { attributeId: 'x', operator: 'lte', value: 100 },
      then: { action: 'require', targetAttributeId: TARGET },
    }];
    const at = svc.evaluate(rules, makeValues([['x', 100]]), ['x', TARGET]);
    expect(at.effects.get(TARGET)?.required).toBe(true);

    const above = svc.evaluate(rules, makeValues([['x', 101]]), ['x', TARGET]);
    expect(above.effects.get(TARGET)?.required).toBe(false);
  });
});
