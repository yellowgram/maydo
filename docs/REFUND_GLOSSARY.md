# Refund glossary

Three different words. Do not use one of them to mean the others.

## Purchase refund (14 days)

The buyer's refund of **this MayDo purchase**. The Polar window is **14 days**. It returns the $149 (or the $99 launch price, if that was the charge). It is a money decision on the MayDo order. It does not run inside the entitlement kernel, and it does not change `allow` by itself.

Seller: Suthirth solutions. Contact: hello@yellowgram.dev.

## Webhook replay

`maydo replay` reopens **one** dead-lettered outbox row so the worker can apply it again. It does not call Stripe or Polar. It does not move money. It is not a purchase refund. A second execute of the same id is refused. Fix the mapper, dry-run, execute once, then drain.

## Provider `order.refunded` or cancel

Stripe and Polar events about **the buyer's own customers**.

- Polar `order.refunded` (including a payload that says `partially_refunded`) revokes every grant stored on that order binding. MayDo does not do quantity math.
- Polar `subscription.revoked` ends access. `subscription.canceled` does not. Canceled means period-end. Access ends at `subscription.revoked` or a local revoke.
- Stripe refund and subscription-deleted events follow the same grant map. They are not a refund of the MayDo purchase.

MayDo never sends the purchase refund, and it never invoices.
