import {
  PROTOCOL_VERSION,
  type ClientId,
  type ClientMessage,
  type ErrorMessage,
  type PatchDraftBroadcastMessage,
  type RoomId,
  type ServerMessage
} from "@collaborative-component-customizer/shared";
import type { CurrentRoomDocResponse } from "../db/roomReadRepository.js";

export interface RealtimeConnection {
  connectionId: string;
  send: (message: ServerMessage) => void;
}

export interface RealtimeLogEvent {
  direction: "inbound" | "outbound";
  messageType: string;
  roomId?: string | undefined;
  connectionId: string;
  clientId?: string | undefined;
}

export interface RealtimeDispatcherDependencies {
  getCurrentRoomDoc: (roomId: RoomId) => CurrentRoomDocResponse | null;
  logEvent?: (event: RealtimeLogEvent) => void;
}

interface ConnectionState {
  connectionId: string;
  clientId?: ClientId;
  send: (message: ServerMessage) => void;
}

function toServerError(
  code: ErrorMessage["code"],
  message: string,
  issues?: string[]
): ErrorMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: "error",
    code,
    message,
    issues,
    supportedProtocolVersion: PROTOCOL_VERSION
  };
}

export class RealtimeDispatcher {
  private readonly connectionsById = new Map<string, ConnectionState>();
  private readonly roomConnections = new Map<RoomId, Set<string>>();

  private readonly getCurrentRoomDoc: RealtimeDispatcherDependencies["getCurrentRoomDoc"];

  private readonly logEvent?: RealtimeDispatcherDependencies["logEvent"];

  constructor(dependencies: RealtimeDispatcherDependencies) {
    this.getCurrentRoomDoc = dependencies.getCurrentRoomDoc;
    this.logEvent = dependencies.logEvent;
  }

  registerConnection(connection: RealtimeConnection): void {
    this.connectionsById.set(connection.connectionId, {
      connectionId: connection.connectionId,
      send: connection.send
    });
  }

  disconnect(connectionId: string): void {
    this.connectionsById.delete(connectionId);

    for (const [roomId, connectionIds] of this.roomConnections.entries()) {
      connectionIds.delete(connectionId);
      if (connectionIds.size < 1) {
        this.roomConnections.delete(roomId);
      }
    }
  }

  dispatch(connectionId: string, message: ClientMessage): void {
    const connectionState = this.connectionsById.get(connectionId);
    if (connectionState === undefined) {
      return;
    }

    this.logEvent?.({
      direction: "inbound",
      messageType: message.type,
      roomId: "roomId" in message ? message.roomId : undefined,
      connectionId: connectionState.connectionId,
      clientId: connectionState.clientId
    });

    switch (message.type) {
      case "join": {
        connectionState.clientId = message.clientId;
        this.subscribeConnectionToRoom(connectionState.connectionId, message.roomId);
        this.sendCurrentDoc(connectionState, message.roomId);
        return;
      }
      case "subscribe": {
        this.subscribeConnectionToRoom(connectionState.connectionId, message.roomId);
        this.sendCurrentDoc(connectionState, message.roomId);
        return;
      }
      case "patchDraft": {
        this.broadcastPatchDraft(connectionState, message.roomId, {
          protocolVersion: PROTOCOL_VERSION,
          type: "patchDraft",
          roomId: message.roomId,
          draftId: message.draftId,
          baseVersionId: message.baseVersionId,
          authorClientId: connectionState.clientId ?? connectionState.connectionId,
          ops: message.ops
        });
        return;
      }
      default: {
        connectionState.send(
          toServerError(
            "UNSUPPORTED_MESSAGE_TYPE",
            `Client message type '${message.type}' is not supported in STEP_12 realtime dispatcher.`
          )
        );
        this.logEvent?.({
          direction: "outbound",
          messageType: "error",
          roomId: "roomId" in message ? message.roomId : undefined,
          connectionId: connectionState.connectionId,
          clientId: connectionState.clientId
        });
      }
    }
  }

  private subscribeConnectionToRoom(connectionId: string, roomId: RoomId): void {
    const currentRoomConnections = this.roomConnections.get(roomId);

    if (currentRoomConnections !== undefined) {
      currentRoomConnections.add(connectionId);
      return;
    }

    this.roomConnections.set(roomId, new Set([connectionId]));
  }

  private sendCurrentDoc(connectionState: ConnectionState, roomId: RoomId): void {
    const currentRoomDoc = this.getCurrentRoomDoc(roomId);

    if (currentRoomDoc === null) {
      connectionState.send(toServerError("ROOM_NOT_FOUND", `Room '${roomId}' was not found.`));
      this.logEvent?.({
        direction: "outbound",
        messageType: "error",
        roomId,
        connectionId: connectionState.connectionId,
        clientId: connectionState.clientId
      });
      return;
    }

    connectionState.send({
      protocolVersion: PROTOCOL_VERSION,
      type: "doc",
      roomId,
      versionId: currentRoomDoc.currentVersionId,
      atomicDoc: currentRoomDoc.atomicDoc,
      pageDoc: currentRoomDoc.pageDoc
    });

    this.logEvent?.({
      direction: "outbound",
      messageType: "doc",
      roomId,
      connectionId: connectionState.connectionId,
      clientId: connectionState.clientId
    });
  }

  private broadcastPatchDraft(
    sourceConnection: ConnectionState,
    roomId: RoomId,
    broadcastMessage: PatchDraftBroadcastMessage
  ): void {
    const roomConnectionIds = this.roomConnections.get(roomId);
    if (roomConnectionIds === undefined) {
      return;
    }

    for (const roomConnectionId of roomConnectionIds) {
      if (roomConnectionId === sourceConnection.connectionId) {
        continue;
      }

      const targetConnection = this.connectionsById.get(roomConnectionId);
      if (targetConnection === undefined) {
        continue;
      }

      targetConnection.send(broadcastMessage);
      this.logEvent?.({
        direction: "outbound",
        messageType: broadcastMessage.type,
        roomId,
        connectionId: targetConnection.connectionId,
        clientId: targetConnection.clientId
      });
    }
  }
}
