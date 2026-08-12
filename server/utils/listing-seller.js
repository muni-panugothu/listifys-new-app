/** Resolve a display name for listing sellerName from the authenticated user document. */
function resolveSellerName(user) {
  if (!user) return "User";

  const name = typeof user.name === "string" ? user.name.trim() : "";
  if (name) return name;

  const firstName = typeof user.firstName === "string" ? user.firstName.trim() : "";
  if (firstName) {
    const lastName = typeof user.lastName === "string" ? user.lastName.trim() : "";
    return `${firstName}${lastName ? ` ${lastName}` : ""}`.trim();
  }

  const username = typeof user.username === "string" ? user.username.trim() : "";
  if (username) return username;

  const email = typeof user.email === "string" ? user.email.trim() : "";
  if (email.includes("@")) return email.split("@")[0];

  const phone = typeof user.phone === "string" ? user.phone.trim() : "";
  if (phone) return phone;

  return "User";
}

module.exports = { resolveSellerName };
