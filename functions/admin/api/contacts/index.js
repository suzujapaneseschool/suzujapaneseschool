import { makeListCreate } from '../../_lib/crud.js';

export const { onRequestGet, onRequestPost } = makeListCreate({
  table: 'contacts',
  searchColumns: ['name', 'email', 'goal', 'message'],
  sortColumn: 'created_at',
  sortableColumns: ['name', 'email', 'status', 'created_at'],
  requiredOnCreate: ['name', 'email'],
  insertColumns: [
    { col: 'name', default: '' },
    { col: 'email', default: '' },
    { col: 'level', default: '' },
    { col: 'goal', default: '' },
    { col: 'message', default: '' },
    { col: 'is_plan_inquiry', default: 0 },
    { col: 'status', default: 'new' }
  ]
});
