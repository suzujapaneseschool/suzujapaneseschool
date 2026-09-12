import { makeItemHandlers } from '../../_lib/crud.js';

export const { onRequestPatch, onRequestDelete } = makeItemHandlers({
  table: 'orders',
  updatableColumns: ['plan_key', 'plan_name', 'amount', 'currency', 'payer_name', 'payer_email', 'status', 'order_id', 'capture_id'],
  touchUpdatedAt: true
});
