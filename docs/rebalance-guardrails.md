# DLMM Rebalance Guardrails

Prism should only rebalance when the new band is measurably better than staying put. This note is a reminder that activity alone is not alpha.

## Rebalance only when

- Inventory drift pushes the current band outside the target posture.
- Fee capture no longer compensates for imbalance risk.
- The replacement band improves expected carry after gas and slip.

## Hold position when

- The edge depends on one noisy print.
- Pool utilization changed without confirming depth migration.
- The new band would need another rebalance almost immediately.

## Sanity check

If the argument for moving cannot survive one adverse tick and one wider spread assumption, skip the rebalance and wait.
