import { makeListCreate } from '../../_lib/crud.js';

export const { onRequestGet, onRequestPost } = makeListCreate({
  table: 'trial_bookings',
  searchColumns: ['name', 'email', 'country', 'message'],
  sortColumn: 'start_iso',
  sortableColumns: ['name', 'email', 'start_iso', 'status', 'created_at'],
  requiredOnCreate: ['name', 'email', 'start_iso'],
  insertColumns: [
    { col: 'name', default: '' },
    { col: 'email', default: '' },
    { col: 'country', default: '' },
    { col: 'message', default: '' },
    { col: 'start_iso', default: '' },
    { col: 'timezone', default: '' },
    { col: 'cal_booking_uid', default: '' },
    { col: 'status', default: 'booked' }
  ]
});
