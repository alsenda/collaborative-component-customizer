import { describe, expect, test } from "vitest";
import {
  parseServerMessage,
  PROTOCOL_VERSION,
  type RoomId
} from "@collaborative-component-customizer/shared";
import type { CurrentRoomDocResponse } from "../src/db/roomReadRepository.js";
import { RealtimeDispatcher } from "../src/realtime/dispatcher.js";
import { createWebTransportAdapter } from "../src/realtime/webTransportAdapter.js";

function fixtureRoomDoc(roomId: RoomId): CurrentRoomDocResponse {
  return {
    roomId,
    currentVersionId: "version-003",
    atomicDoc: {
      componentId: "component-hero",
      className: "text-4xl"
    },
    pageDoc: {
      pageId: "page-home",
      overrides: []
    }
  };
}

describe("realtime dispatcher", () => {
  test("join and subscribe send typed doc message to each connected client", () => {
    const sentToA: unknown[] = [];
    const sentToB: unknown[] = [];
    const dispatcher = new RealtimeDispatcher({
      getCurrentRoomDoc: (roomId) => fixtureRoomDoc(roomId)
    });

    dispatcher.registerConnection({
      connectionId: "connection-a",
      send: (message) => {
        sentToA.push(message);
      }
    });

    dispatcher.registerConnection({
      connectionId: "connection-b",
      send: (message) => {
        sentToB.push(message);
      }
    });

    dispatcher.dispatch("connection-a", {
      protocolVersion: PROTOCOL_VERSION,
      type: "join",
      roomId: "room-1",
      clientId: "client-a"
    });

    dispatcher.dispatch("connection-b", {
      protocolVersion: PROTOCOL_VERSION,
      type: "subscribe",
      roomId: "room-1"
    });

    expect(sentToA).toHaveLength(1);
    expect(sentToB).toHaveLength(1);
    expect(sentToA[0]).toMatchObject({ type: "doc", roomId: "room-1", versionId: "version-003" });
    expect(sentToB[0]).toMatchObject({ type: "doc", roomId: "room-1", versionId: "version-003" });
  });

  test("patchDraft fan-out is room scoped and excludes source connection", () => {
    const sentToA: unknown[] = [];
    const sentToB: unknown[] = [];
    const sentToC: unknown[] = [];

    const dispatcher = new RealtimeDispatcher({
      getCurrentRoomDoc: (roomId) => fixtureRoomDoc(roomId)
    });

    dispatcher.registerConnection({
      connectionId: "connection-a",
      send: (message) => {
        sentToA.push(message);
      }
    });
    dispatcher.registerConnection({
      connectionId: "connection-b",
      send: (message) => {
        sentToB.push(message);
      }
    });
    dispatcher.registerConnection({
      connectionId: "connection-c",
      send: (message) => {
        sentToC.push(message);
      }
    });

    dispatcher.dispatch("connection-a", {
      protocolVersion: PROTOCOL_VERSION,
      type: "join",
      roomId: "room-a",
      clientId: "client-a"
    });

    dispatcher.dispatch("connection-b", {
      protocolVersion: PROTOCOL_VERSION,
      type: "subscribe",
      roomId: "room-a"
    });

    dispatcher.dispatch("connection-c", {
      protocolVersion: PROTOCOL_VERSION,
      type: "subscribe",
      roomId: "room-b"
    });

    dispatcher.dispatch("connection-a", {
      protocolVersion: PROTOCOL_VERSION,
      type: "patchDraft",
      roomId: "room-a",
      draftId: "draft-1",
      baseVersionId: "version-003",
      ops: [
        {
          op: "setAtomicClassName",
          componentId: "component-hero",
          className: "text-6xl"
        }
      ]
    });

    expect(sentToA).toHaveLength(1);
    expect(sentToB).toHaveLength(2);
    expect(sentToC).toHaveLength(1);
    expect(sentToB[1]).toMatchObject({
      type: "patchDraft",
      roomId: "room-a",
      draftId: "draft-1",
      authorClientId: "client-a"
    });
  });

  test("missing room emits stable typed error message", () => {
    const sentToClient: unknown[] = [];
    const dispatcher = new RealtimeDispatcher({
      getCurrentRoomDoc: () => null
    });

    dispatcher.registerConnection({
      connectionId: "connection-a",
      send: (message) => {
        sentToClient.push(message);
      }
    });

    dispatcher.dispatch("connection-a", {
      protocolVersion: PROTOCOL_VERSION,
      type: "subscribe",
      roomId: "missing-room"
    });

    expect(sentToClient).toHaveLength(1);
    expect(sentToClient[0]).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: "error",
      code: "ROOM_NOT_FOUND",
      message: "Room 'missing-room' was not found.",
      supportedProtocolVersion: PROTOCOL_VERSION,
      issues: undefined
    });
  });
});

describe("web transport adapter contract", () => {
  test("valid messages flow through dispatcher and outbound payloads are typed", () => {
    const sentPayloads: string[] = [];
    const dispatcher = new RealtimeDispatcher({
      getCurrentRoomDoc: (roomId) => fixtureRoomDoc(roomId)
    });
    const adapter = createWebTransportAdapter(dispatcher);

    const connection = adapter.connect({
      connectionId: "connection-a",
      sendText: (payload) => {
        sentPayloads.push(payload);
      }
    });

    connection.receiveText(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: "join",
        roomId: "room-1",
        clientId: "client-a"
      })
    );

    expect(sentPayloads).toHaveLength(1);

    const parsedServerMessage = parseServerMessage(JSON.parse(sentPayloads[0]) as unknown);
    expect("code" in parsedServerMessage).toBe(false);
    if ("code" in parsedServerMessage) {
      throw new Error("expected typed server message");
    }

    expect(parsedServerMessage.type).toBe("doc");
    expect(parsedServerMessage.roomId).toBe("room-1");
    connection.close();
  });

  test("invalid payloads return stable typed error messages", () => {
    const sentPayloads: string[] = [];
    const dispatcher = new RealtimeDispatcher({
      getCurrentRoomDoc: (roomId) => fixtureRoomDoc(roomId)
    });
    const adapter = createWebTransportAdapter(dispatcher);

    const connection = adapter.connect({
      connectionId: "connection-a",
      sendText: (payload) => {
        sentPayloads.push(payload);
      }
    });

    connection.receiveText("{not valid json}");
    connection.receiveText(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: "join",
        roomId: "room-1"
      })
    );

    expect(sentPayloads).toHaveLength(2);

    const invalidJsonResponse = parseServerMessage(JSON.parse(sentPayloads[0]) as unknown);
    const invalidSchemaResponse = parseServerMessage(JSON.parse(sentPayloads[1]) as unknown);

    if (!("type" in invalidJsonResponse) || !("type" in invalidSchemaResponse)) {
      throw new Error("expected typed server error payload");
    }

    expect(invalidJsonResponse.type).toBe("error");
    expect(invalidJsonResponse.code).toBe("INVALID_MESSAGE");
    expect(invalidSchemaResponse.type).toBe("error");
    expect(invalidSchemaResponse.code).toBe("INVALID_MESSAGE");

    connection.close();
  });
});
