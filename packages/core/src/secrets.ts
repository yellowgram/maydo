import { DEV_KEY_PEPPER, DEV_SESSION_SECRET } from "./constants.js";

export function assertKeyPepper(pepper: string, production: boolean): void {
  if (!production) return;
  if (!pepper || pepper === DEV_KEY_PEPPER) {
    throw new Error("MAYDO_KEY_PEPPER must be set to a non-default value in production");
  }
}

/**
 * Console session MAC key. The dev default is public, so it can forge any
 * tenant cookie. Production always refuses it. Local boot refuses it unless
 * MAYDO_ALLOW_INSECURE_DEV_SECRETS=1.
 */
export function assertSessionSecret(
  secret: string,
  opts: { production: boolean; allowInsecureDevSecrets: boolean },
): void {
  if (opts.production && opts.allowInsecureDevSecrets) {
    throw new Error("MAYDO_ALLOW_INSECURE_DEV_SECRETS cannot be set when NODE_ENV=production");
  }
  const knownDefault = !secret.trim() || secret === DEV_SESSION_SECRET;
  if (opts.production && (knownDefault || secret.length < 32)) {
    throw new Error("MAYDO_SESSION_SECRET must be a non-default value of at least 32 characters in production");
  }
  if (knownDefault && !opts.allowInsecureDevSecrets) {
    throw new Error(
      "Set MAYDO_SESSION_SECRET (openssl rand -hex 32), or MAYDO_ALLOW_INSECURE_DEV_SECRETS=1 for local development only",
    );
  }
}
