const familyNames = {
  positive: 'Bright & lively', curious: 'Curious & thinking', tender: 'Soft & sleepy',
  spicy: 'A little grumpy', physical: 'Body feelings', silly: 'Play & oddities',
};

const rows = [
  ['Ecstatic','positive','fireworks','Big smiles and bouncy energy'], ['Happy','positive','smile','A little shared joy'],
  ['Proud','positive','proud','A small win worth celebrating'], ['Playful','positive','wink','A teasing little moment'],
  ['Affectionate','positive','heart','A soft, fond connection'], ['Relieved','positive','relieved','The exhale after a busy moment'],
  ['Grateful','positive','grateful','A gentle thank-you'], ['Enthusiastic','positive','sparkle','Ready for whatever comes next'],
  ['Curious','curious','curious','Something caught my eye'], ['Puzzled','curious','confused','Putting the pieces together'],
  ['Focused','curious','focused','Quietly paying attention'], ['Surprised','curious','surprised','Oh! Did not see that coming'],
  ['Awestruck','curious','awe','Taking in something wonderful'], ['Skeptical','curious','skeptical','Not entirely convinced'],
  ['Thoughtful','curious','thoughtful','Let me think about that'], ['Dreamy','curious','dreamy','Drifting somewhere pleasant'],
  ['Eureka','curious','eureka','A bright little idea'], ['Shy','tender','shy','Peeking out, just a little'],
  ['Sad','tender','sad','A quieter kind of moment'], ['Sleepy','tender','sleepy','Getting cozy and slow'],
  ['Exhausted','tender','exhausted','Running a little low'], ['Timid','tender','timid','Taking things gently'],
  ['Melancholy','tender','melancholy','A soft, rainy-day feeling'], ['Sheepish','tender','sheepish','Oops, was that me?'],
  ['Embarrassed','tender','embarrassed','A tiny bit flustered'], ['Melting','tender','melting','Too much sweetness'],
  ['Grumpy','spicy','grumpy','Hmph. Just a little.'], ['Angry','spicy','angry','A big burst of frustration'],
  ['Needy','spicy','needy','Could use a little attention'], ['Impatient','spicy','impatient','Waiting is the hard part'],
  ['Frustrated','spicy','frustrated','That did not quite work'], ['Stubborn','spicy','stubborn','Not changing my mind yet'],
  ['Grossed out','spicy','disgusted','Ew. Moving on.'], ['Distant','spicy','distant','Taking a little space'],
  ['Suspicious','spicy','suspicious','Something feels a bit off'], ['Dizzy','physical','dizzy','The room is doing a wiggle'],
  ['Ticklish','physical','ticklish','Heehee, that tickles'], ['Sneezing','physical','sneeze','Achoo! Excuse me'],
  ['Hiccuping','physical','hiccup','Hup! That came out of nowhere'], ['Yawning','physical','yawn','A very big yawn'],
  ['Chilly','physical','chilly','Brrr, a little frostbitten'], ['Overheated','physical','hot','Whew, it is warm in here'],
  ['Shocked','physical','shocked','Zzzap!'], ['Bored','silly','bored','Wondering what to do next'],
  ['Smug','silly','smug','I did a pretty good job'], ['Plotting','silly','plotting','Up to absolutely no good'],
  ['Starstruck','silly','starstruck','You are kind of a big deal'], ['Goofy','silly','goofy','Being a little ridiculous'],
  ['Hypnotized','silly','hypnotized','Transfixed by the glow'], ['Zen','silly','zen','One slow breath at a time'],
];

export const emotions = rows.map(([name, family, face, description], index) => ({
  id: name.toLowerCase().replaceAll(' ', '-'), number: index + 1, name, family,
  familyName: familyNames[family], face, description,
}));

export const families = Object.entries(familyNames).map(([id, name]) => ({ id, name }));
export const getEmotion = (id) => emotions.find((emotion) => emotion.id === id) ?? emotions[8];

export function chooseReaction(kind, affection = 0, previousId = '') {
  const choices = {
    pet: ['affectionate', 'happy', 'playful', 'grateful'], wave: ['enthusiastic', 'happy', 'surprised'],
    tap: ['surprised', 'curious', 'goofy'], breathe: ['zen', 'relieved', 'thoughtful'],
    cover: ['grumpy', 'puzzled', 'shy'], cheer: affection >= 85 ? ['starstruck', 'ecstatic', 'proud'] : ['ecstatic', 'proud', 'happy'],
    nod: ['grateful', 'enthusiastic', 'happy'],
    tilt: ['curious', 'thoughtful', 'playful'],
  };
  const options = choices[kind] ?? choices.tap;
  const preferredIndex = Math.min(options.length - 1, Math.floor(affection / 35));
  const preferred = options[preferredIndex];
  return getEmotion(preferred === previousId ? options[(preferredIndex + 1) % options.length] : preferred);
}

export function readHeadMotion(landmarks, history, timestamp) {
  const nose = landmarks?.[1];
  if (!nose) return { kind: null, history };

  const samples = [...history, { x: nose.x, y: nose.y, timestamp }].filter((sample) => timestamp - sample.timestamp < 1200);
  if (samples.length < 4) return { kind: null, history: samples };

  const xValues = samples.map((sample) => sample.x);
  const yValues = samples.map((sample) => sample.y);
  const xRange = Math.max(...xValues) - Math.min(...xValues);
  const yRange = Math.max(...yValues) - Math.min(...yValues);
  const reversals = (axis) => {
    let previousDirection = 0;
    let changes = 0;
    for (let index = 1; index < samples.length; index += 1) {
      const delta = samples[index][axis] - samples[index - 1][axis];
      const direction = Math.abs(delta) > 0.006 ? Math.sign(delta) : 0;
      if (direction && previousDirection && direction !== previousDirection) changes += 1;
      if (direction) previousDirection = direction;
    }
    return changes;
  };

  if (xRange > 0.065 && reversals('x') >= 2) return { kind: 'shake', history: [] };
  if (yRange > 0.065 && reversals('y') >= 1) return { kind: 'nod', history: [] };
  return { kind: null, history: samples };
}

export function readFaceCue(categories = []) {
  const score = (name) => categories.find((item) => item.categoryName === name)?.score ?? 0;
  const smile = (score('mouthSmileLeft') + score('mouthSmileRight')) / 2;
  const frown = (score('mouthFrownLeft') + score('mouthFrownRight')) / 2;
  const browDown = (score('browDownLeft') + score('browDownRight')) / 2;
  const eyeWide = (score('eyeWideLeft') + score('eyeWideRight')) / 2;
  const eyeSquint = (score('eyeSquintLeft') + score('eyeSquintRight')) / 2;
  const jawOpen = score('jawOpen');

  if (jawOpen > 0.38 && eyeWide > 0.24) return { emotion: getEmotion('surprised'), label: 'A surprised expression', confidence: Math.round(Math.max(jawOpen, eyeWide) * 100), smile };
  if (browDown > 0.48 && eyeSquint > 0.28) return { emotion: getEmotion('grumpy'), label: 'A furrowed brow', confidence: Math.round(Math.max(browDown, eyeSquint) * 100), smile };
  if (frown > 0.35 && score('browInnerUp') > 0.24) return { emotion: getEmotion('sad'), label: 'A downturned expression', confidence: Math.round(Math.max(frown, score('browInnerUp')) * 100), smile };
  if (smile > 0.72) return { emotion: getEmotion('ecstatic'), label: 'A big smile', confidence: Math.round(smile * 100), smile };
  if (smile > 0.43) return { emotion: getEmotion('happy'), label: 'A smile', confidence: Math.round(smile * 100), smile };
  return { emotion: null, label: 'Taking in the moment', confidence: 0, smile };
}

export function chooseIdleMood(affection = 0, previousId = '') {
  const moods = affection >= 75 ? ['dreamy', 'thoughtful', 'playful', 'zen'] : ['curious', 'thoughtful', 'bored', 'dreamy'];
  const next = moods.find((id) => id !== previousId) ?? moods[0];
  return getEmotion(next);
}