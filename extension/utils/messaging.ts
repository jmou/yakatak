import { defineExtensionMessaging } from "@webext-core/messaging";

interface ProtocolMap {
  enableSyncForWindow(windowId: number): void;
  disableSyncForWindow(windowId: number): void;
  queryWindows(): { id: number; connected: boolean; dirty: boolean }[];
  windowUpdated(windowId: number): void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
