import { makeBulkHandler } from '../../_lib/crud.js';

export const { onRequestPost } = makeBulkHandler({ table: 'trial_bookings' });
