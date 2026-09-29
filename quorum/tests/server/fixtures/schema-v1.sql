-- Quorum schema (node:sqlite). The tables of docs/BRIEF.md §4.5 plus ledger_entries and a few
-- server tables (sessions, magic_links, geo_checks, checkout_sessions, settings).
-- Timestamps are ISO-8601 UTC strings ('2026-09-28T12:00:00.000Z') unless a column says otherwise.
-- Append-only tables carry BEFORE UPDATE / BEFORE DELETE triggers at the end of this file.

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,               -- e.g. 'sms_paused'
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- identity
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                -- 'usr_' + 16 base62; also Stripe client_reference_id
  email TEXT UNIQUE,                  -- NULL once the account is deleted (anonymised)
  email_verified_at TEXT,
  declared_country TEXT,
  ip_country TEXT,
  jurisdiction TEXT,                  -- the agreed country once the geofence passes
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'sl')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'geo_ok', 'geo_blocked', 'deleted')),
  blocked_reason TEXT,
  stripe_customer_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS magic_links (
  token_sha256 TEXT PRIMARY KEY,      -- only the hash is stored
  user_id TEXT NOT NULL REFERENCES users(id),
  locale TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  ip TEXT
);

CREATE TABLE IF NOT EXISTS geo_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  stage TEXT NOT NULL CHECK (stage IN ('join', 'phone', 'card')),
  ip_country TEXT,
  declared_country TEXT,
  phone_country TEXT,
  card_country TEXT,
  ok INTEGER NOT NULL,
  reasons_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS geo_checks_user ON geo_checks(user_id);

CREATE TABLE IF NOT EXISTS phone_numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  e164 TEXT NOT NULL,
  country TEXT,
  line_type TEXT,
  pumping_risk TEXT,                  -- Lookup v2 carrier_risk_category (low/mild/moderate/high)
  pumping_score INTEGER,              -- Lookup v2 sms_pumping_risk_score (0-100)
  verify_sid TEXT,
  verified_at TEXT,
  invalid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS phone_numbers_e164 ON phone_numbers(e164);

CREATE TABLE IF NOT EXISTS consent_events (          -- append-only; kept at least 5 years
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('sms', 'terms', 'immediate_performance', 'email_mkt')),
  action TEXT NOT NULL CHECK (action IN ('grant', 'revoke')),
  text_version TEXT,
  text_sha256 TEXT,
  ip TEXT,
  user_agent TEXT,
  page_url TEXT,
  locale TEXT,
  channel TEXT NOT NULL,              -- web, account, sms_link, support, twilio
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS consent_events_user ON consent_events(user_id, kind, id);

CREATE TABLE IF NOT EXISTS channel_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  sms INTEGER NOT NULL DEFAULT 0,
  push INTEGER NOT NULL DEFAULT 1,
  email INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
  token TEXT PRIMARY KEY CHECK (length(token) >= 6),   -- base62, at least 6 characters
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),   -- one token per user
  created_at TEXT NOT NULL,
  used_at TEXT
);

-- ---------------------------------------------------------------- billing
CREATE TABLE IF NOT EXISTS checkout_sessions (
  id TEXT PRIMARY KEY,                -- Stripe cs_...
  user_id TEXT NOT NULL REFERENCES users(id),
  tier TEXT NOT NULL,
  interval TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('signal', 'research')),
  interval TEXT,
  status TEXT NOT NULL,               -- Stripe status: incomplete, active, past_due, unpaid, canceled, ...
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  canceled_at TEXT,
  ended_at TEXT,
  first_paid_at TEXT,                 -- set by the first invoice.paid; no entitlement before it
  first_invoice_id TEXT,
  first_amount_paid INTEGER,
  currency TEXT,
  payment_failed_at TEXT,             -- first failure of the current dunning run
  disputed_at TEXT,
  withdrawn_at TEXT,
  billing_country TEXT,
  geo_mismatch_at TEXT,
  geo_refund_id TEXT,                 -- refund issued because of a card-country mismatch
  last_event_id TEXT,
  last_event_created INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS subscriptions_user ON subscriptions(user_id);

CREATE TABLE IF NOT EXISTS entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  feature TEXT NOT NULL CHECK (feature IN ('picks', 'research_data')),
  active_until TEXT,                  -- entitled while active_until > now
  source TEXT NOT NULL,               -- 'stripe:sub_...', 'withdrawal', 'dispute', 'deleted'
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, feature)
);

CREATE TABLE IF NOT EXISTS processed_events (         -- append-only
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  type TEXT,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE (provider, event_id)
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  requested_at TEXT NOT NULL,
  refund_id TEXT,
  refund_amount INTEGER,
  currency TEXT,
  full_refund INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('requested', 'refunded', 'completed', 'failed')),
  error TEXT,
  completed_at TEXT,
  ip TEXT,
  user_agent TEXT
);

-- ---------------------------------------------------------------- market
CREATE TABLE IF NOT EXISTS instruments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  figi TEXT UNIQUE,
  isin TEXT,
  cik TEXT,
  permaticker TEXT,
  name TEXT,
  sector TEXT,
  venue TEXT,
  simulated INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ticker_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  ticker TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT
);

CREATE TABLE IF NOT EXISTS universe_snapshots (
  date TEXT NOT NULL,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  price REAL,
  mcap REAL,
  adv60 REAL,
  eligible INTEGER NOT NULL,
  reason TEXT,
  PRIMARY KEY (date, instrument_id)
);

CREATE TABLE IF NOT EXISTS consensus_snapshots (
  date TEXT NOT NULL,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  fiscal_period TEXT NOT NULL,
  eps_mean REAL,
  n_est INTEGER,
  n_up INTEGER,
  n_down INTEGER,
  source TEXT,
  PRIMARY KEY (date, instrument_id, fiscal_period)
);

-- ---------------------------------------------------------------- engine
CREATE TABLE IF NOT EXISTS model_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                 -- 'ensemble 1.0.0'
  git_sha TEXT,
  params_hash TEXT,
  training_cutoff TEXT,
  validation_report TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS methodology_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  effective TEXT NOT NULL,
  change_summary_en TEXT,
  change_summary_sl TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_json TEXT NOT NULL,
  cv_metrics_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signal_scores (
  date TEXT NOT NULL,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  family TEXT NOT NULL CHECK (family IN ('A', 'B', 'C', 'D')),
  score REAL,
  pct_rank REAL,
  model_version_id INTEGER REFERENCES model_versions(id),
  PRIMARY KEY (date, instrument_id, family)
);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  families_in_top_decile TEXT NOT NULL,   -- JSON array
  combined_score REAL,
  status TEXT NOT NULL CHECK (status IN ('candidate', 'issued', 'vetoed_rule', 'vetoed_llm', 'vetoed_human', 'capped', 'no_approver')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS candidates_date ON candidates(date);

CREATE TABLE IF NOT EXISTS vetoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER REFERENCES candidates(id),
  type TEXT NOT NULL,                 -- days_to_cover, idio_vol, earnings_within_3d, pending_ma, llm_48h, human
  detail TEXT,
  person_id INTEGER,
  created_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- ledger
CREATE TABLE IF NOT EXISTS persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE,              -- 'p1' in the data contract
  full_name TEXT NOT NULL,
  job_title TEXT,
  role TEXT,                          -- approver, deputy, model_lead
  fictional INTEGER NOT NULL DEFAULT 1,
  active_from TEXT,
  active_to TEXT
);

CREATE TABLE IF NOT EXISTS issues (
  issue_date TEXT PRIMARY KEY,
  issue_no INTEGER UNIQUE,
  published_at TEXT,
  has_pick INTEGER NOT NULL DEFAULT 0,
  n_scored INTEGER,
  closest_agreement INTEGER
);

CREATE TABLE IF NOT EXISTS explanations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'sl')),
  text TEXT NOT NULL,
  source_numbers_json TEXT,
  validator_passed INTEGER NOT NULL DEFAULT 0,
  llm_model TEXT,
  prompt_sha256 TEXT,
  output_sha256 TEXT,
  approved_by INTEGER REFERENCES persons(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recommendations (          -- INSERT only (append-only)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_no TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('BUY', 'CLOSE', 'RENEW', 'CORRECTION')),
  instrument_id INTEGER REFERENCES instruments(id),
  prior_rec_id INTEGER REFERENCES recommendations(id),
  horizon INTEGER NOT NULL DEFAULT 21,
  planned_exit_date TEXT,
  families_json TEXT,
  model_version_ids TEXT,
  methodology_version_id INTEGER REFERENCES methodology_versions(id),
  explanation_id INTEGER REFERENCES explanations(id),
  responsible_person_ids TEXT,
  conflicts_snapshot TEXT,
  dissemination_price REAL,
  price_source TEXT,
  price_at TEXT,
  production_completed_at TEXT,
  disseminated_at TEXT,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  prev_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (public_no, kind)
);

CREATE TABLE IF NOT EXISTS ledger_entries (           -- append-only; core/ledger.js entry shape
  seq INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('METHODOLOGY', 'ISSUE', 'BUY', 'RENEW', 'CLOSE', 'CORRECTION')),
  issue_date TEXT NOT NULL,
  at TEXT NOT NULL,
  body_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rec_id INTEGER NOT NULL REFERENCES recommendations(id),
  kind TEXT NOT NULL CHECK (kind IN ('dissemination', 'entry_open', 'exit_open', 'close')),
  date TEXT NOT NULL,
  price REAL NOT NULL,
  fx_eurusd REAL,
  source TEXT NOT NULL,
  at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outcomes (
  rec_id INTEGER PRIMARY KEY REFERENCES recommendations(id),
  gross REAL,
  net REAL,
  benchmark REAL,
  excess REAL,
  alert_gap_bps REAL,
  eur_return REAL,
  d5 REAL,
  d63 REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_anchors (
  date TEXT PRIMARY KEY,
  merkle_root TEXT NOT NULL,
  ots_proof TEXT,
  rfc3161_token TEXT,
  row_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- messaging
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idem_key TEXT NOT NULL UNIQUE,      -- 'rec_id:user_id:channel' for picks; 'OPT_IN:user:grant' etc. for system texts
  rec_id INTEGER REFERENCES recommendations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'push')),
  kind TEXT NOT NULL,                 -- BUY, CLOSE, RENEW, OPT_IN, OPT_OUT, WELCOME, DUNNING, ...
  to_addr TEXT,                       -- scrubbed on account deletion
  subject TEXT,
  body TEXT,                          -- scrubbed on account deletion
  body_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'cancelled')),
  provider_sid TEXT,
  error_code TEXT,
  not_before TEXT,                    -- quiet hours: not sent before this instant
  attempts INTEGER NOT NULL DEFAULT 0,
  queued_at TEXT NOT NULL,
  sent_at TEXT,
  delivered_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (rec_id, user_id, channel)
);
CREATE INDEX IF NOT EXISTS notifications_status ON notifications(status, not_before);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_sid ON notifications(provider_sid);

CREATE TABLE IF NOT EXISTS delivery_events (          -- append-only raw status callbacks
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_sid TEXT,
  status TEXT,
  error_code TEXT,
  payload TEXT NOT NULL,              -- the phone number is replaced by its SHA-256
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS delivery_events_sid ON delivery_events(provider_sid);

CREATE TABLE IF NOT EXISTS opt_outs (                 -- append-only
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'push', 'email')),
  source TEXT NOT NULL CHECK (source IN ('link', 'account', 'support', 'twilio', 'deletion')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS opt_outs_user ON opt_outs(user_id, channel, id);

-- ---------------------------------------------------------------- compliance
CREATE TABLE IF NOT EXISTS access_log (               -- append-only
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_trade_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER REFERENCES persons(id),
  instrument TEXT NOT NULL,
  side TEXT NOT NULL,
  decision TEXT,
  decided_by INTEGER REFERENCES persons(id),
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS disclosure_texts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  version TEXT NOT NULL,
  locale TEXT NOT NULL,
  text TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (kind, version, locale)
);

-- ---------------------------------------------------------------- append-only enforcement
CREATE TRIGGER IF NOT EXISTS consent_events_no_update BEFORE UPDATE ON consent_events BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER IF NOT EXISTS consent_events_no_delete BEFORE DELETE ON consent_events BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER IF NOT EXISTS recommendations_no_update BEFORE UPDATE ON recommendations BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER IF NOT EXISTS recommendations_no_delete BEFORE DELETE ON recommendations BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER IF NOT EXISTS ledger_entries_no_update BEFORE UPDATE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER IF NOT EXISTS ledger_entries_no_delete BEFORE DELETE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER IF NOT EXISTS processed_events_no_update BEFORE UPDATE ON processed_events BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER IF NOT EXISTS processed_events_no_delete BEFORE DELETE ON processed_events BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER IF NOT EXISTS delivery_events_no_update BEFORE UPDATE ON delivery_events BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER IF NOT EXISTS delivery_events_no_delete BEFORE DELETE ON delivery_events BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER IF NOT EXISTS opt_outs_no_update BEFORE UPDATE ON opt_outs BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER IF NOT EXISTS opt_outs_no_delete BEFORE DELETE ON opt_outs BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER IF NOT EXISTS access_log_no_update BEFORE UPDATE ON access_log BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER IF NOT EXISTS access_log_no_delete BEFORE DELETE ON access_log BEGIN SELECT RAISE(ABORT, 'append-only'); END;
