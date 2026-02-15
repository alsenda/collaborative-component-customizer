import { describe, expect, test } from "vitest";
import {
  parseServerMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
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

function collectTypedMessages(payloads: unknown[]): ServerMessage[] {
  return payloads
    .map((payload) => payload as ServerMessage)
    .filter((payload) => payload.protocolVersion === PROTOCOL_VERSION);
}

function findLastMessageByType<TType extends ServerMessage["type"]>(
  messages: ServerMessage[],
  type: TType
): Extract<ServerMessage, { type: TType }> | undefined {
  const matchingMessages = messages.filter(
    (message): message is Extract<ServerMessage, { type: TType }> => message.type === type
  );

  return matchingMessages.at(-1);
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

    const messagesToA = collectTypedMessages(sentToA);
    const messagesToB = collectTypedMessages(sentToB);

    expect(messagesToA.some((message) => message.type === "doc")).toBe(true);
    expect(messagesToB.some((message) => message.type === "doc")).toBe(true);
    expect(findLastMessageByType(messagesToA, "presence")).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: "presence",
      roomId: "room-1",
      clientIds: ["client-a"]
    });
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

    const messagesToA = collectTypedMessages(sentToA);
    const messagesToB = collectTypedMessages(sentToB);
    const messagesToC = collectTypedMessages(sentToC);

    expect(messagesToA.some((message) => message.type === "patchDraft")).toBe(false);
    expect(messagesToB.some((message) => message.type === "patchDraft")).toBe(true);
    expect(messagesToC.some((message) => message.type === "patchDraft")).toBe(false);

    expect(findLastMessageByType(messagesToB, "patchDraft")).toMatchObject({
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

  test("first lock acquire is granted and competing acquire is denied", () => {
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
      type: "join",
      roomId: "room-1",
      clientId: "client-b"
    });

    dispatcher.dispatch("connection-a", {
      protocolVersion: PROTOCOL_VERSION,
      type: "lockAcquire",
      roomId: "room-1",
      clientId: "client-a",
      lockTarget: {
        target: "atomic",
        componentId: "component-hero"
      }
    });

    dispatcher.dispatch("connection-b", {
      protocolVersion: PROTOCOL_VERSION,
      type: "lockAcquire",
      roomId: "room-1",
      clientId: "client-b",
      lockTarget: {
        target: "atomic",
        componentId: "component-hero"
      }
    });

    const messagesToA = collectTypedMessages(sentToA);
    const messagesToB = collectTypedMessages(sentToB);

    expect(findLastMessageByType(messagesToA, "lockGranted")).toMatchObject({
      type: "lockGranted",
      roomId: "room-1",
      clientId: "client-a"
    });
    expect(findLastMessageByType(messagesToB, "lockDenied")).toMatchObject({
      type: "lockDenied",
      roomId: "room-1",
      clientId: "client-b",
      reason: "alreadyLocked"
    });
  });

  test("invalid lock targets are denied with invalidTarget reason", () => {
    const sentToA: unknown[] = [];
    const dispatcher = new RealtimeDispatcher({
      getCurrentRoomDoc: (roomId) => fixtureRoomDoc(roomId)
    });

    dispatcher.registerConnection({
      connectionId: "connection-a",
      send: (message) => {
        sentToA.push(message);
      }
    });

    dispatcher.dispatch("connection-a", {
      protocolVersion: PROTOCOL_VERSION,
      type: "join",
      roomId: "room-1",
      clientId: "client-a"
    });

    dispatcher.dispatch("connection-a", {
      protocolVersion: PROTOCOL_VERSION,
      type: "lockAcquire",
      roomId: "room-1",
      clientId: "client-a",
      lockTarget: {
        target: "atomic",
        componentId: "unknown-component"
      }
    });

    const messagesToA = collectTypedMessages(sentToA);
    expect(findLastMessageByType(messagesToA, "lockDenied")).toMatchObject({
      type: "lockDenied",
      reason: "invalidTarget"
    });
  });

  test("non-holder cannot release and holder release is broadcast", () => {
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
      type: "join",
      roomId: "room-1",
      clientId: "client-b"
    });

    dispatcher.dispatch("connection-a", {
      protocolVersion: PROTOCOL_VERSION,
      type: "lockAcquire",
      roomId: "room-1",
      clientId: "client-a",
      lockTarget: {
        target: "atomic",
        componentId: "component-hero"
      }
    });

    dispatcher.dispatch("connection-b", {
      protocolVersion: PROTOCOL_VERSION,
      type: "lockReleased",
      roomId: "room-1",
      clientId: "client-b",
      lockTarget: {
        target: "atomic",
        componentId: "component-hero"
      }
    });

    dispatcher.dispatch("connection-b", {
      protocolVersion: PROTOCOL_VERSION,
      type: "lockAcquire",
      roomId: "room-1",
      clientId: "client-b",
      lockTarget: {
        target: "atomic",
        componentId: "component-hero"
      }
    });

    dispatcher.dispatch("connection-a", {
      protocolVersion: PROTOCOL_VERSION,
      type: "lockReleased",
      roomId: "room-1",
      clientId: "client-a",
      lockTarget: {
        target: "atomic",
        componentId: "component-hero"
      }
    });

    dispatcher.dispatch("connection-b", {
      protocolVersion: PROTOCOL_VERSION,
      type: "lockAcquire",
      roomId: "room-1",
      clientId: "client-b",
      lockTarget: {
        target: "atomic",
        componentId: "component-hero"
      }
    });

    const messagesToA = collectTypedMessages(sentToA);
    const messagesToB = collectTypedMessages(sentToB);

    const lastDeniedForB = findLastMessageByType(messagesToB, "lockDenied");
    expect(lastDeniedForB).toMatchObject({
      type: "lockDenied",
      reason: "alreadyLocked"
    });

    expect(messagesToA.some((message) => message.type === "lockReleased")).toBe(true);
    expect(messagesToB.some((message) => message.type === "lockReleased")).toBe(true);

    expect(findLastMessageByType(messagesToB, "lockGranted")).toMatchObject({
      type: "lockGranted",
      clientId: "client-b"
    });
  });

  test("disconnect releases held locks and emits deterministic presence", () => {
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

    dispatcher.dispatch("connection-b", {
      protocolVersion: PROTOCOL_VERSION,
      type: "join",
      roomId: "room-1",
      clientId: "client-b"
    });
    dispatcher.dispatch("connection-a", {
      protocolVersion: PROTOCOL_VERSION,
      type: "join",
      roomId: "room-1",
      clientId: "client-a"
    });

    dispatcher.dispatch("connection-a", {
      protocolVersion: PROTOCOL_VERSION,
      type: "lockAcquire",
      roomId: "room-1",
      clientId: "client-a",
      lockTarget: {
        target: "atomic",
        componentId: "component-hero"
      }
    });

    dispatcher.disconnect("connection-a");

    const messagesToB = collectTypedMessages(sentToB);
    expect(findLastMessageByType(messagesToB, "presence")).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: "presence",
      roomId: "room-1",
      clientIds: ["client-b"]
    });
    expect(findLastMessageByType(messagesToB, "lockReleased")).toMatchObject({
      type: "lockReleased",
      clientId: "client-a"
    });

    dispatcher.dispatch("connection-b", {
      protocolVersion: PROTOCOL_VERSION,
      type: "lockAcquire",
      roomId: "room-1",
      clientId: "client-b",
      lockTarget: {
        target: "atomic",
        componentId: "component-hero"
      }
    });

    const updatedMessagesToB = collectTypedMessages(sentToB);
    expect(findLastMessageByType(updatedMessagesToB, "lockGranted")).toMatchObject({
      type: "lockGranted",
      clientId: "client-b"
    });
  });

  test("lock and presence events are room scoped", () => {
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
      roomId: "room-1",
      clientId: "client-a"
    });
    dispatcher.dispatch("connection-b", {
      protocolVersion: PROTOCOL_VERSION,
      type: "join",
      roomId: "room-1",
      clientId: "client-b"
    });
    dispatcher.dispatch("connection-c", {
      protocolVersion: PROTOCOL_VERSION,
      type: "join",
      roomId: "room-2",
      clientId: "client-c"
    });

    dispatcher.dispatch("connection-a", {
      protocolVersion: PROTOCOL_VERSION,
      type: "lockAcquire",
      roomId: "room-1",
      clientId: "client-a",
      lockTarget: {
        target: "atomic",
        componentId: "component-hero"
      }
    });

    const messagesToA = collectTypedMessages(sentToA);
    const messagesToB = collectTypedMessages(sentToB);
    const messagesToC = collectTypedMessages(sentToC);

    expect(messagesToA.some((message) => message.type === "lockGranted")).toBe(true);
    expect(messagesToB.some((message) => message.type === "lockGranted")).toBe(false);
    expect(messagesToC.some((message) => message.type === "lockGranted")).toBe(false);
    expect(messagesToC.some((message) => message.type === "presence" && message.roomId === "room-1")).toBe(
      false
    );
  });

  test("presence clientIds are emitted in deterministic sorted order", () => {
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

    dispatcher.dispatch("connection-b", {
      protocolVersion: PROTOCOL_VERSION,
      type: "join",
      roomId: "room-1",
      clientId: "z-client"
    });
    dispatcher.dispatch("connection-a", {
      protocolVersion: PROTOCOL_VERSION,
      type: "join",
      roomId: "room-1",
      clientId: "a-client"
    });

    const messagesToA = collectTypedMessages(sentToA);
    const lastPresence = findLastMessageByType(messagesToA, "presence");
    expect(lastPresence).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: "presence",
      roomId: "room-1",
      clientIds: ["a-client", "z-client"]
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

    expect(sentPayloads.length).toBeGreaterThanOrEqual(1);

    const parsedPayloads = sentPayloads.map((payload) =>
      parseServerMessage(JSON.parse(payload) as unknown)
    );

    const docPayload = parsedPayloads.find(
      (message): message is Extract<ServerMessage, { type: "doc" }> =>
        !("code" in message) && message.type === "doc"
    );

    expect(docPayload).toBeDefined();
    expect(docPayload?.roomId).toBe("room-1");
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
