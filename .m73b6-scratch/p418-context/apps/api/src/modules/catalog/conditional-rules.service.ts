import { Injectable } from '@nestjs/common';

/**
 * Conditional rule evaluation engine for product type attributes.
 *
 * Rules live on `product_type_attributes.conditional_rules` (JSONB array).
 * Each rule expresses: IF <condition> THEN <action> on a target attribute.
 *
 * Rule shape:
 * ```json
 * {
 *   "if": { "attributeId": "<uuid>", "operator": "eq"|"neq"|"in"|"not_in"|"gt"|"lt"|"gte"|"lte", "value": <any> },
 *   "then": { "action": "require"|"hide"|"optional", "targetAttributeId": "<uuid>" }
 * }
 * ```
 *
 * The engine is pure: no DB access, no side effects. Given a set of attribute
 * values and a list of rules, it returns the effective visibility/required state
 * for every attribute referenced by the rules.
 */

// ── Types ────────────────────────────────────────────────────

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

/** Map of attributeId → current value (string | number | boolean | string[] | null). */
export type AttributeValueMap = Map<string, unknown>;

/** The effective state of an attribute after rule evaluation. */
export interface AttributeEffect {
  attributeId: string;
  required: boolean;
  hidden: boolean;
  /** The actions that were applied (for debugging / UI display). */
  appliedActions: RuleAction[];
}

export interface RuleEvaluationResult {
  /** Per-attribute effects keyed by targetAttributeId. */
  effects: Map<string, AttributeEffect>;
  /** Validation errors: required attributes that are missing values. */
  errors: Array<{ attributeId: string; message: string }>;
}

// ── Service ──────────────────────────────────────────────────

@Injectable()
export class ConditionalRulesService {
  /**
   * Evaluate conditional rules against a set of attribute values.
   *
   * @param rules       Array of conditional rules from product_type_attributes.
   * @param values      Current attribute values (attributeId → value).
   * @param allAttrIds  Full set of attribute IDs in the product type (for completeness).
   * @returns           Evaluation result with per-attribute effects and validation errors.
   */
  evaluate(
    rules: ConditionalRule[],
    values: AttributeValueMap,
    allAttrIds?: string[],
  ): RuleEvaluationResult {
    const effects = new Map<string, AttributeEffect>();

    // Initialize effects for all known attributes
    const knownIds = allAttrIds ?? new Set([
      ...values.keys(),
      ...rules.flatMap(r => [r.if.attributeId, r.then.targetAttributeId]),
    ]);
    for (const id of knownIds) {
      effects.set(id, { attributeId: id, required: false, hidden: false, appliedActions: [] });
    }

    // Evaluate each rule
    for (const rule of rules) {
      if (!rule.if || !rule.then) continue;

      const conditionMet = this.evaluateCondition(rule.if, values);
      if (!conditionMet) continue;

      const targetId = rule.then.targetAttributeId;
      const action = rule.then.action;

      // Get or create effect for target
      let effect = effects.get(targetId);
      if (!effect) {
        effect = { attributeId: targetId, required: false, hidden: false, appliedActions: [] };
        effects.set(targetId, effect);
      }

      // Apply action
      effect.appliedActions.push(action);
      switch (action) {
        case 'require':
          effect.required = true;
          break;
        case 'hide':
          effect.hidden = true;
          // Hidden attributes are not required (even if previously required)
          effect.required = false;
          break;
        case 'optional':
          // Only unset required if no other rule requires it
          if (!rules.some(r =>
            r.then.targetAttributeId === targetId &&
            r.then.action === 'require' &&
            this.evaluateCondition(r.if, values)
          )) {
            effect.required = false;
          }
          break;
      }
    }

    // Check for validation errors: required + not hidden + missing value
    const errors: Array<{ attributeId: string; message: string }> = [];
    for (const [attrId, effect] of effects) {
      if (effect.required && !effect.hidden) {
        const value = values.get(attrId);
        if (value === null || value === undefined || value === '') {
          errors.push({
            attributeId: attrId,
            message: `Attribute ${attrId} is required by conditional rules but has no value`,
          });
        }
      }
    }

    return { effects, errors };
  }

  /**
   * Evaluate a single condition against the current attribute values.
   */
  private evaluateCondition(condition: RuleCondition, values: AttributeValueMap): boolean {
    const actual = values.get(condition.attributeId);
    const expected = condition.value;

    switch (condition.operator) {
      case 'eq':
        return this.looseEquals(actual, expected);

      case 'neq':
        return !this.looseEquals(actual, expected);

      case 'in':
        if (!Array.isArray(expected)) return false;
        return expected.some(v => this.looseEquals(actual, v));

      case 'not_in':
        if (!Array.isArray(expected)) return true;
        return !expected.some(v => this.looseEquals(actual, v));

      case 'gt':
        return this.toNumber(actual) > this.toNumber(expected);

      case 'lt':
        return this.toNumber(actual) < this.toNumber(expected);

      case 'gte':
        return this.toNumber(actual) >= this.toNumber(expected);

      case 'lte':
        return this.toNumber(actual) <= this.toNumber(expected);

      default:
        return false;
    }
  }

  private looseEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) return false;
    // String comparison for non-strict equality
    return String(a) === String(b);
  }

  private toNumber(v: unknown): number {
    if (typeof v === 'number') return v;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }
}
