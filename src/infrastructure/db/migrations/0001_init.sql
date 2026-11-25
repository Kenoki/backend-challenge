CREATE TABLE clinics (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  timezone text NOT NULL
);

CREATE TABLE patients (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES clinics (id),
  name text NOT NULL,
  phone text,
  accepts_reminders boolean NOT NULL DEFAULT true
);
CREATE INDEX patients_phone_idx ON patients (phone);
CREATE INDEX patients_clinic_id_idx ON patients (clinic_id);

CREATE TABLE appointments (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES clinics (id),
  patient_id uuid NOT NULL REFERENCES patients (id),
  starts_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('scheduled', 'confirmed', 'cancelled'))
);
CREATE INDEX appointments_patient_id_idx ON appointments (patient_id);
CREATE INDEX appointments_clinic_id_idx ON appointments (clinic_id);

CREATE SEQUENCE reminder_sent_seq;

CREATE TABLE reminders (
  id uuid PRIMARY KEY,
  seq bigserial NOT NULL,
  appointment_id uuid NOT NULL REFERENCES appointments (id),
  for_starts_at timestamptz NOT NULL,
  scheduled_for timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'cancelled')),
  skip_reason text CHECK (skip_reason IN ('too_late', 'no_phone', 'opted_out')),
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  sent_seq bigint,
  claim_token uuid,
  claimed_until timestamptz
);
CREATE INDEX reminders_appointment_id_idx ON reminders (appointment_id);
CREATE INDEX reminders_pending_next_attempt_idx ON reminders (next_attempt_at) WHERE status = 'pending';

CREATE TABLE inbound_messages (
  message_id text PRIMARY KEY,
  received_at timestamptz NOT NULL,
  outcome text NOT NULL
);
