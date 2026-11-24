function trustedProxyHops(value) {
  if (value === undefined || value.trim() === "") return 0;
  const hops = Number(value);
  if (!Number.isSafeInteger(hops) || hops < 0) {
    throw new Error("TRUST_PROXY_HOPS must be a non-negative integer.");
  }
  return hops;
}

module.exports = { trustedProxyHops };
