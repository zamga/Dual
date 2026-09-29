// The live-mode API client (ARCHITECTURE.md §4): JSON in and out, the session cookie, errors as
// { error, message, ...extra } (geofence refusals are 403 with reasons[{code, en, sl}], refused phones
// 422 with reasons). Pure apart from the injectable fetch, so tests run it in Node.

export class ApiError extends Error {
  constructor(status, body = {}) {
    super(body?.message || body?.error || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error ?? (status === 0 ? 'network' : 'http_error');
    this.body = body ?? {};
    this.reasons = Array.isArray(body?.reasons) ? body.reasons : [];
  }
}

// api('/api/me') · api('/api/consent', { method: 'POST', body: {...} }) -> parsed JSON
export async function api(path, { method = 'GET', body, signal, fetchImpl = globalThis.fetch } = {}) {
  const headers = { accept: 'application/json' };
  const init = { method, credentials: 'same-origin', headers, signal };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetchImpl(path, init);
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(0, { error: 'network', message: 'The server did not answer. Check your connection and try again.' });
  }
  let data = null;
  const text = await res.text().catch(() => '');
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 200) };
    }
  }
  if (!res.ok) throw new ApiError(res.status, data ?? {});
  return data ?? {};
}

// The server's messages are English; the codes the member pages meet get both languages here.
// SL: first draft, needs native review.
const CODES = {
  unauthenticated: ['Sign in first.', 'Najprej se prijavite.'],
  invalid_email: ['Enter a valid email address.', 'Vnesite veljaven e-poštni naslov.'],
  geo_required: ['Confirm your country first.', 'Najprej potrdite državo.'],
  consent_required: ['Tick the boxes first.', 'Najprej označite polja.'],
  consent_text_mismatch: ['The consent text you saw is not the current version. Reload the page and review it again.', 'Besedilo soglasja, ki ste ga videli, ni trenutna različica. Znova naložite stran in ga preglejte.'],
  phone_not_verified: ['Verify your mobile number before switching on text alerts.', 'Pred vklopom SMS-obvestil potrdite mobilno številko.'],
  sms_unavailable: ['Text alerts are not available for this number.', 'SMS-obvestila za to številko niso na voljo.'],
  no_pending_verification: ['Request a new code for this number first.', 'Najprej zahtevajte novo kodo za to številko.'],
  code_invalid: ['That code is not right. Check the text message and try again.', 'Koda ni pravilna. Preverite SMS in poskusite znova.'],
  code_expired: ['This code has expired. Request a new one.', 'Koda je potekla. Zahtevajte novo.'],
  invalid_code: ['Enter the code from the text message.', 'Vnesite kodo iz SMS-sporočila.'],
  billing_unavailable: ['Payments are temporarily unavailable. Nothing was charged; try again in a few minutes.', 'Plačila trenutno niso na voljo. Nič ni bilo zaračunano; poskusite čez nekaj minut.'],
  already_subscribed: ['You already have a subscription. Change it from your account.', 'Naročnino že imate. Spremenite jo v računu.'],
  tier_unavailable: ['The Research tier is not open yet.', 'Paket Research še ni odprt.'],
  no_subscription: ['There is no paid subscription to withdraw from.', 'Ni plačane naročnine, od katere bi lahko odstopili.'],
  already_withdrawn: ['You have already withdrawn from this subscription.', 'Od te naročnine ste že odstopili.'],
  withdrawal_window_closed: ['The 14-day withdrawal period has ended. You can still cancel at any time; access continues to the end of the paid period.', 'Rok 14 dni za odstop je potekel. Še vedno lahko kadar koli prekličete; dostop ostane do konca plačanega obdobja.'],
  no_customer: ['There is no billing account yet.', 'Računa za obračun še ni.'],
  delete_failed: ['We could not cancel your subscription with our payment provider, so nothing was deleted. Try again in a few minutes.', 'Naročnine pri ponudniku plačil nismo mogli preklicati, zato ni bilo nič izbrisano. Poskusite čez nekaj minut.'],
  phone_in_use: ['This number is already verified on another Quorum account.', 'Ta številka je že potrjena v drugem računu Quorum.'],
};

// The words to show for an error, in the page's language: the first reason when the server gave one
// (it has both languages), else a known code, else its message, else a plain fallback.
export function errorText(err, locale = 'en') {
  const r = err?.reasons?.[0];
  if (r && (r[locale] || r.en)) return r[locale] || r.en;
  const c = CODES[err?.code];
  if (c) return locale === 'sl' ? c[1] : c[0];
  if (err?.status === 429) return locale === 'sl' ? 'Preveč poskusov. Počakajte nekaj minut in poskusite znova.' : 'Too many attempts. Wait a few minutes and try again.';
  if (err?.status === 0) return locale === 'sl' ? 'Strežnik se ni odzval. Preverite povezavo in poskusite znova.' : 'The server did not answer. Check your connection and try again.';
  if (err?.message) return err.message;
  return locale === 'sl' ? 'Nekaj je šlo narobe. Poskusite znova.' : 'Something went wrong. Try again.';
}
