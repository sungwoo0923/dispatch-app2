import React from "react";

const STORAGE_KEY = "notificationsEnabled";
const EVENT_NAME = "notificationSettingChanged";

export function isNotificationsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setNotificationsEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { enabled } }));
}

export function useNotificationsEnabled() {
  const [enabled, setEnabled] = React.useState(isNotificationsEnabled());

  React.useEffect(() => {
    const sync = () => setEnabled(isNotificationsEnabled());
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return enabled;
}
