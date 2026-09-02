// The 14 service_category values already in use across the 47 registered
// sources (see kb_admin GET /documents). Shown as suggestions in the
// upload form's category field, which stays a free-text input underneath
// so a genuinely new category isn't blocked.
export const KNOWN_CATEGORIES = [
  "oci",
  "surrender_renunciation",
  "misc_services",
  "visa",
  "passport_lost_damaged",
  "community_events",
  "status_tracking",
  "registration",
  "death_documents",
  "police_clearance",
  "attestation",
  "global_entry",
  "fraud_advisory",
  "out_of_remit",
];
