// Data minimisation for the append-only provider logs. delivery_events and processed_events can
// never be updated or deleted (they are audit records), so what is personal is kept out of them when
// they are written, not scrubbed later: an account deletion then leaves nothing in them that names
// or reaches the person. db.js migration 3 applies the same functions to rows written before.
//
//   redactTwilioCallback(params) -> the delivery facts of a status callback (no To, From or address)
//   minimizeStripeEvent(event)   -> the ids, amounts, dates, statuses and billing country of a Stripe
//                                   event (no name, email, phone, address, card or hosted-invoice link)

// Twilio status-callback parameters kept in delivery_events.payload.
export const TWILIO_KEPT_PARAMS = ['MessageSid', 'SmsSid', 'SmsMessageSid', 'MessageStatus', 'SmsStatus', 'ErrorCode', 'ErrorMessage', 'AccountSid', 'MessagingServiceSid', 'ApiVersion', 'RawDlrDoneDate', 'NumSegments', 'Price', 'PriceUnit'];

export function redactTwilioCallback(params) {
  const out = {};
  for (const k of TWILIO_KEPT_PARAMS) if (params?.[k] != null && params[k] !== '') out[k] = String(params[k]).slice(0, 200);
  return out;
}

// Stripe object fields kept (scalars and small structures with no personal data).
const STRIPE_KEPT = [
  'id', 'object', 'client_reference_id', 'mode', 'status', 'payment_status', 'billing_reason', 'collection_method', 'number', 'paid', 'attempt_count',
  'amount', 'amount_paid', 'amount_due', 'amount_remaining', 'amount_total', 'amount_subtotal', 'amount_refunded', 'total', 'subtotal', 'tax', 'total_excluding_tax', 'currency',
  'reason', 'cancel_at_period_end', 'cancel_at', 'canceled_at', 'ended_at', 'current_period_start', 'current_period_end', 'start_date', 'created', 'livemode',
  'status_transitions', 'period_start', 'period_end',
];
// Fields that are ids (or objects when expanded): kept as the id only.
const STRIPE_IDS = ['customer', 'subscription', 'charge', 'payment_intent', 'invoice', 'latest_invoice', 'default_payment_method'];

const idOf = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof v.id === 'string' ? v.id : null);
const scalarOrPlain = (v) => (v == null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)));

export function minimizeStripeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj ?? null;
  const out = {};
  for (const k of STRIPE_KEPT) if (k in obj) out[k] = k === 'status_transitions' ? scalarOrPlain(obj[k]) : typeof obj[k] === 'object' && obj[k] !== null ? null : obj[k];
  for (const k of STRIPE_IDS) if (k in obj) out[k] = idOf(obj[k]);
  if (obj.metadata && typeof obj.metadata === 'object' && obj.metadata.user_id) out.metadata = { user_id: String(obj.metadata.user_id) };
  const parentSub = obj.parent?.subscription_details?.subscription;
  if (parentSub) out.parent = { type: obj.parent.type ?? null, subscription_details: { subscription: idOf(parentSub) } };
  if (Array.isArray(obj.items?.data)) {
    out.items = { data: obj.items.data.map((it) => ({ id: it?.id ?? null, price: { id: it?.price?.id ?? null, lookup_key: it?.price?.lookup_key ?? null, recurring: { interval: it?.price?.recurring?.interval ?? null } } })) };
  }
  // The billing country is tax evidence (VAT place of supply); the rest of the address is not kept.
  const country = obj.customer_details?.address?.country ?? obj.billing_details?.address?.country ?? null;
  if (country) out.billing_country = String(country).slice(0, 2);
  if (obj.automatic_tax && typeof obj.automatic_tax === 'object') out.automatic_tax = { enabled: Boolean(obj.automatic_tax.enabled), status: obj.automatic_tax.status ?? null };
  return out;
}

export function minimizeStripeEvent(event) {
  if (!event || typeof event !== 'object') return event;
  return {
    id: event.id ?? null,
    object: event.object ?? 'event',
    type: event.type ?? null,
    created: event.created ?? null,
    livemode: event.livemode ?? null,
    api_version: event.api_version ?? null,
    data: { object: minimizeStripeObject(event.data?.object) },
    minimized: true,
  };
}
