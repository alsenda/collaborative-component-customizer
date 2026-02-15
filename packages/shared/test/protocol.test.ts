import { describe, expect, test } from "vitest";
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  parseServerMessage
} from "../src/index";

describe("shared protocol parsing", () => {
  test("parseClientMessage parses a valid client message", () => {
    const parsed = parseClientMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: "join",
      roomId: "room-1",
      clientId: "client-1"
    });

    if ("code" in parsed) {
      throw new Error(`expected valid message, got ${parsed.code}`);
    }

    expect(parsed.type).toBe("join");
    expect(parsed.roomId).toBe("room-1");
  });

  test("parseClientMessage rejects invalid payload", () => {
    const parsed = parseClientMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: "save",
      roomId: "room-1",
      baseVersionId: "version-1"
    });

    expect("code" in parsed).toBe(true);
    if ("code" in parsed) {
      expect(parsed.code).toBe("INVALID_MESSAGE");
    }
  });

  test("parseClientMessage requires protocol version", () => {
    const parsed = parseClientMessage({
      type: "join",
      roomId: "room-1",
      clientId: "client-1"
    });

    expect("code" in parsed).toBe(true);
    if ("code" in parsed) {
      expect(parsed.code).toBe("INVALID_MESSAGE");
    }
  });

  test("parseServerMessage parses a valid server message", () => {
    const parsed = parseServerMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: "saved",
      roomId: "room-1",
      versionId: "version-2",
      createdAtIso: "2026-02-15T00:00:00.000Z"
    });

    if ("code" in parsed) {
      throw new Error(`expected valid message, got ${parsed.code}`);
    }

    expect(parsed.type).toBe("saved");
    expect(parsed.versionId).toBe("version-2");
  });

  test("parseServerMessage rejects unsupported protocol version", () => {
    const parsed = parseServerMessage({
      protocolVersion: 99,
      type: "presence",
      roomId: "room-1",
      clientIds: ["client-1"]
    });

    expect("code" in parsed).toBe(true);
    if ("code" in parsed) {
      expect(parsed.code).toBe("UNSUPPORTED_PROTOCOL_VERSION");
      expect(parsed.supportedProtocolVersion).toBe(PROTOCOL_VERSION);
    }
  });
});
