import { makeListCreate } from '../../_lib/crud.js';

export const { onRequestGet, onRequestPost } = makeListCreate({
  table: 'orders',
  searchColumns: ['order_id', 'capture_id', 'plan_name', 'payer_name', 'payer_email'],
  sortColumn: 'created_at',
  sortableColumns: ['payer_name', 'payer_email', 'amount', 'status', 'created_at'],
  requiredOnCreate: ['payer_name', 'payer_email'],
  insertColumns: [
    { col: 'order_id', default: null },
    { col: 'capture_id', default: null },
    { col: 'plan_key', default: '' },
    { col: 'plan_name', default: '' },
    { col: 'amount', default: '' },
    { col: 'currency', default: 'JPY' },
    { col: 'payer_name', default: '' },
    { col: 'payer_email', default: '' },
    { col: 'status', default: 'pending' }
  ]
});
