import { describe, it, expect } from 'vitest';
import { ConditionalRulesService, ConditionalRule, AttributeValueMap } from '../../../modules/catalog/conditional-rules.service';

/**
 * Conditional rule evaluation engine tests.
 *
 * Tests the pure rule evaluation logic: given attribute values and a set of
 * conditional rules, the engine returns which attributes are required/hidden/optional.
 */

const svc = new ConditionalRulesService();

function makeValues(entries: [string, unknown][]): AttributeValueMap {
  return new Map(entries);
}

describe('ConditionalRulesService', () => {
  it('returns empty effects when there are no rules', () => {
    const result = svc.evaluate([], makeValues([]));
    expect(result.effects.size).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('IF gpu=Dedicated THEN gpu_model=required — condition met', () => {
    const gpuId = 'gpu-attr-id';
    const gpuModelId = 'gpu-model-attr-id';

    const rules: ConditionalRule[] = [{
      if: { attributeId: gpuId, operator: 'eq', value: 'Dedicated' },
      then: { action: 'require', targetAttributeId: gpuModelId },
    }];

    const values = makeValues([[gpuId, 'Dedicated']]);
    const result = svc.evaluate(rules, values, [gpuId, gpuModelId]);

    const gpuModelEffect = result.effects.get(gpuModelId);
    expect(gpuModelEffect).toBeDefined();
    expect(gpuModelEffect!.required).toBe(true);
    expect(gpuModelEffect!.hidden).toBe(false);

    // gpu_model is required but has no value → validation error
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.attributeId).toBe(gpuModelId);
  });

  it('IF gpu=Dedicated THEN gpu_model=required — condition NOT met', () => {
    const gpuId = 'gpu-attr-id';
    const gpuModelId = 'gpu-model-attr-id';

    const rules: ConditionalRule[] = [{
      if: { attributeId: gpuId, operator: 'eq', value: 'Dedicated' },
      then: { action: 'require', targetAttributeId: gpuModelId },
    }];

    const values = makeValues([[gpuId, 'Integrated']]);
    const result = svc.evaluate(rules, values, [gpuId, gpuModelId]);

    const gpuModelEffect = result.effects.get(gpuModelId);
    expect(gpuModelEffect).toBeDefined();
    expect(gpuModelEffect!.required).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  it('hide action makes attribute hidden and not required', () => {
    const typeId = 'type-attr';
    const detailsId = 'details-attr';

    const rules: ConditionalRule[] = [{
      if: { attributeId: typeId, operator: 'eq', value: 'Basic' },
      then: { action: 'hide', targetAttributeId: detailsId },
    }];

    const values = makeValues([[typeId, 'Basic']]);
    const result = svc.evaluate(rules, values, [typeId, detailsId]);

    const effect = result.effects.get(detailsId);
    expect(effect!.hidden).toBe(true);
    expect(effect!.required).toBe(false); // Hidden overrides required
    expect(result.errors).toHaveLength(0); // Hidden attrs don't produce errors
  });

  it('optional action unsets required when no other rule requires it', () => {
    const condId = 'condition-attr';
    const targetId = 'target-attr';

    const rules: ConditionalRule[] = [{
      if: { attributeId: condId, operator: 'eq', value: 'A' },
      then: { action: 'optional', targetAttributeId: targetId },
    }];

    const values = makeValues([[condId, 'A']]);
    const result = svc.evaluate(rules, values, [condId, targetId]);

    const effect = result.effects.get(targetId);
    expect(effect!.required).toBe(false);
  });

  it('neq operator works correctly', () => {
    const attrA = 'a';
    const attrB = 'b';

    const rules: ConditionalRule[] = [{
      if: { attributeId: attrA, operator: 'neq', value: 'skip' },
      then: { action: 'require', targetAttributeId: attrB },
    }];

    // When A != 'skip', B is required
    const result1 = svc.evaluate(rules, makeValues([[attrA, 'other']]));
    expect(result1.effects.get(attrB)!.required).toBe(true);

    // When A == 'skip', B is NOT required
    const result2 = svc.evaluate(rules, makeValues([[attrA, 'skip']]));
    expect(result2.effects.get(attrB)!.required).toBe(false);
  });

  it('in operator checks array membership', () => {
    const colorId = 'color';
    const hexId = 'hex-code';

    const rules: ConditionalRule[] = [{
      if: { attributeId: colorId, operator: 'in', value: ['Red', 'Blue', 'Green'] },
      then: { action: 'require', targetAttributeId: hexId },
    }];

    const hit = svc.evaluate(rules, makeValues([[colorId, 'Red']]));
    expect(hit.effects.get(hexId)!.required).toBe(true);

    const miss = svc.evaluate(rules, makeValues([[colorId, 'Yellow']]));
    expect(miss.effects.get(hexId)!.required).toBe(false);
  });

  it('numeric comparison operators (gt, lt, gte, lte)', () => {
    const qtyId = 'qty';
    const reasonId = 'reason';

    const rules: ConditionalRule[] = [{
      if: { attributeId: qtyId, operator: 'gt', value: 100 },
      then: { action: 'require', targetAttributeId: reasonId },
    }];

    const over = svc.evaluate(rules, makeValues([[qtyId, 150]]));
    expect(over.effects.get(reasonId)!.required).toBe(true);

    const under = svc.evaluate(rules, makeValues([[qtyId, 50]]));
    expect(under.effects.get(reasonId)!.required).toBe(false);
  });

  it('no validation error when required attribute has a value', () => {
    const condId = 'c';
    const targetId = 't';

    const rules: ConditionalRule[] = [{
      if: { attributeId: condId, operator: 'eq', value: 'yes' },
      then: { action: 'require', targetAttributeId: targetId },
    }];

    // Target has a value → no error
    const values = makeValues([[condId, 'yes'], [targetId, 'some-value']]);
    const result = svc.evaluate(rules, values);
    expect(result.errors).toHaveLength(0);
  });

  it('multiple rules can target the same attribute', () => {
    const a = 'a';
    const b = 'b';
    const target = 'target';

    const rules: ConditionalRule[] = [
      {
        if: { attributeId: a, operator: 'eq', value: '1' },
        then: { action: 'require', targetAttributeId: target },
      },
      {
        if: { attributeId: b, operator: 'eq', value: '2' },
        then: { action: 'hide', targetAttributeId: target },
      },
    ];

    // Both conditions met: require + hide → hide wins (hidden = not required)
    const both = svc.evaluate(rules, makeValues([[a, '1'], [b, '2']]));
    const effect = both.effects.get(target)!;
    expect(effect.hidden).toBe(true);
    expect(effect.required).toBe(false);
    expect(effect.appliedActions).toContain('require');
    expect(effect.appliedActions).toContain('hide');
  });

  it('handles missing condition attribute gracefully (no value = condition not met)', () => {
    const rules: ConditionalRule[] = [{
      if: { attributeId: 'missing', operator: 'eq', value: 'x' },
      then: { action: 'require', targetAttributeId: 'target' },
    }];

    const result = svc.evaluate(rules, makeValues([]));
    expect(result.effects.get('target')!.required).toBe(false);
  });
});
