/**
 * Utilitários para notificações
 */

/**
 * Toca som de notificação usando Web Audio API
 */
export const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Configurar som
    oscillator.frequency.value = 800; // Frequência em Hz
    oscillator.type = 'sine';

    // Volume
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    // Tocar
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.log('Erro ao tocar som de notificação:', error);
  }
};

/**
 * Mostra notificação do navegador (Desktop Notification)
 */
export const showBrowserNotification = (title: string, options?: NotificationOptions) => {
  if (!('Notification' in window)) {
    console.log('Navegador não suporta notificações');
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification(title, options);
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, options);
      }
    });
  }
};

/**
 * Solicita permissão para notificações
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
};
