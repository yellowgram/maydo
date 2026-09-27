import { DEV_KEY_PEPPER, DEV_SESSION_SECRET } from "./constants.js";

/**
 * Founding hosts must set NODE_ENV=production. MAYDO_REQUIRE_PRODUCTION=1
 * turns the same guards on when a platform forgets NODE_ENV.
 */
export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || env.MAYDO_REQUIRE_PRODUCTION === "1";
}

export function allowInsecureDevSecrets(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MAYDO_ALLOW_INSECURE_DEV_SECRETS === "1";
}

/**
 * The dev pepper is public. It is legal only for local boot with
 * MAYDO_ALLOW_INSECURE_DEV_SECRETS=1. Production refuses that flag and the
 * dev pepper, including when production is signaled by MAYDO_REQUIRE_PRODUCTION.
 */
export function assertKeyPepper(
  pepper: string,
  opts: { production: boolean; allowInsecureDevSecrets: boolean },
): void {
  if (opts.production && opts.allowInsecureDevSecrets) {
    throw new Error(
      "MAYDO_ALLOW_INSECURE_DEV_SECRETS cannot be set when NODE_ENV=production or MAYDO_REQUIRE_PRODUCTION=1",
    );
  }
  const knownDefault = !pepper || pepper === DEV_KEY_PEPPER;
  if (opts.production && knownDefault) {
    throw new Error("MAYDO_KEY_PEPPER must be set to a non-default value in production");
  }
  if (knownDefault && !opts.allowInsecureDevSecrets) {
    throw new Error(
      "Set MAYDO_KEY_PEPPER (openssl rand -hex 32), or MAYDO_ALLOW_INSECURE_DEV_SECRETS=1 for local development only",
    );
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
    throw new Error(
      "MAYDO_ALLOW_INSECURE_DEV_SECRETS cannot be set when NODE_ENV=production or MAYDO_REQUIRE_PRODUCTION=1",
    );
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
