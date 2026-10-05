import type { ScopeRef } from './identity.js';
export type ReservationState = 'reserved' | 'unknown' | 'settled' | 'released';
export interface ReservationRequest {
 reservationId: string; operationId: string; scope: ScopeRef; actorId: string; payerId: string;
 runId: string; purpose: 'task' | 'maintenance'; allowanceId: string; units: number;
}
export interface Reservation extends ReservationRequest { state: ReservationState; settledUnits: number; receiptId: string | null }
export interface UsageSettlement { reservationId: string; receiptId: string; units: number }
export interface AllowanceView { allowanceId: string; scope: ScopeRef; payerId: string; ceilingUnits: number; reservedUnits: number; settledUnits: number; availableUnits: number }
export interface BudgetPort {
 reserve(request: ReservationRequest): Reservation;
 markUnknown(reservationId: string): Reservation;
 settle(usage: UsageSettlement): Reservation;
 release(reservationId: string): Reservation;
 inspect(allowanceId: string): AllowanceView;
}
export interface RetryBudget { retryKey: string; maxAttempts: number; usedAttempts: number; unknownUsage: boolean }

