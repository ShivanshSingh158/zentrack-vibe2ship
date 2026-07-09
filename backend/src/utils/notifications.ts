export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notification');
    return false;
  }
  
  if (Notification.permission === 'granted') {
    return true;
  }
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  return false;
};

// We use a Mixkit free sound effect for the notification chime
const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

export const playNotificationSound = () => {
  try {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 0.6;
    audio.play().catch(e => console.warn('Could not play notification sound (autoplay blocked):', e));
  } catch (err) {
    console.error('Audio play error', err);
  }
};

export const sendSystemNotification = (title: string, options?: NotificationOptions, playSound: boolean = true) => {
  if (!('Notification' in window)) return;
  
  if (Notification.permission === 'granted') {
    const notifyOptions = {
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      ...options
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, notifyOptions);
      }).catch(() => {
        // Fallback if SW is not ready but supported
        new Notification(title, notifyOptions);
      });
    } else {
      // Fallback for browsers without SW support
      new Notification(title, notifyOptions);
    }
    
    if (playSound) {
      playNotificationSound();
    }
  } else {
    // Fallback if no permission
    if (playSound) {
      playNotificationSound();
    }
  }
};
