// Main-menu music. It loops on the menu and fades out when a round starts, so
// the drawer can focus and the team can hear each other guess. Volume goes
// through Web Audio because iOS ignores HTMLMediaElement.volume.
import trackUrl from "./audio/menu-music.mp3";

const LEVEL = 0.35;
const FADE = 0.8; // seconds

export function createMusic() {
  const element = new Audio(trackUrl);
  element.loop = true;
  element.preload = "auto";
  let context;
  let gain;
  let wanted = false;
  let muted = false;
  let pauseTimer;

  function update() {
    if (!gain) return;
    const on = wanted && !muted && !document.hidden;
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(on ? LEVEL : 0, now + FADE);
    clearTimeout(pauseTimer);
    if (on) element.play().catch(() => {});
    else pauseTimer = setTimeout(() => element.pause(), FADE * 1000 + 50);
  }

  document.addEventListener("visibilitychange", update);

  return {
    /** Route through the game's AudioContext. Call from a tap so play() is allowed. */
    connect(audio) {
      if (!context) {
        context = audio;
        gain = context.createGain();
        gain.gain.value = 0;
        context
          .createMediaElementSource(element)
          .connect(gain)
          .connect(context.destination);
      }
      update();
    },
    play() {
      wanted = true;
      update();
    },
    stop() {
      wanted = false;
      update();
    },
    setMuted(value) {
      muted = value;
      update();
    },
  };
}
