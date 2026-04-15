/**
 * Canonical Governance Configuration Schemas
 *
 * This module provides the authoritative configuration schema definitions for governance
 * and risk thresholds across the NunnCorp ecosystem. These types are designed to be
 * independently importable by both NunnPay and Sentinel AI with no external dependencies.
 *
 * @module governance/config
 */

/**
 * Risk threshold configuration for governance actions
 */
export interface RiskThresholds {
  /** Threshold for low risk (0-100 scale) */
  low: number;
  /** Threshold for medium risk (0-100 scale) */
  medium: number;
  /** Threshold for high risk (0-100 scale) */
  high: number;
  /** Threshold for critical risk (0-100 scale) */
  critical: number;
}

/**
 * Approval requirements based on risk level
 */
export interface ApprovalRequirements {
  /** Whether low risk actions require approval */
  lowRiskRequiresApproval: boolean;
  /** Whether medium risk actions require approval */
  mediumRiskRequiresApproval: boolean;
  /** Whether high risk actions require approval */
  highRiskRequiresApproval: boolean;
  /** Whether critical risk actions require approval */
  criticalRiskRequiresApproval: boolean;
  /** Number of approvers required for low risk */
  lowRiskApprovers: number;
  /** Number of approvers required for medium risk */
  mediumRiskApprovers: number;
  /** Number of approvers required for high risk */
  highRiskApprovers: number;
  /** Number of approvers required for critical risk */
  criticalRiskApprovers: number;
}

/**
 * Reputation scoring configuration
 */
export interface ReputationConfig {
  /** Minimum reputation score (typically 0) */
  minScore: number;
  /** Maximum reputation score (typically 100) */
  maxScore: number;
  /** Initial reputation score for new entities */
  initialScore: number;
  /** Reputation penalty for denied actions */
  denialPenalty: number;
  /** Reputation bonus for successful actions */
  successBonus: number;
  /** Reputation decay rate per time period (0-1) */
  decayRate: number;
  /** Time period for decay calculation in seconds */
  decayPeriod: number;
}

/**
 * Action timeout and deadline configuration
 */
export interface TimeoutConfig {
  /** Default timeout for action proposals in seconds */
  proposalTimeout: number;
  /** Default timeout for approval decisions in seconds */
  approvalTimeout: number;
  /** Default timeout for action execution in seconds */
  executionTimeout: number;
  /** Grace period before automatic denial in seconds */
  gracePeriod: number;
}

/**
 * Transaction and amount limits
 */
export interface LimitConfig {
  /** Maximum transaction amount without approval (in smallest units) */
  maxAmountWithoutApproval: string;
  /** Maximum transaction amount for low risk (in smallest units) */
  maxLowRiskAmount: string;
  /** Maximum transaction amount for medium risk (in smallest units) */
  maxMediumRiskAmount: string;
  /** Maximum transaction amount for high risk (in smallest units) */
  maxHighRiskAmount: string;
  /** Daily transaction limit per entity (in smallest units) */
  dailyLimit?: string;
  /** Monthly transaction limit per entity (in smallest units) */
  monthlyLimit?: string;
}

/**
 * Risk factor weights for risk score calculation
 */
export interface RiskFactorWeights {
  /** Weight for transaction amount factor (0-1) */
  amountWeight: number;
  /** Weight for entity reputation factor (0-1) */
  reputationWeight: number;
  /** Weight for velocity/frequency factor (0-1) */
  velocityWeight: number;
  /** Weight for destination/target risk factor (0-1) */
  destinationWeight: number;
  /** Weight for time/timing factor (0-1) */
  timingWeight: number;
}

/**
 * Complete governance configuration
 */
export interface GovernanceConfig {
  /** Risk threshold settings */
  riskThresholds: RiskThresholds;
  /** Approval requirement settings */
  approvalRequirements: ApprovalRequirements;
  /** Reputation system configuration */
  reputationConfig: ReputationConfig;
  /** Timeout and deadline configuration */
  timeoutConfig: TimeoutConfig;
  /** Transaction and amount limits */
  limitConfig: LimitConfig;
  /** Risk factor calculation weights */
  riskFactorWeights: RiskFactorWeights;
  /** Whether governance system is enabled */
  enabled: boolean;
  /** Version of the governance configuration schema */
  version: string;
}

/**
 * Default governance configuration
 * Provides sensible defaults for a moderate security posture
 */
export const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfig = {
  riskThresholds: {
    low: 25,
    medium: 50,
    high: 75,
    critical: 90,
  },
  approvalRequirements: {
    lowRiskRequiresApproval: false,
    mediumRiskRequiresApproval: true,
    highRiskRequiresApproval: true,
    criticalRiskRequiresApproval: true,
    lowRiskApprovers: 0,
    mediumRiskApprovers: 1,
    highRiskApprovers: 2,
    criticalRiskApprovers: 3,
  },
  reputationConfig: {
    minScore: 0,
    maxScore: 100,
    initialScore: 50,
    denialPenalty: 5,
    successBonus: 2,
    decayRate: 0.01,
    decayPeriod: 86400, // 24 hours
  },
  timeoutConfig: {
    proposalTimeout: 3600, // 1 hour
    approvalTimeout: 7200, // 2 hours
    executionTimeout: 1800, // 30 minutes
    gracePeriod: 300, // 5 minutes
  },
  limitConfig: {
    maxAmountWithoutApproval: '1000000000000000000', // 1 token (18 decimals)
    maxLowRiskAmount: '10000000000000000000', // 10 tokens
    maxMediumRiskAmount: '100000000000000000000', // 100 tokens
    maxHighRiskAmount: '1000000000000000000000', // 1000 tokens
    dailyLimit: '10000000000000000000000', // 10000 tokens
    monthlyLimit: '100000000000000000000000', // 100000 tokens
  },
  riskFactorWeights: {
    amountWeight: 0.3,
    reputationWeight: 0.25,
    velocityWeight: 0.2,
    destinationWeight: 0.15,
    timingWeight: 0.1,
  },
  enabled: true,
  version: '1.0.0',
};

/**
 * Validates a governance configuration object
 * @param config - The configuration to validate
 * @returns true if the configuration is valid
 * @throws Error if the configuration is invalid
 */
export function validateGovernanceConfig(config: GovernanceConfig): boolean {
  // Validate risk thresholds are in ascending order
  if (
    config.riskThresholds.low >= config.riskThresholds.medium ||
    config.riskThresholds.medium >= config.riskThresholds.high ||
    config.riskThresholds.high >= config.riskThresholds.critical
  ) {
    throw new Error(
      'Risk thresholds must be in ascending order: low < medium < high < critical'
    );
  }

  // Validate risk thresholds are within 0-100 range
  const thresholds = [
    config.riskThresholds.low,
    config.riskThresholds.medium,
    config.riskThresholds.high,
    config.riskThresholds.critical,
  ];
  if (thresholds.some(t => t < 0 || t > 100)) {
    throw new Error('Risk thresholds must be between 0 and 100');
  }

  // Validate reputation config
  if (config.reputationConfig.minScore >= config.reputationConfig.maxScore) {
    throw new Error('Reputation minScore must be less than maxScore');
  }
  if (
    config.reputationConfig.initialScore < config.reputationConfig.minScore ||
    config.reputationConfig.initialScore > config.reputationConfig.maxScore
  ) {
    throw new Error(
      'Reputation initialScore must be between minScore and maxScore'
    );
  }
  if (
    config.reputationConfig.decayRate < 0 ||
    config.reputationConfig.decayRate > 1
  ) {
    throw new Error('Reputation decayRate must be between 0 and 1');
  }

  // Validate timeouts are positive
  const timeouts = [
    config.timeoutConfig.proposalTimeout,
    config.timeoutConfig.approvalTimeout,
    config.timeoutConfig.executionTimeout,
    config.timeoutConfig.gracePeriod,
  ];
  if (timeouts.some(t => t <= 0)) {
    throw new Error('All timeout values must be positive');
  }

  // Validate risk factor weights sum to approximately 1.0
  const WEIGHT_SUM_TOLERANCE = 0.01;
  const totalWeight =
    config.riskFactorWeights.amountWeight +
    config.riskFactorWeights.reputationWeight +
    config.riskFactorWeights.velocityWeight +
    config.riskFactorWeights.destinationWeight +
    config.riskFactorWeights.timingWeight;
  if (Math.abs(totalWeight - 1.0) > WEIGHT_SUM_TOLERANCE) {
    throw new Error(
      `Risk factor weights must sum to 1.0, but got ${totalWeight.toFixed(3)}`
    );
  }

  // Validate each weight is between 0 and 1
  const weights = Object.values(config.riskFactorWeights);
  if (weights.some(w => w < 0 || w > 1)) {
    throw new Error('Risk factor weights must be between 0 and 1');
  }

  return true;
}

/**
 * Gets the required number of approvers for a given risk level
 * @param config - The governance configuration
 * @param riskLevel - The risk level
 * @returns The number of approvers required
 */
export function getRequiredApprovers(
  config: GovernanceConfig,
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
): number {
  const requirements = config.approvalRequirements;
  switch (riskLevel) {
    case 'low':
      return requirements.lowRiskRequiresApproval
        ? requirements.lowRiskApprovers
        : 0;
    case 'medium':
      return requirements.mediumRiskRequiresApproval
        ? requirements.mediumRiskApprovers
        : 0;
    case 'high':
      return requirements.highRiskRequiresApproval
        ? requirements.highRiskApprovers
        : 0;
    case 'critical':
      return requirements.criticalRiskRequiresApproval
        ? requirements.criticalRiskApprovers
        : 0;
  }
}

/**
 * Determines risk level based on risk score and thresholds
 * @param config - The governance configuration
 * @param riskScore - The calculated risk score (0-100)
 * @returns The corresponding risk level
 */
export function getRiskLevel(
  config: GovernanceConfig,
  riskScore: number
): 'low' | 'medium' | 'high' | 'critical' {
  const thresholds = config.riskThresholds;
  if (riskScore >= thresholds.critical) return 'critical';
  if (riskScore >= thresholds.high) return 'high';
  if (riskScore >= thresholds.medium) return 'medium';
  return 'low';
}
