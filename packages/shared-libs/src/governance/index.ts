/**
 * Governance Module
 *
 * Canonical event contracts and configuration schemas for governance and risk management
 * across the NunnCorp ecosystem.
 *
 * This module serves as the authoritative source for:
 * - Governance event type definitions
 * - Risk management configuration schemas
 * - Approval workflow types
 * - Reputation management types
 *
 * These types are designed to be independently importable by both NunnPay and Sentinel AI
 * with no external dependencies beyond TypeScript's standard library.
 *
 * @module governance
 */

// Re-export all event types and utilities
export * from './events';

// Re-export all config types and utilities
export * from './config';
