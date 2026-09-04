// Shared list/search/create/update/delete logic for the three admin
// tables (trial_bookings, contacts, orders). All values are passed as
// bound D1 parameters — never string-concatenated — so search/filter
// input can't be used for SQL injection. Column names come only from the
// fixed config objects below, never from user input.
import { json } from './http.js';

// D1 errors (missing binding, missing table, bad query) would otherwise
// surface as Cloudflare's generic HTML 500 page, which is useless to
// debug from the browser. Every handler funnels through this so the
// admin UI always gets a JSON body with the real error message.
function checkDB(env) {
  if (!env.DB) throw new Error('D1 database is not bound — add a "DB" binding in Pages → Settings → Functions');
}

export function makeListCreate({ table, searchColumns = [], sortColumn = 'created_at', sortableColumns = null, insertColumns = [], requiredOnCreate = [] }) {
  const allowedSort = new Set([sortColumn, ...(sortableColumns || [])]);

  async function onRequestGet(context) {
    const { request, env } = context;
    try {
      checkDB(env);
      const url = new URL(request.url);
      const q = (url.searchParams.get('q') || '').trim();
      const status = url.searchParams.get('status') || '';
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
      const offset = (page - 1) * pageSize;

      // Column name can never come from the request string directly — it
      // must match an entry in the fixed allow-list above, or we fall
      // back to the default sort column.
      const requestedSort = url.searchParams.get('sort') || '';
      const sortBy = allowedSort.has(requestedSort) ? requestedSort : sortColumn;
      const dir = (url.searchParams.get('dir') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      const conditions = [];
      const params = [];
      if (q && searchColumns.length) {
        conditions.push('(' + searchColumns.map(c => `${c} LIKE ?`).join(' OR ') + ')');
        const like = `%${q}%`;
        searchColumns.forEach(() => params.push(like));
      }
      if (status) { conditions.push('status = ?'); params.push(status); }
      if (from) { conditions.push(`${sortColumn} >= ?`); params.push(from); }
      if (to) { conditions.push(`${sortColumn} <= ?`); params.push(to); }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

      const countRow = await env.DB.prepare(`SELECT COUNT(*) as total FROM ${table} ${where}`).bind(...params).first();
      const rows = await env.DB.prepare(
        `SELECT * FROM ${table} ${where} ORDER BY ${sortBy} ${dir} LIMIT ? OFFSET ?`
      ).bind(...params, pageSize, offset).all();

      return json({ items: rows.results, total: countRow.total, page, pageSize, sort: sortBy, dir: dir.toLowerCase() });
    } catch (e) {
      return json({ error: 'server-error', detail: e.message }, 500);
    }
  }

  async function onRequestPost(context) {
    const { request, env } = context;
    try {
      checkDB(env);
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'invalid-body' }, 400); }

      for (const field of requiredOnCreate) {
        if (!body[field]) return json({ error: `missing-${field}` }, 400);
      }

      const cols = insertColumns.map(c => c.col);
      const values = insertColumns.map(c => {
        const v = body[c.col];
        return (v === undefined || v === null || v === '') && v !== 0 ? c.default : v;
      });

      const res = await env.DB.prepare(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      ).bind(...values).run();

      return json({ success: true, id: res.meta.last_row_id });
    } catch (e) {
      return json({ error: 'server-error', detail: e.message }, 500);
    }
  }

  return { onRequestGet, onRequestPost };
}

export function makeItemHandlers({ table, updatableColumns = [], touchUpdatedAt = false }) {
  async function onRequestPatch(context) {
    const { request, env, params } = context;
    try {
      checkDB(env);
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'invalid-body' }, 400); }

      const sets = [];
      const vals = [];
      for (const col of updatableColumns) {
        if (col in body) { sets.push(`${col} = ?`); vals.push(body[col]); }
      }
      if (!sets.length) return json({ error: 'no-fields' }, 400);
      if (touchUpdatedAt) sets.push("updated_at = datetime('now')");
      vals.push(params.id);

      const res = await env.DB.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
      if (!res.meta.changes) return json({ error: 'not-found' }, 404);
      return json({ success: true });
    } catch (e) {
      return json({ error: 'server-error', detail: e.message }, 500);
    }
  }

  async function onRequestDelete(context) {
    const { env, params } = context;
    try {
      checkDB(env);
      const res = await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(params.id).run();
      if (!res.meta.changes) return json({ error: 'not-found' }, 404);
      return json({ success: true });
    } catch (e) {
      return json({ error: 'server-error', detail: e.message }, 500);
    }
  }

  return { onRequestPatch, onRequestDelete };
}

// Powers the "select rows → delete / change status" bulk toolbar. `ids`
// is always bound as individual placeholders (never interpolated), and
// `status` is only ever written via a bound parameter too — the only
// unchecked input is the ids' *count*, which just changes how many `?`
// placeholders are generated.
export function makeBulkHandler({ table, statusColumn = 'status', touchUpdatedAt = false }) {
  async function onRequestPost(context) {
    const { request, env } = context;
    try {
      checkDB(env);
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'invalid-body' }, 400); }

      const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(n => Number.isInteger(n)) : [];
      if (!ids.length) return json({ error: 'missing-ids' }, 400);
      if (ids.length > 200) return json({ error: 'too-many-ids' }, 400);

      const placeholders = ids.map(() => '?').join(', ');

      if (body.action === 'delete') {
        const res = await env.DB.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).bind(...ids).run();
        return json({ success: true, changed: res.meta.changes });
      }

      if (body.action === 'status') {
        if (!body.status) return json({ error: 'missing-status' }, 400);
        const touch = touchUpdatedAt ? ", updated_at = datetime('now')" : '';
        const res = await env.DB.prepare(
          `UPDATE ${table} SET ${statusColumn} = ?${touch} WHERE id IN (${placeholders})`
        ).bind(body.status, ...ids).run();
        return json({ success: true, changed: res.meta.changes });
      }

      return json({ error: 'invalid-action' }, 400);
    } catch (e) {
      return json({ error: 'server-error', detail: e.message }, 500);
    }
  }

  return { onRequestPost };
}
