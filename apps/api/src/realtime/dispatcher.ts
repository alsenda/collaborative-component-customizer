import {
  PROTOCOL_VERSION,
  type ClientId,
  type ClientMessage,
  type ErrorMessage,
  type LockTarget,
  type LockTargetAtomic,
  type LockTargetPage,
  type PatchDraftBroadcastMessage,
  type PresenceMessage,
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
  lockTargetKey?: string | undefined;
}

export interface RealtimeDispatcherDependencies {
  getCurrentRoomDoc: (roomId: RoomId) => CurrentRoomDocResponse | null;
  logEvent?: (event: RealtimeLogEvent) => void;
}

interface ConnectionState {
  connectionId: string;
  clientId?: ClientId;
  send: (message: ServerMessage) => void;
  subscribedRooms: Set<RoomId>;
}

interface LockOwnership {
  ownerConnectionId: string;
  ownerClientId: ClientId;
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
  private readonly roomLocks = new Map<RoomId, Map<string, LockOwnership>>();

  private readonly getCurrentRoomDoc: RealtimeDispatcherDependencies["getCurrentRoomDoc"];

  private readonly logEvent?: RealtimeDispatcherDependencies["logEvent"];

  constructor(dependencies: RealtimeDispatcherDependencies) {
    this.getCurrentRoomDoc = dependencies.getCurrentRoomDoc;
    this.logEvent = dependencies.logEvent;
  }

  registerConnection(connection: RealtimeConnection): void {
    this.connectionsById.set(connection.connectionId, {
      connectionId: connection.connectionId,
      send: connection.send,
      subscribedRooms: new Set<RoomId>()
    });
  }

  disconnect(connectionId: string): void {
    const connectionState = this.connectionsById.get(connectionId);
    if (connectionState === undefined) {
      return;
    }

    this.releaseLocksForDisconnect(connectionState);

    const roomsImpactedByDisconnect = new Set<RoomId>();
    for (const roomId of connectionState.subscribedRooms) {
      roomsImpactedByDisconnect.add(roomId);
    }

    for (const [roomId, connectionIds] of this.roomConnections) {
      connectionIds.delete(connectionId);
      if (connectionIds.size < 1) {
        this.roomConnections.delete(roomId);
      } else if (connectionState.subscribedRooms.has(roomId)) {
        roomsImpactedByDisconnect.add(roomId);
      }
    }

    this.connectionsById.delete(connectionId);

    for (const roomId of roomsImpactedByDisconnect) {
      this.broadcastPresence(roomId);
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
        this.broadcastPresence(message.roomId);
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
      case "lockAcquire": {
        if (connectionState.clientId === undefined) {
          connectionState.clientId = message.clientId;
        }

        this.handleLockAcquire(connectionState, message);
        return;
      }
      case "lockReleased": {
        this.handleLockReleaseRequest(connectionState, message);
        return;
      }
      default: {
        connectionState.send(
          toServerError(
            "UNSUPPORTED_MESSAGE_TYPE",
            `Client message type '${message.type}' is not supported by this realtime dispatcher.`
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
    const connectionState = this.connectionsById.get(connectionId);
    if (connectionState !== undefined) {
      connectionState.subscribedRooms.add(roomId);
    }

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

  private handleLockAcquire(
    connectionState: ConnectionState,
    message: Extract<ClientMessage, { type: "lockAcquire" }>
  ): void {
    const lockTargetKey = this.getLockTargetKey(message.lockTarget);
    const currentRoomDoc = this.getCurrentRoomDoc(message.roomId);

    if (currentRoomDoc === null) {
      connectionState.send(
        toServerError("ROOM_NOT_FOUND", `Room '${message.roomId}' was not found.`)
      );
      this.logEvent?.({
        direction: "outbound",
        messageType: "error",
        roomId: message.roomId,
        connectionId: connectionState.connectionId,
        clientId: connectionState.clientId,
        lockTargetKey
      });
      return;
    }

    if (!this.isLockTargetValidForRoom(currentRoomDoc, message.lockTarget)) {
      connectionState.send({
        protocolVersion: PROTOCOL_VERSION,
        type: "lockDenied",
        roomId: message.roomId,
        clientId: message.clientId,
        lockTarget: message.lockTarget,
        reason: "invalidTarget"
      });
      this.logEvent?.({
        direction: "outbound",
        messageType: "lockDenied",
        roomId: message.roomId,
        connectionId: connectionState.connectionId,
        clientId: message.clientId,
        lockTargetKey
      });
      return;
    }

    const roomLockMap = this.getOrCreateRoomLockMap(message.roomId);
    const existingLock = roomLockMap.get(lockTargetKey);

    if (
      existingLock !== undefined &&
      (existingLock.ownerConnectionId !== connectionState.connectionId ||
        existingLock.ownerClientId !== message.clientId)
    ) {
      connectionState.send({
        protocolVersion: PROTOCOL_VERSION,
        type: "lockDenied",
        roomId: message.roomId,
        clientId: message.clientId,
        lockTarget: message.lockTarget,
        reason: "alreadyLocked"
      });
      this.logEvent?.({
        direction: "outbound",
        messageType: "lockDenied",
        roomId: message.roomId,
        connectionId: connectionState.connectionId,
        clientId: message.clientId,
        lockTargetKey
      });
      return;
    }

    roomLockMap.set(lockTargetKey, {
      ownerConnectionId: connectionState.connectionId,
      ownerClientId: message.clientId
    });

    connectionState.send({
      protocolVersion: PROTOCOL_VERSION,
      type: "lockGranted",
      roomId: message.roomId,
      clientId: message.clientId,
      lockTarget: message.lockTarget
    });
    this.logEvent?.({
      direction: "outbound",
      messageType: "lockGranted",
      roomId: message.roomId,
      connectionId: connectionState.connectionId,
      clientId: message.clientId,
      lockTargetKey
    });
  }

  private handleLockReleaseRequest(
    connectionState: ConnectionState,
    message: Extract<ClientMessage, { type: "lockReleased" }>
  ): void {
    const roomLockMap = this.roomLocks.get(message.roomId);
    if (roomLockMap === undefined) {
      return;
    }

    const lockTargetKey = this.getLockTargetKey(message.lockTarget);
    const existingLock = roomLockMap.get(lockTargetKey);

    if (existingLock === undefined) {
      return;
    }

    if (
      existingLock.ownerConnectionId !== connectionState.connectionId ||
      existingLock.ownerClientId !== message.clientId
    ) {
      return;
    }

    roomLockMap.delete(lockTargetKey);
    if (roomLockMap.size < 1) {
      this.roomLocks.delete(message.roomId);
    }

    this.broadcastToRoom(message.roomId, {
      protocolVersion: PROTOCOL_VERSION,
      type: "lockReleased",
      roomId: message.roomId,
      clientId: message.clientId,
      lockTarget: message.lockTarget
    });
  }

  private getOrCreateRoomLockMap(roomId: RoomId): Map<string, LockOwnership> {
    const existingRoomLockMap = this.roomLocks.get(roomId);
    if (existingRoomLockMap !== undefined) {
      return existingRoomLockMap;
    }

    const nextRoomLockMap = new Map<string, LockOwnership>();
    this.roomLocks.set(roomId, nextRoomLockMap);
    return nextRoomLockMap;
  }

  private getLockTargetKey(lockTarget: LockTarget): string {
    if (lockTarget.target === "atomic") {
      return this.getAtomicTargetKey(lockTarget);
    }

    return this.getPageTargetKey(lockTarget);
  }

  private getAtomicTargetKey(lockTarget: LockTargetAtomic): string {
    return `atomic:${lockTarget.componentId}`;
  }

  private getPageTargetKey(lockTarget: LockTargetPage): string {
    return `page:${lockTarget.pageId}:${lockTarget.instanceId}:${lockTarget.nodeId}`;
  }

  private isLockTargetValidForRoom(currentRoomDoc: CurrentRoomDocResponse, lockTarget: LockTarget): boolean {
    if (lockTarget.target === "atomic") {
      return lockTarget.componentId === currentRoomDoc.atomicDoc.componentId;
    }

    return lockTarget.pageId === currentRoomDoc.pageDoc.pageId;
  }

  private releaseLocksForDisconnect(connectionState: ConnectionState): void {
    for (const [roomId, roomLockMap] of this.roomLocks) {
      const lockEntries = [...roomLockMap.entries()];

      for (const [lockTargetKey, ownership] of lockEntries) {
        if (ownership.ownerConnectionId !== connectionState.connectionId) {
          continue;
        }

        const lockTarget = this.parseLockTargetKey(lockTargetKey);
        if (lockTarget === null) {
          continue;
        }

        roomLockMap.delete(lockTargetKey);

        this.broadcastToRoom(roomId, {
          protocolVersion: PROTOCOL_VERSION,
          type: "lockReleased",
          roomId,
          clientId: ownership.ownerClientId,
          lockTarget
        });
      }

      if (roomLockMap.size < 1) {
        this.roomLocks.delete(roomId);
      }
    }
  }

  private parseLockTargetKey(lockTargetKey: string): LockTarget | null {
    const atomicPrefix = "atomic:";
    const pagePrefix = "page:";

    if (lockTargetKey.startsWith(atomicPrefix)) {
      const componentId = lockTargetKey.slice(atomicPrefix.length);
      if (componentId.length < 1) {
        return null;
      }

      return {
        target: "atomic",
        componentId
      };
    }

    if (lockTargetKey.startsWith(pagePrefix)) {
      const pageParts = lockTargetKey.slice(pagePrefix.length).split(":");
      if (pageParts.length !== 3) {
        return null;
      }

      const pageId = pageParts[0];
      const instanceId = pageParts[1];
      const nodeId = pageParts[2];

      if (pageId === undefined || instanceId === undefined || nodeId === undefined) {
        return null;
      }

      if (pageId.length < 1 || instanceId.length < 1 || nodeId.length < 1) {
        return null;
      }

      return {
        target: "page",
        pageId,
        instanceId,
        nodeId
      };
    }

    return null;
  }

  private broadcastPresence(roomId: RoomId): void {
    const roomConnectionIds = this.roomConnections.get(roomId);
    if (roomConnectionIds === undefined) {
      return;
    }

    const sortedClientIds = [...roomConnectionIds]
      .map((connectionId) => this.connectionsById.get(connectionId)?.clientId)
      .filter((clientId): clientId is ClientId => clientId !== undefined)
      .sort((leftClientId, rightClientId) => leftClientId.localeCompare(rightClientId));

    const uniqueSortedClientIds = [...new Set(sortedClientIds)];

    const message: PresenceMessage = {
      protocolVersion: PROTOCOL_VERSION,
      type: "presence",
      roomId,
      clientIds: uniqueSortedClientIds
    };

    this.broadcastToRoom(roomId, message);
  }

  private broadcastToRoom(roomId: RoomId, message: ServerMessage): void {
    const roomConnectionIds = this.roomConnections.get(roomId);
    if (roomConnectionIds === undefined) {
      return;
    }

    for (const roomConnectionId of roomConnectionIds) {
      const targetConnection = this.connectionsById.get(roomConnectionId);
      if (targetConnection === undefined) {
        continue;
      }

      targetConnection.send(message);

      const lockTargetKey =
        "lockTarget" in message ? this.getLockTargetKey(message.lockTarget) : undefined;

      this.logEvent?.({
        direction: "outbound",
        messageType: message.type,
        roomId,
        connectionId: targetConnection.connectionId,
        clientId: targetConnection.clientId,
        lockTargetKey
      });
    }
  }
}
