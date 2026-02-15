import {
  parseClientMessage,
  PROTOCOL_VERSION,
  type ErrorMessage,
  type ServerMessage
} from "@collaborative-component-customizer/shared";
import type { RealtimeDispatcher } from "./dispatcher.js";

export interface WebTransportConnectionPort {
  connectionId: string;
  sendText: (payload: string) => void;
}

function toStableError(error: {
  code: ErrorMessage["code"];
  message: string;
  issues?: string[] | undefined;
}): ErrorMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: "error",
    code: error.code,
    message: error.message,
    issues: error.issues,
    supportedProtocolVersion: PROTOCOL_VERSION
  };
}

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

export function createWebTransportAdapter(dispatcher: RealtimeDispatcher): {
  connect: (port: WebTransportConnectionPort) => {
    receiveText: (payload: string) => void;
    close: () => void;
  };
} {
  return {
    connect: (port) => {
      dispatcher.registerConnection({
        connectionId: port.connectionId,
        send: (message) => {
          port.sendText(encodeServerMessage(message));
        }
      });

      return {
        receiveText: (payload: string) => {
          let parsedPayload: unknown;

          try {
            parsedPayload = JSON.parse(payload) as unknown;
          } catch {
            port.sendText(
              encodeServerMessage(
                toStableError({
                  code: "INVALID_MESSAGE",
                  message: "Invalid client message payload.",
                  issues: ["payload: Expected valid JSON text."]
                })
              )
            );
            return;
          }

          const parsedMessage = parseClientMessage(parsedPayload);

          if ("code" in parsedMessage) {
            port.sendText(
              encodeServerMessage(
                toStableError({
                  code: parsedMessage.code,
                  message: parsedMessage.message,
                  issues: parsedMessage.issues
                })
              )
            );
            return;
          }

          dispatcher.dispatch(port.connectionId, parsedMessage);
        },
        close: () => {
          dispatcher.disconnect(port.connectionId);
        }
      };
    }
  };
}
