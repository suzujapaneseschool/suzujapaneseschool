import { makeItemHandlers } from '../../_lib/crud.js';

export const { onRequestPatch, onRequestDelete } = makeItemHandlers({
  table: 'contacts',
  updatableColumns: ['name', 'email', 'level', 'goal', 'message', 'is_plan_inquiry', 'status']
});
