/**
 * LocationPickerModal.tsx — ZenTrack Mobile
 * Location features and location-based notifications have been disabled per user request.
 */

import React from 'react';

interface Props {
  visible: boolean;
  onClose: () => void;
  initialValue?: any;
  onSelect: (trigger: any) => void;
}

export const LocationPickerModal = React.memo(function LocationPickerModal({
  visible: _visible,
  onClose: _onClose,
  initialValue: _initialValue,
  onSelect: _onSelect,
}: Props) {
  // Completely disabled per user request
  return null;
});

export default LocationPickerModal;
