/**
 * Notification sounds for audio state changes
 */

// Simple beep sound using Web Audio API
const playBeep = (frequency: number, duration: number, volume: number = 0.3) => {
    try {
        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
        console.warn('Could not play notification sound:', e);
    }
};

// Mute sound (lower pitch, descending)
export const playMuteSound = () => {
    playBeep(600, 0.08, 0.25);
    setTimeout(() => playBeep(400, 0.1, 0.2), 80);
};

// Unmute sound (higher pitch, ascending)
export const playUnmuteSound = () => {
    playBeep(400, 0.08, 0.25);
    setTimeout(() => playBeep(600, 0.1, 0.2), 80);
};

// Deafen sound (low double beep)
export const playDeafenSound = () => {
    playBeep(300, 0.1, 0.3);
    setTimeout(() => playBeep(200, 0.15, 0.25), 120);
};

// Undeafen sound (higher double beep)
export const playUndeafenSound = () => {
    playBeep(400, 0.1, 0.3);
    setTimeout(() => playBeep(600, 0.15, 0.25), 120);
};
