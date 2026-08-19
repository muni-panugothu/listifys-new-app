/** Published statuses visible to buyers / discovery. */
const PUBLISHED_EVENT_STATUSES = ["active", "published"];

/** Organizer-editable draft statuses. */
const DRAFT_EVENT_STATUSES = ["draft"];

/** System-managed statuses — organizers cannot set directly. */
const PROTECTED_EVENT_STATUSES = new Set([
  "sold",
  "sold_out",
  "expired",
  "removed",
  "cancelled",
  "postponed",
  "completed",
  "archived",
  "pending_review",
]);

function isPublishedEventStatus(status) {
  return PUBLISHED_EVENT_STATUSES.includes(String(status || "").toLowerCase());
}

function isDraftEventStatus(status) {
  return DRAFT_EVENT_STATUSES.includes(String(status || "").toLowerCase());
}

function isProtectedEventStatus(status) {
  return PROTECTED_EVENT_STATUSES.has(String(status || "").toLowerCase());
}

function publishedStatusFilter() {
  return { $in: PUBLISHED_EVENT_STATUSES };
}

module.exports = {
  PUBLISHED_EVENT_STATUSES,
  DRAFT_EVENT_STATUSES,
  PROTECTED_EVENT_STATUSES,
  isPublishedEventStatus,
  isDraftEventStatus,
  isProtectedEventStatus,
  publishedStatusFilter,
};
