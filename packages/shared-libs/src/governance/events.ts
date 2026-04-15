/**
 * Canonical Governance Event Contracts
 *
 * This module provides the authoritative event type definitions for governance
 * and risk management across the NunnCorp ecosystem. These types are designed to be
 * independently importable by both NunnPay and Sentinel AI with no external dependencies.
 *
 * @module governance/events
 */

/**
 * Base event structure for all governance events
 */
export interface BaseGovernanceEvent {
  /** Unique identifier for this event */
  eventId: string;
  /** Timestamp when the event was created (ISO 8601 format) */
  timestamp: string;
  /** ID of the entity that triggered this event */
  initiatorId: string;
  /** Optional metadata for extensibility */
  metadata?: Record<string, unknown>;
}

/**
 * Event emitted when a governance action is proposed
 */
export interface ActionProposedEvent extends BaseGovernanceEvent {
  type: 'ACTION_PROPOSED';
  /** Description of the proposed action */
  actionDescription: string;
  /** Type of action being proposed */
  actionType: string;
  /** Target entity or resource affected by this action */
  targetId: string;
  /** Amount involved in the action (if applicable, in smallest units) */
  amount?: string;
  /** Risk score assigned to this action (0-100) */
  riskScore?: number;
}

/**
 * Event emitted when risk evaluation is completed for an action
 */
export interface RiskEvaluatedEvent extends BaseGovernanceEvent {
  type: 'RISK_EVALUATED';
  /** ID of the action being evaluated */
  actionId: string;
  /** Risk level assessment: low, medium, high, critical */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Numerical risk score (0-100) */
  riskScore: number;
  /** Factors contributing to the risk assessment */
  riskFactors: string[];
  /** Whether the action requires approval based on risk */
  requiresApproval: boolean;
  /** Recommended actions or mitigations */
  recommendations?: string[];
}

/**
 * Event emitted when an action requires approval
 */
export interface ApprovalRequiredEvent extends BaseGovernanceEvent {
  type: 'APPROVAL_REQUIRED';
  /** ID of the action requiring approval */
  actionId: string;
  /** Reason why approval is required */
  reason: string;
  /** Risk level of the action */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** List of approver IDs who can approve this action */
  requiredApprovers: string[];
  /** Deadline for approval (ISO 8601 format) */
  approvalDeadline?: string;
}

/**
 * Event emitted when an action is approved
 */
export interface ApprovedEvent extends BaseGovernanceEvent {
  type: 'APPROVED';
  /** ID of the action that was approved */
  actionId: string;
  /** ID of the approver */
  approverId: string;
  /** Optional comments from the approver */
  comments?: string;
  /** Conditions or restrictions on the approval */
  conditions?: string[];
}

/**
 * Event emitted when an action is denied
 */
export interface DeniedEvent extends BaseGovernanceEvent {
  type: 'DENIED';
  /** ID of the action that was denied */
  actionId: string;
  /** ID of the entity that denied the action */
  denierId: string;
  /** Reason for denial */
  reason: string;
  /** Whether the action can be resubmitted */
  canResubmit: boolean;
}

/**
 * Event emitted when an approved action is executed
 */
export interface ActionExecutedEvent extends BaseGovernanceEvent {
  type: 'ACTION_EXECUTED';
  /** ID of the action that was executed */
  actionId: string;
  /** Execution status */
  status: 'success' | 'failed' | 'partial';
  /** ID of the transaction or operation */
  transactionId?: string;
  /** Result data from the execution */
  result?: Record<string, unknown>;
  /** Error message if execution failed */
  error?: string;
}

/**
 * Event emitted when an entity's reputation score is updated
 */
export interface ReputationUpdatedEvent extends BaseGovernanceEvent {
  type: 'REPUTATION_UPDATED';
  /** ID of the entity whose reputation changed */
  entityId: string;
  /** Previous reputation score */
  previousScore: number;
  /** New reputation score */
  newScore: number;
  /** Reason for the reputation change */
  reason: string;
  /** ID of the action that caused this reputation change */
  relatedActionId?: string;
}

/**
 * Union type of all governance event types
 */
export type GovernanceEvent =
  | ActionProposedEvent
  | RiskEvaluatedEvent
  | ApprovalRequiredEvent
  | ApprovedEvent
  | DeniedEvent
  | ActionExecutedEvent
  | ReputationUpdatedEvent;

/**
 * Type guard to check if an event is an ActionProposedEvent
 */
export function isActionProposedEvent(
  event: GovernanceEvent
): event is ActionProposedEvent {
  return event.type === 'ACTION_PROPOSED';
}

/**
 * Type guard to check if an event is a RiskEvaluatedEvent
 */
export function isRiskEvaluatedEvent(
  event: GovernanceEvent
): event is RiskEvaluatedEvent {
  return event.type === 'RISK_EVALUATED';
}

/**
 * Type guard to check if an event is an ApprovalRequiredEvent
 */
export function isApprovalRequiredEvent(
  event: GovernanceEvent
): event is ApprovalRequiredEvent {
  return event.type === 'APPROVAL_REQUIRED';
}

/**
 * Type guard to check if an event is an ApprovedEvent
 */
export function isApprovedEvent(
  event: GovernanceEvent
): event is ApprovedEvent {
  return event.type === 'APPROVED';
}

/**
 * Type guard to check if an event is a DeniedEvent
 */
export function isDeniedEvent(event: GovernanceEvent): event is DeniedEvent {
  return event.type === 'DENIED';
}

/**
 * Type guard to check if an event is an ActionExecutedEvent
 */
export function isActionExecutedEvent(
  event: GovernanceEvent
): event is ActionExecutedEvent {
  return event.type === 'ACTION_EXECUTED';
}

/**
 * Type guard to check if an event is a ReputationUpdatedEvent
 */
export function isReputationUpdatedEvent(
  event: GovernanceEvent
): event is ReputationUpdatedEvent {
  return event.type === 'REPUTATION_UPDATED';
}
