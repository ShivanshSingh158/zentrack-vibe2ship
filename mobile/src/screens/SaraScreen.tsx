import React from 'react';

/**
 * SaraScreen — Deactivated / Hidden
 *
 * This screen is currently deactivated per project requirements to keep
 * the application ultra-light and fast without initializing heavy audio,
 * speech recognition, AI proxies, or multiple domain context subscriptions.
 */

export interface SaraProps {
  visible?: boolean;
  onClose?: () => void;
  isGlobalModal?: boolean;
  route?: any;
  navigation?: any;
}

export default function SaraScreen(_props: SaraProps) {
  return null;
}
