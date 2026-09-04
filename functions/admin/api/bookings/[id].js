import { makeItemHandlers } from '../../_lib/crud.js';

export const { onRequestPatch, onRequestDelete } = makeItemHandlers({
  table: 'trial_bookings',
  updatableColumns: ['name', 'email', 'country', 'message', 'start_iso', 'timezone', 'status']
});
