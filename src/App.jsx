import { useEffect, useRef, useState } from 'react';
import { Activity, Camera, CameraOff, Heart, Info, Mic2, ShieldCheck, Sparkles, Volume2, VolumeX, Waves } from 'lucide-react';
import { chooseIdleMood, chooseReaction, getEmotion, readFaceCue, readHeadMotion } from './emotions.js';
import { createLocalFaceLandmarker } from './vision.js';

const affectionKey = 'eilik-affection-v1';
function readAffection() {
  try { return Math.min(100, Math.max(0, Number(localStorage.getItem(affectionKey)) || 42)); }
  catch { return 42; }
}

function playChirp(enabled, pitch = 520) {
  if (!enabled) return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(pitch, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(pitch * 1.4, context.currentTime + .12);
    gain.gain.setValueAtTime(.07, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + .21);
    oscillator.onended = () => context.close();
  } catch { /* Audio is an optional enhancement. */ }
}

function Face({ emotion, onTouch, onSwipe, cameraActive, videoRef }) {
  const startPoint = useRef(null);
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setBlink(true);
      window.setTimeout(() => setBlink(false), 170);
    }, 4300 + Math.random() * 2700);
    return () => window.clearInterval(timer);
  }, []);

  function pointerUp(event) {
    if (!startPoint.current) return;
    if (Math.abs(event.clientX - startPoint.current.x) > 48) onSwipe();
    else onTouch();
    startPoint.current = null;
  }

  return (
    <div className={`robot-scene mood-${emotion.family} face-${emotion.face}`} onPointerDown={(event) => { startPoint.current = { x: event.clientX }; }} onPointerUp={pointerUp} role="button" tabIndex={0} aria-label={`Eilik is feeling ${emotion.name}. Tap for a reaction or swipe to pet.`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onTouch(); }}>
      <div className="robot-shadow" />
      <div className="robot-base"><span /></div>
      <div className="robot-arm robot-arm-left" /><div className="robot-arm robot-arm-right" />
      <div className="robot-body"><div className="robot-chest-mark" /><span className="robot-name">Eilik</span><div className="robot-body-seam" /></div>
      <div className="robot-neck" />
      <div className="robot-head">
        <div className="robot-top-accent" />
        <div className={`robot-screen mood-${emotion.family} face-${emotion.face}`}>
          {cameraActive && <video ref={videoRef} className="camera-preview" autoPlay muted playsInline aria-label="Local camera input" />}
          <div className={`face-eyes ${blink ? 'blink' : ''}`}>
            <div className="eye eye-left"><span className="pupil" /></div>
            <div className="eye eye-right"><span className="pupil" /></div>
          </div>
          <div className="cheeks"><i /><i /></div>
          <div className="face-mouth"><span /></div>
        </div>
      </div>
      <span className="robot-caption">{emotion.name}</span>
    </div>
  );
}

function App() {
  const [emotion, setEmotion] = useState(() => getEmotion('curious'));
  const [affection, setAffection] = useState(readAffection);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [visionStatus, setVisionStatus] = useState('off');
  const [observedCue, setObservedCue] = useState({ label: 'Camera is off', confidence: 0, smile: 0, facePresent: false });
  const [recentMoods, setRecentMoods] = useState([{ id: 'curious', name: 'Curious', source: 'Just now' }]);
  const [interactionCount, setInteractionCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toast, setToast] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const decayRef = useRef(null);
  const toastRef = useRef(null);
  const emotionRef = useRef(emotion);
  const affectionRef = useRef(affection);
  const soundRef = useRef(soundEnabled);
  const lastInteractionRef = useRef(Date.now());
  const lastAutoMoodRef = useRef(0);
  const headHistoryRef = useRef([]);
  const lastMotionRef = useRef(0);
  const deviceMotionRef = useRef(null);

  useEffect(() => { emotionRef.current = emotion; }, [emotion]);
  useEffect(() => { affectionRef.current = affection; }, [affection]);
  useEffect(() => { soundRef.current = soundEnabled; }, [soundEnabled]);

  function respondToMotion(kind) {
    if (Date.now() - lastMotionRef.current <= 2400) return;
    lastMotionRef.current = Date.now();
    lastInteractionRef.current = Date.now();
    const next = kind === 'shake' ? getEmotion('dizzy') : chooseReaction(kind, affectionRef.current, emotionRef.current.id);
    emotionRef.current = next;
    setEmotion(next);
    setRecentMoods((items) => [{ id: next.id, name: next.name, source: kind === 'shake' ? 'Camera shake' : 'Head nod' }, ...items].slice(0, 4));
    setInteractionCount((count) => count + 1);
    playChirp(soundRef.current, kind === 'shake' ? 300 : 620);
    lastAutoMoodRef.current = Date.now();
  }

  useEffect(() => { try { localStorage.setItem(affectionKey, String(affection)); } catch { /* Storage is optional. */ } }, [affection]);
  useEffect(() => () => {
    window.clearTimeout(decayRef.current);
    window.clearTimeout(toastRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  useEffect(() => { if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current; }, [cameraActive]);

  useEffect(() => {
    if (!cameraActive) return undefined;
    function detectDeviceShake(event) {
      const acceleration = event.acceleration;
      let strength = acceleration ? Math.hypot(acceleration.x ?? 0, acceleration.y ?? 0, acceleration.z ?? 0) : 0;
      if (!acceleration && event.accelerationIncludingGravity) {
        const current = event.accelerationIncludingGravity;
        const previous = deviceMotionRef.current;
        if (previous) strength = Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
        deviceMotionRef.current = current;
      }
      if (strength > 7.5) respondToMotion('shake');
    }
    window.addEventListener('devicemotion', detectDeviceShake);
    return () => {
      window.removeEventListener('devicemotion', detectDeviceShake);
      deviceMotionRef.current = null;
    };
  }, [cameraActive]);

  useEffect(() => {
    if (!cameraActive) {
      setVisionStatus('off');
      setObservedCue({ label: 'Camera is off', confidence: 0, smile: 0, facePresent: false });
      return undefined;
    }

    let active = true;
    let animationFrame = 0;
    let landmarker;
    let lastInference = 0;
    let candidateId = '';
    let candidateFrames = 0;
    setVisionStatus('loading');

    async function observe() {
      try {
        landmarker = await createLocalFaceLandmarker();
        if (!active) {
          landmarker.close();
          return;
        }
        setVisionStatus('ready');

        function detect(timestamp) {
          if (!active) return;
          const video = videoRef.current;
          if (video?.readyState >= 2 && timestamp - lastInference > 260) {
            lastInference = timestamp;
            const result = landmarker.detectForVideo(video, timestamp);
            const categories = result.faceBlendshapes?.[0]?.categories;
            const landmarks = result.faceLandmarks?.[0];
            const facePresent = Boolean(landmarks);
            if (!facePresent) {
              candidateId = '';
              candidateFrames = 0;
              headHistoryRef.current = [];
              setObservedCue({ label: 'No face in view', confidence: 0, smile: 0, facePresent: false });
            } else {
              const cue = readFaceCue(categories);
              setObservedCue({ ...cue, facePresent: true });
              const motion = readHeadMotion(landmarks, headHistoryRef.current, timestamp);
              headHistoryRef.current = motion.history;
              if (motion.kind) respondToMotion(motion.kind);
              if (cue.emotion) {
                if (candidateId === cue.emotion.id) candidateFrames += 1;
                else { candidateId = cue.emotion.id; candidateFrames = 1; }
                const changedRecently = Date.now() - lastInteractionRef.current < 1800;
                if (candidateFrames >= 3 && !changedRecently && emotionRef.current.id !== cue.emotion.id) {
                  emotionRef.current = cue.emotion;
                  setEmotion(cue.emotion);
                  setRecentMoods((items) => [{ id: cue.emotion.id, name: cue.emotion.name, source: 'Camera cue' }, ...items].slice(0, 4));
                  playChirp(soundRef.current, cue.emotion.family === 'spicy' ? 260 : 560);
                  lastAutoMoodRef.current = Date.now();
                }
              } else {
                candidateId = '';
                candidateFrames = 0;
              }
            }
          }
          animationFrame = requestAnimationFrame(detect);
        }

        animationFrame = requestAnimationFrame(detect);
      } catch {
        if (active) {
          setVisionStatus('error');
          setCameraError('The local vision model could not load. Camera frames are not sent anywhere.');
        }
      }
    }

    observe();
    return () => {
      active = false;
      cancelAnimationFrame(animationFrame);
      landmarker?.close();
    };
  }, [cameraActive]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (cameraActive || Date.now() - lastInteractionRef.current < 28000 || Date.now() - lastAutoMoodRef.current < 24000) return;
      const next = chooseIdleMood(affectionRef.current, emotionRef.current.id);
      emotionRef.current = next;
      setEmotion(next);
      setRecentMoods((items) => [{ id: next.id, name: next.name, source: 'Just hanging out' }, ...items].slice(0, 4));
      lastAutoMoodRef.current = Date.now();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [cameraActive]);

  function announce(message) {
    setToast(message);
    window.clearTimeout(toastRef.current);
    toastRef.current = window.setTimeout(() => setToast(''), 1900);
  }

  function changeMood(next, reward = false) {
    lastInteractionRef.current = Date.now();
    emotionRef.current = next;
    setEmotion(next);
    setRecentMoods((items) => [{ id: next.id, name: next.name, source: 'Your interaction' }, ...items].slice(0, 4));
    setInteractionCount((count) => count + 1);
    playChirp(soundEnabled, next.family === 'spicy' ? 260 : next.family === 'tender' ? 390 : 520);
    window.clearTimeout(decayRef.current);
    if (next.id !== 'curious' && !cameraActive) decayRef.current = window.setTimeout(() => {
      emotionRef.current = getEmotion('curious');
      setEmotion(getEmotion('curious'));
    }, 8500);
    if (reward) setAffection((value) => Math.min(100, value + 1));
  }

  function react(kind) {
    changeMood(chooseReaction(kind, affection, emotion.id), ['pet', 'wave', 'breathe', 'cheer'].includes(kind));
    announce(({ pet: 'A happy little head pat.', wave: 'A wave right back at you.', breathe: 'Taking a slow breath together.', cheer: 'That calls for a celebration.' })[kind] ?? 'Boop!');
    if (navigator.vibrate) navigator.vibrate(kind === 'pet' ? [12, 25, 12] : 16);
  }

  async function toggleCamera() {
    if (cameraActive) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraActive(false);
      setCameraError('');
      announce('Camera paused. Nothing was recorded.');
      return;
    }
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { await DeviceMotionEvent.requestPermission(); } catch { /* Landmark motion detection remains available. */ }
      }
      streamRef.current = stream;
      setCameraActive(true);
    } catch { setCameraError('Camera permission was unavailable. You can still play with Eilik.'); }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Eilik home"><span className="brand-symbol"><i /><i /></span><span>EILIK<span className="brand-light"> / VISION</span></span></a>
        <div className="topbar-right"><div className="privacy-note"><ShieldCheck size={15} /><span>Private, on-device vision</span></div><button className="icon-button" title={soundEnabled ? 'Mute sounds' : 'Enable sounds'} aria-label={soundEnabled ? 'Mute sounds' : 'Enable sounds'} onClick={() => setSoundEnabled((value) => !value)}>{soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}</button></div>
      </header>

      <div className="main-layout" id="home">
        <section className="companion-column" aria-label="Companion">
          <div className="companion-heading"><div><span className="eyebrow"><span className="live-dot" /> YOUR LITTLE COMPANION</span><h1>Here with you<span className="heading-period">.</span></h1></div></div>
          <div className="face-wrap"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span className="orbit-label orbit-label-top">EILIK No. 01</span><span className="orbit-label orbit-label-bottom">MOOD / {String(emotion.number).padStart(2, '0')}</span><Face emotion={emotion} cameraActive={cameraActive} videoRef={videoRef} onTouch={() => react('tap')} onSwipe={() => react('pet')} /><div className="affection-badge"><span className="affection-icon"><Heart size={13} fill="currentColor" /></span><span><strong>{affection}%</strong><small>bond</small></span></div></div>
          <div className="mood-readout" aria-live="polite"><div className="mood-readout-label"><span>RIGHT NOW</span><span className="mood-family">{emotion.familyName}</span></div><div className="mood-main"><div><h2>{emotion.name}</h2><p>{emotion.description}</p></div><span className="mood-level"><i /><i /><i /></span></div></div>
          <div className="quick-actions" aria-label="Quick interactions"><button onClick={() => react('pet')}><span className="action-icon">♡</span><span>Head pat</span></button><button onClick={() => react('wave')}><span className="action-icon">↗</span><span>Wave hello</span></button><button onClick={() => react('breathe')}><Waves size={16} /><span>Breathe</span></button><button onClick={() => react('cheer')}><Sparkles size={16} /><span>Celebrate</span></button></div>
          <div className="camera-disclosure"><div className="camera-disclosure-icon"><ShieldCheck size={17} /></div><p><strong>Your camera stays yours.</strong> Model files download from a CDN; video frames never leave this device. Face cues can be imperfect and are not a measure of how you truly feel.</p><Info size={16} className="disclosure-info" /></div>
          {cameraError && <p className="camera-error" role="status">{cameraError}</p>}
        </section>

        <aside className="insight-panel" aria-label="Companion intelligence">
          <div className="insight-heading"><div><span className="eyebrow">COMPANION INTELLIGENCE</span><h2>Noticing the little things<span className="heading-period">.</span></h2></div><div className={`engine-light engine-${visionStatus}`} title={`Vision status: ${visionStatus}`}><span /></div></div>
          <div className="insight-status"><Activity size={15} /><span>{visionStatus === 'ready' ? 'On-device vision is active' : visionStatus === 'loading' ? 'Preparing local vision model' : visionStatus === 'error' ? 'Vision unavailable' : 'Quietly keeping you company'}</span><span className="status-live">{visionStatus === 'ready' ? 'LIVE' : 'READY'}</span></div>

          <div className={`signal-card ${cameraActive ? 'signal-active' : ''}`}>
            <div className="signal-card-header"><span>{cameraActive ? 'LIVE OBSERVATION' : 'CAMERA OBSERVATION'}</span><span className="signal-private"><ShieldCheck size={13} /> LOCAL</span></div>
            <div className="signal-visual"><div className="signal-orbit"><div className="signal-center"><span className={cameraActive ? 'signal-eye active' : 'signal-eye'} /></div><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
            <strong className="signal-label">{visionStatus === 'loading' ? 'Warming up my eyes' : visionStatus === 'error' ? 'I can still keep you company' : observedCue.label}</strong>
            <p className="signal-description">{cameraActive ? (observedCue.facePresent ? 'A visual cue, not a verdict about how you feel. Try nodding or shaking your head.' : 'Looking for a face in the frame.') : 'I learn from little interactions. Turn on the camera if you want me to notice expressions and head movement.'}</p>
            <div className="signal-metrics"><div><span>FACE IN FRAME</span><strong>{cameraActive ? (observedCue.facePresent ? 'YES' : 'SEARCHING') : 'CAMERA OFF'}</strong></div><div><span>EXPRESSION SIGNAL</span><strong>{observedCue.confidence ? `${observedCue.confidence}%` : '—'}</strong></div></div>
            {!cameraActive && <button className="start-camera" onClick={toggleCamera}><Camera size={15} />Turn on local vision</button>}
            {cameraActive && <button className="stop-camera" onClick={toggleCamera}><CameraOff size={14} />Pause camera</button>}
          </div>

          <div className="companion-learning"><div className="learning-heading"><span className="eyebrow">OUR LITTLE HISTORY</span><span className="interaction-total">{interactionCount} interactions</span></div><div className="mood-trail">{recentMoods.map((item, index) => <div className={`trail-row ${index === 0 ? 'trail-current' : ''}`} key={`${item.id}-${index}`}><span className={`trail-dot trail-${getEmotion(item.id).family}`} /><span className="trail-name">{item.name}</span><span className="trail-source">{item.source}</span></div>)}</div></div>
          <div className="insight-footer"><span><span className="footer-dot" />50 MOODS, CHOSEN IN THE MOMENT</span><span>{affection}% BOND</span></div>
        </aside>
      </div>

      <footer className="app-footer"><span>SMALL FRIEND. BIG FEELINGS.</span><span><Mic2 size={13} /> LOCAL INTERACTIONS ONLY</span><span>BUILT FOR THE IN-BETWEEN</span></footer>
      {toast && <div className="toast" role="status"><Sparkles size={15} />{toast}</div>}
    </main>
  );
}

export default App;