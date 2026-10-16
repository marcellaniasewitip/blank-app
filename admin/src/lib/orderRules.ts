import type { AdminOrder, OrderStatus } from '@/api/types';

/** Mirrors backend/src/orders/state-machine.ts for the admin actor, to show only valid actions. */
const ADMIN_CANCELLABLE: OrderStatus[] = ['PENDING_PAYMENT', 'SEARCHING', 'ACCEPTED', 'LOADING', 'EN_ROUTE', 'ARRIVED', 'DISPUTED'];
const RELEASABLE: OrderStatus[] = ['ACCEPTED', 'LOADING'];
const ASSIGNABLE: OrderStatus[] = ['SEARCHING', 'ACCEPTED', 'LOADING'];
export const TERMINAL: OrderStatus[] = ['COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED'];

export const canAdminCancel = (o: Pick<AdminOrder, 'status'>) => ADMIN_CANCELLABLE.includes(o.status);
export const canRelease = (o: Pick<AdminOrder, 'status'>) => RELEASABLE.includes(o.status);
export const canAssign = (o: Pick<AdminOrder, 'status'>) => ASSIGNABLE.includes(o.status);
export const canReassign = (o: Pick<AdminOrder, 'status'>) => canRelease(o) || canAssign(o);
export const canRefund = (o: Pick<AdminOrder, 'paymentStatus' | 'paymentMethod'>) => o.paymentMethod === 'cellmoney' && o.paymentStatus === 'paid';
