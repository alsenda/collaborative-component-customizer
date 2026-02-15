import type { JSX } from "preact";
import {
  PROTOCOL_VERSION,
  type JoinMessage,
  type RoomId
} from "@collaborative-component-customizer/shared";

/**
 * Renders the initial placeholder UI for the web application.
 */
export function App(): JSX.Element {
  const roomId: RoomId = "demo-room";
  const initialJoin: JoinMessage = {
    protocolVersion: PROTOCOL_VERSION,
    type: "join",
    roomId,
    clientId: "web-client"
  };

  return (
    <main className="p-4">
      collaborative-component-customizer web app scaffold is ready (protocol v{initialJoin.protocolVersion}, room {initialJoin.roomId}).
    </main>
  );
}
