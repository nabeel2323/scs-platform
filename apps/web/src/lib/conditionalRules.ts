/**
 * Client-side conditional rule evaluator for the Merchant Product Studio.
 *
 * Mirrors the backend ConditionalRulesService.evaluate() logic so the UI can
 * react in real-time (require / hide / optional) without a server round-trip.
 * The engine is pure — no side effects, no DOM access.
 */

export type RuleOperator = 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'lt' | 'gte' | 'lte';
export type RuleAction = 'require' | 'hide' | 'optional';

export interface RuleCondition {
  attributeId: string;
  operator: RuleOperator;
  value: unknown;
}

export interface RuleConsequence {
  action: RuleAction;
  targetAttributeId: string;
}

export interface ConditionalRule {
  if: RuleCondition;
  then: RuleConsequence;
}

export interface AttributeEffect {
  required: boolean;
  hidden: boolean;
}

/** Map of attributeId → current value. */
export type AttributeValueMap = Map<string, unknown>;

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function evaluateCondition(cond: RuleCondition, values: AttributeValueMap): boolean {
  const actual = values.get(cond.attributeId);
  const expected = cond.value;

  switch (cond.operator) {
    case 'eq':   return looseEquals(actual, expected);
    case 'neq':  return !looseEquals(actual, expected);
    case 'in':
      return Array.isArray(expected) && expected.some(v => looseEquals(actual, v));
    case 'not_in':
      return !Array.isArray(expected) || !expected.some(v => looseEquals(actual, v));
    case 'gt':   return toNumber(actual) > toNumber(expected);
    case 'lt':   return toNumber(actual) < toNumber(expected);
    case 'gte':  return toNumber(actual) >= toNumber(expected);
    case 'lte':  return toNumber(actual) <= toNumber(expected);
    default:     return false;
  }
}

/**
 * Evaluate conditional rules against current attribute values.
 * Returns a map of targetAttributeId → { required, hidden }.
 */
export function evaluateConditionalRules(
  rules: ConditionalRule[],
  values: Record<string, string>,
  allAttrIds?: string[],
): Map<string, AttributeEffect> {
  const valueMap: AttributeValueMap = new Map(Object.entries(values));
  const effects = new Map<string, AttributeEffect>();

  // Initialize effects for all known attributes
  const knownIds = allAttrIds ?? [
    ...valueMap.keys(),
    ...rules.flatMap(r => [r.if.attributeId, r.then.targetAttributeId]),
  ];
  for (const id of knownIds) {
    effects.set(id, { required: false, hidden: false });
  }

  // Evaluate each rule
  for (const rule of rules) {
    if (!rule.if || !rule.then) continue;
    if (!evaluateCondition(rule.if, valueMap)) continue;

    const targetId = rule.then.targetAttributeId;
    const action = rule.then.action;

    let effect = effects.get(targetId);
    if (!effect) {
      effect = { required: false, hidden: false };
      effects.set(targetId, effect);
    }

    switch (action) {
      case 'require':
        effect.required = true;
        break;
      case 'hide':
        effect.hidden = true;
        effect.required = false;
        break;
      case 'optional':
        if (!rules.some(r =>
          r.then.targetAttributeId === targetId &&
          r.then.action === 'require' &&
          evaluateCondition(r.if, valueMap)
        )) {
          effect.required = false;
        }
        break;
    }
  }

  return effects;
}
