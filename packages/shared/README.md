# packages/shared

Shared protocol constants and type-level contracts.

## Protocol migration notes

- Current protocol version: `1` (`PROTOCOL_VERSION`).
- Upgrade strategy for mismatched versions: reject inbound message parsing with `UNSUPPORTED_PROTOCOL_VERSION` and return the supported version so clients can reconnect using the current protocol.
