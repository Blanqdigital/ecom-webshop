import Stripe from "stripe";
import { getIntegration } from "@/lib/integrations";

// Server-only Stripe client. Throws lazily at call time if the key is missing,
// so the app still builds/runs without Stripe configured (cart works, checkout
// returns a friendly error). Key comes from env > Admin → Integrations.
let _stripe: Stripe | null = null;
let _stripeKey: string | null = null;

export async function getStripe(): Promise<Stripe> {
  // Strip any non printable-ASCII character (zero-width spaces, newlines, NBSP,
  // smart quotes) that copy-paste can inject into a dashboard env value. Stripe
  // keys are pure printable ASCII; such a stray char otherwise lands in the
  // Authorization header and Node rejects it with ERR_INVALID_CHAR.
  const key = (await getIntegration("stripe_secret_key")).replace(
    /[^\x21-\x7e]/g,
    "",
  );
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!_stripe || _stripeKey !== key) {
    _stripe = new Stripe(key);
    _stripeKey = key;
  }
  return _stripe;
}
