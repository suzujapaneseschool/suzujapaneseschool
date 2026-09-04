import { makeBulkHandler } from '../../_lib/crud.js';

export const { onRequestPost } = makeBulkHandler({ table: 'orders', touchUpdatedAt: true });
