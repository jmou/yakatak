import { defineExtensionMessaging } from "@webext-core/messaging";

interface ProtocolMap {
  getConnectionStatus(): boolean;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
