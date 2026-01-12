'use strict';

const core = require('./core.js');
const auth = require('./auth.js');
const supa = require('./supabase.js');

function publicErr(code, message) {
  const c = String(code || 'ERROR').trim() || 'ERROR';
  const msg = String(message || '').trim() || 'Ocorreu um erro.';
  return { ok: false, code: c, error_code: c, message: msg, error: msg };
}

function extractAuthErrText(data) {
  if (!data) return '';
  const t =
    (typeof data.error_description === 'string' && data.error_description) ||
    (typeof data.msg === 'string' && data.msg) ||
    (typeof data.message === 'string' && data.message) ||
    (data.error && typeof data.error === 'string' && data.error) ||
    (data.error && typeof data.error.message === 'string' && data.error.message) ||
    '';
  return String(t || '').trim();
}

function looksLikeEmailNotConfirmed(msg) {
  const m = String(msg || '').toLowerCase();
  return (
    (m.includes('not confirmed') && m.includes('email')) ||
    m.includes('email not confirmed') ||
    m.includes('confirm your email')
  );
}

function normalizeSlug(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    return core.slugifyLoose(raw);
  } catch {
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

async function adminDeleteUserBestEffort(userId) {
  try {
    await supa.supabaseFetchAdmin(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  } catch {}
}

async function ensureClientProvisioned(accessToken, userId, fallbackCompanyName) {
  let memRows = null;
  try {
    memRows = await supa.restSelectListUser(
      accessToken,
      'ncs_memberships',
      `user_id=eq.${encodeURIComponent(userId)}&select=id,company_id,role,is_active&limit=1`
    );
  } catch {
    return { ok: true, skipped: true, reason: 'membership_lookup_failed' };
  }

  if (Array.isArray(memRows) && memRows.length > 0) {
    return { ok: true, skipped: true, reason: 'already_has_membership' };
  }

  const companyName = String(fallbackCompanyName || '').trim();
  if (!companyName) {
    return { ok: false, code: 'ONBOARDING_MISSING_COMPANY_NAME', message: 'Cadastro incompleto: company_name ausente.' };
  }

  let slug = normalizeSlug(companyName);
  let companyRow = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rows = await supa.restSelectListUser(
        accessToken,
        'ncs_companies',
        `slug=eq.${encodeURIComponent(slug)}&select=id,slug,name`
      );
      if (Array.isArray(rows) && rows.length > 0) {
        if (attempt >= 2) return { ok: false, code: 'COMPANY_SLUG_TAKEN', message: 'Slug de empresa já em uso.' };
        slug = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
        continue;
      }
    } catch {}

    const up = await supa.restUpsertUser(accessToken, 'ncs_companies', { name: companyName, slug }, { onConflict: 'slug' });
    if (!up.ok) return { ok: false, code: 'DB', message: 'Falha ao criar empresa.' };
    companyRow = up.row;
    break;
  }

  if (!companyRow) return { ok: false, code: 'DB', message: 'Falha ao criar empresa.' };

  const mem = await supa.restUpsertUser(
    accessToken,
    'ncs_memberships',
    { user_id: userId, company_id: companyRow.id, role: 'client', is_active: true },
    { onConflict: 'company_id,user_id,role' }
  );
  if (!mem.ok) return { ok: false, code: 'DB', message: 'Falha ao criar membership.' };

  return { ok: true, company: { id: companyRow.id, slug: companyRow.slug, name: companyRow.name } };
}

async function provisionClient({ hasSrv, accessToken, userId, companyName, providedSlug }) {
  const canUseUser = !!String(accessToken || '').trim();
  if (!hasSrv && !canUseUser) {
    const e = new Error('missing_credentials');
    e.code = 'MISSING_CREDENTIALS';
    throw e;
  }

  const fetchDb = async (path, opts = {}) => {
    if (hasSrv) return supa.supabaseFetchAdmin(path, opts);
    return supa.supabaseFetchUser(accessToken, path, opts);
  };

  // 1) Tenta RPC (se houver) quando há service role
  if (hasSrv) {
    const rpc = await fetchDb('/rest/v1/rpc/ncs_provision_client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        p_user_id: userId,
        p_company_name: companyName,
        p_company_slug: providedSlug || null,
      },
    });

    if (rpc.ok) {
      const rows = Array.isArray(rpc.data) ? rpc.data : rpc.data ? [rpc.data] : [];
      const row = rows[0] || {};
      const cid = String(row.company_id || '').trim();
      const cslug = String(row.company_slug || '').trim();
      const cname = String(row.company_name || companyName || '').trim();
      if (cid && cslug) return { id: cid, slug: cslug, name: cname };
      const e = new Error('rpc_incomplete');
      e.code = 'RPC_INCOMPLETE';
      throw e;
    }

    if (Number(rpc.status || 0) !== 404) {
      const e = new Error(extractAuthErrText(rpc.data) || 'rpc_failed');
      e.code = 'RPC_FAILED';
      throw e;
    }
  }

  // 2) Fallback direto via PostgREST
  const slug = String(providedSlug || '').trim();

  if (slug) {
    const lookup = await fetchDb(
      `/rest/v1/ncs_companies?slug=eq.${encodeURIComponent(slug)}&select=id,slug,name&limit=1`,
      { method: 'GET' }
    );
    const rows = Array.isArray(lookup.data) ? lookup.data : lookup.data ? [lookup.data] : [];
    if (!lookup.ok || rows.length === 0) {
      const e = new Error('company_not_found');
      e.code = 'COMPANY_NOT_FOUND';
      throw e;
    }

    const row = rows[0];
    const company = { id: String(row.id), slug: String(row.slug), name: String(row.name || '') };

    const memRes = await fetchDb('/rest/v1/ncs_memberships?on_conflict=company_id,user_id,role', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: [{ company_id: company.id, user_id: userId, role: 'client', is_active: true }],
    });
    if (!memRes.ok) {
      const e = new Error('membership_insert_failed');
      e.code = 'MEMBERSHIP_INSERT_FAILED';
      throw e;
    }

    return company;
  }

  const baseSlug = normalizeSlug(companyName);
  let candidate = baseSlug || `empresa-${Math.random().toString(36).substring(2, 8)}`;

  for (let attempt = 1; attempt <= 12; attempt++) {
    const check = await fetchDb(`/rest/v1/ncs_companies?slug=eq.${encodeURIComponent(candidate)}&select=id&limit=1`, {
      method: 'GET',
    });
    if (!check.ok) {
      const e = new Error('company_slug_check_failed');
      e.code = 'COMPANY_SLUG_CHECK_FAILED';
      throw e;
    }

    const exists = Array.isArray(check.data) ? check.data : check.data ? [check.data] : [];
    if (exists.length === 0) break;

    candidate = attempt <= 5 ? `${baseSlug}-${attempt + 1}` : `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
  }

  const insert = await fetchDb('/rest/v1/ncs_companies', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: [{ name: companyName, slug: candidate, created_by: userId }],
  });
  if (!insert.ok) {
    const e = new Error('company_insert_failed');
    e.code = 'COMPANY_INSERT_FAILED';
    throw e;
  }

  const inserted = Array.isArray(insert.data) ? insert.data[0] : insert.data;
  const company = { id: String(inserted.id), slug: String(inserted.slug), name: String(inserted.name || '') };

  const mem = await fetchDb('/rest/v1/ncs_memberships?on_conflict=company_id,user_id,role', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: [{ company_id: company.id, user_id: userId, role: 'client', is_active: true }],
  });
  if (!mem.ok) {
    const e = new Error('membership_insert_failed');
    e.code = 'MEMBERSHIP_INSERT_FAILED';
    throw e;
  }

  return company;
}

exports.handle = async function handle(event, segments) {
  const method = core.normalizeMethod(event.httpMethod);
  const action = String(segments[1] || '').trim();

  const hasUrl = !!String(process.env.SUPABASE_URL || '').trim();
  const hasAnon = !!String(process.env.SUPABASE_ANON_KEY || '').trim();
  const hasSrv = !!String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!hasUrl || (!hasAnon && !hasSrv)) {
    return core.json(
      event,
      503,
      publicErr('CONFIG', 'Supabase não configurado. Configure SUPABASE_URL e uma chave (ANON ou SERVICE ROLE).')
    );
  }
  if (core.isRlsEnabled() && !hasAnon) {
    return core.json(event, 503, publicErr('CONFIG', 'SUPABASE_ANON_KEY é obrigatória quando NCS_USE_RLS=1.'));
  }

  if (action === 'login') {
    if (method !== 'POST') return core.json(event, 405, publicErr('METHOD_NOT_ALLOWED', 'Use POST.'));

    const body = core.parseJsonBody(event) || {};
    const email = String(body.email || '').trim();
    const password = String(body.password || '');

    if (!email || !password) return core.json(event, 400, publicErr('BAD_REQUEST', 'Informe email e senha.'));
    if (!core.allowLoginAttempt(event, email)) {
      return core.json(event, 429, publicErr('RATE_LIMIT', 'Muitas tentativas. Tente novamente em instantes.'));
    }

    const r = await supa.supabaseFetchAuth('/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email, password },
    });

    if (!r.ok) {
      const status = r.status || 500;
      const msg = extractAuthErrText(r.data);
      if (looksLikeEmailNotConfirmed(msg)) {
        return core.json(
          event,
          403,
          publicErr(
            'AUTH_EMAIL_NOT_CONFIRMED',
            'Seu email ainda não foi confirmado. Verifique sua caixa de entrada e clique no link de confirmação.'
          )
        );
      }
      return core.json(
        event,
        status,
        publicErr(
          status === 401 || status === 400 ? 'AUTH_INVALID_CREDENTIALS' : 'AUTH_BACKEND_ERROR',
          status === 401 || status === 400 ? 'Credenciais inválidas.' : 'Falha ao autenticar.'
        )
      );
    }

    const accessToken = String(r.data?.access_token || '').trim();
    const refreshToken = String(r.data?.refresh_token || '').trim();
    const expiresIn = Number(r.data?.expires_in || 0) || 0;
    const userId = String(r.data?.user?.id || '').trim();
    const userEmail = String(r.data?.user?.email || email).trim();

    if (!accessToken || !refreshToken || !userId) return core.json(event, 500, publicErr('AUTH_BACKEND_ERROR', 'Falha ao autenticar.'));

    const rolesInfo = await auth.getUserRoles(userId, accessToken);
    let role = rolesInfo.isAdmin ? 'admin' : rolesInfo.roles.includes('auditor') ? 'auditor' : 'client';

    if (role === 'client') {
      const inferred = core.inferRoleFromAllowlist(userEmail);
      if (inferred) {
        role = inferred;
        if (!rolesInfo.roles.includes(inferred)) rolesInfo.roles.push(inferred);
      }
    }

    let company = null;
    if (role === 'client') {
      const meta = r.data?.user?.user_metadata || {};
      const metaCompanyName = String(meta.company_name || meta.companyName || '').trim();
      const prov = await ensureClientProvisioned(accessToken, userId, metaCompanyName);
      if (prov?.company) company = prov.company;

      if (prov && prov.ok === false) {
        const payloadWarn = {
          ok: true,
          user: { id: userId, email: userEmail },
          role,
          roles: rolesInfo.roles,
          expires_in: expiresIn,
          warning: { code: prov.code || 'ONBOARDING_FAILED', message: prov.message || 'Falha ao provisionar no login.' },
        };
        if (company) payloadWarn.company = company;

        return core.json(
          event,
          200,
          payloadWarn,
          {},
          [core.buildAccessCookie(event, accessToken, expiresIn), core.buildRefreshCookie(event, refreshToken)]
        );
      }
    }

    const payload = { ok: true, user: { id: userId, email: userEmail }, role, roles: rolesInfo.roles, expires_in: expiresIn };
    if (company) payload.company = company;

    return core.json(
      event,
      200,
      payload,
      {},
      [core.buildAccessCookie(event, accessToken, expiresIn), core.buildRefreshCookie(event, refreshToken)]
    );
  }

  if (action === 'register') {
    if (method !== 'POST') return core.json(event, 405, publicErr('METHOD_NOT_ALLOWED', 'Use POST.'));

    const body = core.parseJsonBody(event) || {};
    const companyName = String(body.company_name || body.companyName || '').trim();
    const rawSlug = String(body.company_slug || body.companySlug || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const acceptPlatform = body.accept_terms_platform === true || body.acceptTermsPlatform === true;
    const acceptProcess = body.accept_terms_process === true || body.acceptTermsProcess === true;

    if (!acceptPlatform || !acceptProcess) return core.json(event, 400, publicErr('TERMS_REQUIRED', 'É necessário aceitar os termos.'));
    if (!email || !password) return core.json(event, 400, publicErr('BAD_REQUEST', 'Informe email e senha.'));
    if (!rawSlug && !companyName) return core.json(event, 400, publicErr('BAD_REQUEST', 'Informe o nome da empresa.'));

    const providedSlug = normalizeSlug(rawSlug);

    const signup = await supa.supabaseFetchAuth('/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        email,
        password,
        data: {
          company_name: companyName,
          company_slug: providedSlug || null,
          accept_terms_platform: true,
          accept_terms_process: true,
        },
      },
    });

    if (!signup.ok) {
      const status = signup.status || 400;
      const msg = extractAuthErrText(signup.data) || 'Falha ao cadastrar usuário.';
      return core.json(event, status, publicErr(status === 400 ? 'AUTH_SIGNUP_FAILED' : 'AUTH_BACKEND_ERROR', msg));
    }

    const sUser = signup.data?.user || null;
    const sSession = signup.data?.session || null;
    const userId = String(sUser?.id || '').trim();
    const userEmail = String(sUser?.email || email).trim();

    if (!userId) return core.json(event, 500, publicErr('AUTH_BACKEND_ERROR', 'Falha ao cadastrar usuário.'));

    const accessToken = String(sSession?.access_token || '').trim();
    const refreshToken = String(sSession?.refresh_token || '').trim();
    const expiresIn = Number(sSession?.expires_in || 0) || 0;

    if (!hasSrv && !accessToken) {
      return core.json(
        event,
        503,
        publicErr('CONFIG', 'Cadastro requer SUPABASE_SERVICE_ROLE_KEY quando não há sessão imediata (email com confirmação).')
      );
    }

    let companyOut = null;
    try {
      companyOut = await provisionClient({
        hasSrv,
        accessToken,
        userId,
        companyName: companyName || null,
        providedSlug: providedSlug || null,
      });
    } catch (e) {
      if (hasSrv) await adminDeleteUserBestEffort(userId);

      const code = String(e?.code || '').toUpperCase();
      if (code === 'COMPANY_NOT_FOUND') return core.json(event, 404, publicErr('COMPANY_NOT_FOUND', 'Empresa não encontrada.'));
      return core.json(event, 500, publicErr('DB', 'Falha ao criar empresa ou vínculo de usuário.'));
    }

    if (!accessToken || !refreshToken) {
      return core.json(event, 200, {
        ok: true,
        user: { id: userId, email: userEmail },
        company: companyOut ? { id: companyOut.id, slug: companyOut.slug, name: companyOut.name } : null,
        role: 'client',
        session: 'pending',
      });
    }

    return core.json(
      event,
      200,
      {
        ok: true,
        user: { id: userId, email: userEmail },
        company: companyOut ? { id: companyOut.id, slug: companyOut.slug, name: companyOut.name } : null,
        role: 'client',
      },
      {},
      [core.buildAccessCookie(event, accessToken, expiresIn), core.buildRefreshCookie(event, refreshToken)]
    );
  }

  if (action === 'me') {
    if (method !== 'GET' && method !== 'HEAD') return core.json(event, 405, publicErr('METHOD_NOT_ALLOWED', 'Use GET.'));
    const prod = core.isProdContext();
    const sess = await auth.resolveAuthSession(event, { allowBearer: !prod });
    if (!sess.ok) return core.json(event, 401, publicErr('AUTH_REQUIRED', 'Sessão obrigatória.'));

    const rolesInfo = await auth.getUserRoles(sess.user.id, sess.token);
    let role = rolesInfo.isAdmin ? 'admin' : rolesInfo.roles.includes('auditor') ? 'auditor' : 'client';

    if (role === 'client') {
      const inferred = core.inferRoleFromAllowlist(sess.user.email);
      if (inferred) {
        role = inferred;
        if (!rolesInfo.roles.includes(inferred)) rolesInfo.roles.push(inferred);
      }
    }

    const res = core.json(event, 200, { ok: true, user: sess.user, role, roles: rolesInfo.roles });
    return method === 'HEAD' ? Object.assign({}, res, { body: '' }) : res;
  }

  if (action === 'logout') {
    if (method !== 'POST') return core.json(event, 405, publicErr('METHOD_NOT_ALLOWED', 'Use POST.'));
    try {
      const at = core.getCookie(event, core.ACCESS_COOKIE_NAME);
      const rt = core.getCookie(event, core.REFRESH_COOKIE_NAME);
      let token = String(at || '').trim();

      if (!token && rt) {
        const rr = await auth.refreshAccessToken(event, rt);
        if (rr.ok && rr.accessToken) token = rr.accessToken;
      }

      if (token) {
        await supa.supabaseFetchAuth('/auth/v1/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      }
    } catch {}

    return core.json(event, 200, { ok: true }, {}, core.clearAuthCookies(event));
  }

  return core.json(event, 404, publicErr('NOT_FOUND', 'Rota não encontrada.'));
};
