/* ============================================================
   THE GALLOWS — Hangman
   script.js  |  Game logic + Web Audio sound engine
   ============================================================ */

"use strict";

const DIFF_LENGTHS = {
  easy: (w) => w.length <= 5,
  medium: (w) => w.length >= 6 && w.length <= 8,
  hard: (w) => w.length >= 9,
};

const BODY_PARTS = ["p-head", "p-body", "p-larm", "p-rarm", "p-lleg", "p-rleg"];
const MAX_WRONG = 6;

/* ── WEB AUDIO ENGINE ────────────────────────────────────── */
let audioCtx = null;
function getAC() {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone(freq, freq2, type, dur, vol, attack, delay = 0) {
  try {
    const ac = getAC();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = type;
    const t = ac.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t);
    if (freq2 !== freq)
      osc.frequency.exponentialRampToValueAtTime(freq2, t + dur * 0.8);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.setValueAtTime(vol * 0.8, t + dur - 0.1);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  } catch (e) {}
}

function noise(dur = 0.1, vol = 0.2, lofreq = 300, delay = 0) {
  try {
    const ac = getAC();
    const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const flt = ac.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.value = lofreq;
    const gain = ac.createGain();
    const t = ac.currentTime + delay;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(flt);
    flt.connect(gain);
    gain.connect(ac.destination);
    src.start(t);
    src.stop(t + dur);
  } catch (e) {}
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

const SFX = {
  correct() {
    vibrate(15);
    // Typewriter click + bell ding
    noise(0.08, 0.4, 3000); // Sharp mechanical clack
    tone(1400, 1400, "sine", 0.4, 0.3, 0.01, 0.05); // Bell fundamental
    tone(2800, 2800, "sine", 0.3, 0.1, 0.01, 0.05); // Bell harmonic
  },
  wrong() {
    vibrate([40, 50, 40]);
    // Heavy rubber stamp "Thud-Thud" on the case file
    noise(0.12, 0.6, 250);
    tone(100, 60, "square", 0.12, 0.5, 0.01, 0);
    noise(0.15, 0.7, 200, 0.15);
    tone(80, 40, "square", 0.15, 0.6, 0.01, 0.15);
  },
  duplicate() {
    vibrate(30);
    // Paper rustle / scratching out a mistake
    noise(0.1, 0.25, 1200);
    noise(0.08, 0.3, 1000, 0.08);
    noise(0.12, 0.2, 1500, 0.15);
  },
  win() {
    vibrate([50, 50, 100, 50, 150]);
    // Rapid typewriter clacks + final satisfying ding and stamp
    for (let i = 0; i < 5; i++) {
      noise(0.05, 0.3, 2000, i * 0.08);
      tone(800, 700, "square", 0.04, 0.1, 0.005, i * 0.08);
    }
    tone(1200, 1200, "sine", 0.6, 0.4, 0.01, 0.4);
    tone(2400, 2400, "sine", 0.4, 0.2, 0.01, 0.4);
    noise(0.2, 0.5, 300, 0.5);
    tone(90, 50, "square", 0.2, 0.4, 0.01, 0.5);
  },
  lose() {
    vibrate([150, 50, 200]);
    // Jail cell door slam (metal latch clank + heavy reverberating slam)
    noise(0.1, 0.5, 1000);
    tone(300, 150, "sawtooth", 0.2, 0.4, 0.01);
    noise(0.4, 0.7, 300, 0.1);
    tone(120, 60, "square", 0.4, 0.6, 0.01, 0.1);
    tone(60, 30, "sawtooth", 0.4, 0.5, 0.01, 0.1);
    noise(0.8, 0.3, 150, 0.1);
  },
  keyClick() {
    vibrate(10);
    // Analog typewriter key press
    noise(0.03, 0.2, 2500);
    tone(900, 600, "square", 0.04, 0.1, 0.002);
  },
  pageFlip() {
    // Flipping a paper file folder
    noise(0.12, 0.3, 1500);
    noise(0.15, 0.2, 800, 0.05);
  },
  timerTick() {
    tone(1200, 1200, "sine", 0.04, 0.12, 0.002);
  },
  wordReveal() {
    [261, 329, 392].forEach((f, i) =>
      tone(f, f * 1.02, "sine", 0.3, 0.2, 0.005, i * 0.07),
    );
  },
};

let ambienceNode = null;
let sirenTimeout = null;
function startAmbience() {
  if (ambienceNode) return;
  try {
    const ac = getAC();
    const dur = 10;
    const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    ambienceNode = ac.createBufferSource();
    ambienceNode.buffer = buf;
    ambienceNode.loop = true;

    const flt = ac.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.value = 400; // Rain / muffled room tone

    const gain = ac.createGain();
    gain.gain.value = 0.15; // Quiet background

    ambienceNode.connect(flt);
    flt.connect(gain);
    gain.connect(ac.destination);
    ambienceNode.start();

    playSiren();
  } catch (e) {}
}

function playSiren() {
  if (!ambienceNode) return;
  try {
    const ac = getAC();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);

    osc.type = "sine";
    const now = ac.currentTime;
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(800, now + 2);
    osc.frequency.linearRampToValueAtTime(600, now + 4);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.02, now + 2);
    gain.gain.linearRampToValueAtTime(0, now + 4);

    osc.start(now);
    osc.stop(now + 4);

    sirenTimeout = setTimeout(playSiren, Math.random() * 20000 + 15000);
  } catch (e) {}
}

function stopAmbience() {
  if (ambienceNode) {
    try {
      ambienceNode.stop();
    } catch (e) {}
    ambienceNode = null;
  }
  clearTimeout(sirenTimeout);
}

/* ── STATE ───────────────────────────────────────────────── */
let state = {};

function freshState(isCampaign = false) {
  const oldScore = isCampaign ? state.score || 0 : 0;
  const oldStage = isCampaign ? state.campaignStage || 0 : 0;
  const oldMode = isCampaign
    ? state.gameMode || "normal"
    : document.querySelector(".mode-btn.active")?.dataset.mode || "normal";
  return {
    word: "",
    hint: "",
    category: "",
    difficulty: "easy",
    gameMode: oldMode,
    isCampaign: isCampaign,
    campaignStage: isCampaign ? oldStage + 1 : 0,
    maxCampaignStages: 5,
    guessed: new Set(),
    wrongGuesses: [],
    correctCount: 0,
    wrongCount: 0,
    maxWrong: MAX_WRONG,
    gameOver: false,
    won: false,
    timerInterval: null,
    elapsedSeconds: 0,
    timeRemaining: 60,
    score: oldScore,
    tools: {glass: 1, informant: 1, bribe: 1},
  };
}

/* ── DOM & RECORDS ───────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const screens = {
  title: $("screenTitle"),
  game: $("screenGame"),
  result: $("screenResult"),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  screens[name].classList.add("screen-enter");
  setTimeout(() => screens[name].classList.remove("screen-enter"), 400);
}



/* ── WORD SELECTION ──────────────────────────────────────── */
let wordBankCache = {};

async function fetchWordBank(cat) {
  if (cat === "all") {
    const cats = [
      "animals",
      "countries",
      "movies",
      "science",
      "food",
      "technology",
      "music",
      "mythology",
    ];
    let combined = [];
    for (let c of cats) {
      const data = await fetchWordBank(c);
      combined = combined.concat(data);
    }
    return combined;
  }

  if (wordBankCache[cat]) return wordBankCache[cat];

  try {
    const response = await fetch(`Words/${cat}.json`);
    const data = await response.json();
    wordBankCache[cat] = data;
    return data;
  } catch (e) {
    console.error("Failed to load category:", cat, e);
    return [];
  }
}

async function pickWordAsync(diff, cat) {
  const pool = await fetchWordBank(cat);
  if (!pool || !pool.length)
    return {word: "ERROR", hint: "Network error loading words", diff: "easy"};

  const filtered = pool.filter((entry) => {
    const byDiff =
      diff === "all" ? true : (DIFF_LENGTHS[diff]?.(entry.word) ?? true);
    return byDiff;
  });
  const source = filtered.length ? filtered : pool;
  return source[Math.floor(Math.random() * source.length)];
}

/* ── TIMER ───────────────────────────────────────────────── */
function startTimer() {
  clearInterval(state.timerInterval);
  state.elapsedSeconds = 0;
  state.timeRemaining = 60;
  updateTimerUI();

  state.timerInterval = setInterval(() => {
    if (state.gameMode === "interrogation") {
      state.timeRemaining--;
      if (state.timeRemaining < 15) {
        $("tbTimer").classList.add("timer-danger");
        SFX.timerTick();
      }
      if (state.timeRemaining <= 0) {
        endGame(false, "TIMEOUT");
      }
    } else {
      state.elapsedSeconds++;
    }
    updateTimerUI();
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  $("tbTimer").classList.remove("timer-danger");
}

function updateTimerUI() {
  if (state.gameMode === "interrogation") {
    const s = state.timeRemaining;
    $("tbTimer").textContent = `0:${s.toString().padStart(2, "0")}`;
  } else {
    const m = Math.floor(state.elapsedSeconds / 60);
    const s = state.elapsedSeconds % 60;
    $("tbTimer").textContent = `${m}:${s.toString().padStart(2, "0")}`;
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/* ── GAME LIFECYCLE ──────────────────────────────────────── */
async function startGame(isCampaign = false, customWordObj = null) {
  const diff =
    document.querySelector(".opt-btn.active")?.dataset.diff || "easy";
  const cat = document.querySelector(".cat-btn.active")?.dataset.cat || "all";

  state = freshState(isCampaign);

  // If campaign, scale difficulty based on stage
  let activeDiff = diff;
  if (state.isCampaign) {
    if (state.campaignStage >= 4) activeDiff = "hard";
    else if (state.campaignStage >= 2) activeDiff = "medium";
    else activeDiff = "easy";
    $("campaignCell").style.display = "flex";
    $("tbCampaign").textContent =
      `Stage ${state.campaignStage}/${state.maxCampaignStages}`;
  } else {
    $("campaignCell").style.display = "none";
  }

  $("btnStart").disabled = true;
  $("btnCampaign").disabled = true;

  const entry = customWordObj
    ? customWordObj
    : await pickWordAsync(activeDiff, cat);

  $("btnStart").disabled = false;
  $("btnCampaign").disabled = false;
  state.word = entry.word.toUpperCase();
  state.hint = entry.hint;
  state.category =
    cat === "all" ? entry.diff.toUpperCase() + " LEVEL" : cat.toUpperCase();

  $("tbCategory").textContent = state.category;
  $("tbScore").textContent = state.score;

  resetGallows();
  resetTools();
  document.querySelector(".vignette").classList.add("flicker");
  $("resultBadge").classList.remove("result-stamp-anim");

  $("hintText").textContent = state.hint;
  $("hintDiff").textContent =
    `DIFFICULTY: ${activeDiff.toUpperCase()} · ${state.word.length} LETTERS`;
  $("hintStamp").textContent = "OPEN";
  $("hintStamp").className = "hint-stamp";

  renderWordDisplay();
  buildKeyboard();

  $("wrongLetters").innerHTML = '<span class="wrong-empty">none yet</span>';
  renderAttemptPips();
  $("attLeft").textContent = MAX_WRONG;

  setStatus("Make your first deduction, Detective.", "neutral");
  updateProgress();

  $("wordMeta").textContent = `${state.word.length}-letter word`;

  showScreen("game");
  startTimer();
  SFX.pageFlip();
  startAmbience();
}

function resetGallows() {
  BODY_PARTS.forEach((id) => {
    const el = $(id);
    if (el) {
      el.style.display = "none";
      el.classList.remove("g-part-appear");
    }
  });
  ["f-leye", "f-leye2", "f-reye", "f-reye2", "f-mouth"].forEach((id) => {
    const el = $(id);
    if (el) el.style.display = "none";
  });
}

/* ── TOOLS ───────────────────────────────────────────────── */
function resetTools() {
  $("toolGlass").disabled = false;
  $("toolInformant").disabled = false;
  $("toolBribe").disabled = false;
}

function useTool(type) {
  if (state.gameOver || state.tools[type] <= 0) return;
  state.tools[type]--;

  if (type === "glass") {
    $("toolGlass").disabled = true;
    SFX.pageFlip();
    const missing = state.word
      .split("")
      .filter((c) => c !== " " && !state.guessed.has(c));
    if (missing.length > 0) {
      const char = missing[Math.floor(Math.random() * missing.length)];
      setStatus(`Magnifying Glass revealed: "${char}"`, "neutral");
      guessLetter(char, true);
    }
  } else if (type === "informant") {
    $("toolInformant").disabled = true;
    SFX.pageFlip();
    // Informant gives a free hint message and reveals a vowel if possible
    const vowels = state.word
      .split("")
      .filter((c) => "AEIOU".includes(c) && !state.guessed.has(c));
    const pool =
      vowels.length > 0
        ? vowels
        : state.word
            .split("")
            .filter((c) => c !== " " && !state.guessed.has(c));
    if (pool.length > 0) {
      const char = pool[Math.floor(Math.random() * pool.length)];
      setStatus(`Informant tipped you off to: "${char}"`, "neutral");
      guessLetter(char, true);
    }
  } else if (type === "bribe") {
    $("toolBribe").disabled = true;
    SFX.pageFlip();
    if (state.wrongCount > 0) {
      state.wrongCount--;
      // Hide the last shown body part
      const id = BODY_PARTS[state.wrongCount];
      const el = $(id);
      if (el) el.style.display = "none";
      renderAttemptPips();
      $("attLeft").textContent = MAX_WRONG - state.wrongCount;
      setStatus("Bribe accepted. One attempt restored.", "neutral");
    } else {
      setStatus("Bribe wasted. No attempts to restore.", "wrong");
    }
  }
}

/* ── RENDER WORD ─────────────────────────────────────────── */
function renderWordDisplay(flashCorrect = false) {
  const display = $("wordDisplay");
  display.innerHTML = "";

  state.word.split("").forEach((ch, i) => {
    const slot = document.createElement("div");
    slot.className = "letter-slot";

    if (ch === " ") {
      slot.classList.add("space-slot");
    } else {
      const charEl = document.createElement("div");
      charEl.className = "letter-char";
      charEl.id = `slot-${i}`;
      const underline = document.createElement("div");
      underline.className = "letter-underline";

      if (state.guessed.has(ch)) {
        charEl.textContent = ch;
        if (flashCorrect) charEl.classList.add("revealed");
      } else {
        charEl.textContent = "";
      }

      slot.appendChild(charEl);
      slot.appendChild(underline);
    }
    display.appendChild(slot);
  });

  if (flashCorrect) {
    display.classList.remove("word-correct-flash");
    void display.offsetWidth;
    display.classList.add("word-correct-flash");
    setTimeout(() => display.classList.remove("word-correct-flash"), 500);
  }
}

/* ── KEYBOARD ────────────────────────────────────────────── */
function buildKeyboard() {
  const kb = $("keyboard");
  kb.innerHTML = "";
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.,':".split("").forEach((letter) => {
    const btn = document.createElement("button");
    btn.className = "key-btn";
    btn.textContent = letter;
    btn.dataset.letter = letter;
    btn.addEventListener("click", () => guessLetter(letter, false));
    kb.appendChild(btn);
  });
}

function updateKeyboard() {
  document.querySelectorAll(".key-btn").forEach((btn) => {
    const letter = btn.dataset.letter;
    if (state.guessed.has(letter)) {
      if (state.word.includes(letter)) {
        btn.className = "key-btn used-correct";
      } else {
        btn.className = "key-btn used-wrong";
      }
      btn.disabled = true;
    }
  });
}

/* ── GUESSING ────────────────────────────────────────────── */
function guessLetter(letter, fromTool = false) {
  letter = letter.toUpperCase();
  if (state.gameOver) return;
  if (!/^[A-Z0-9.,\-':]$/.test(letter)) return;

  if (state.guessed.has(letter)) {
    SFX.duplicate();
    setStatus(`"${letter}" was already interrogated. Pick another.`, "dupe");
    shakeLetter(letter);
    return;
  }

  if (!fromTool) SFX.keyClick();
  state.guessed.add(letter);

  if (state.word.includes(letter)) {
    onCorrectGuess(letter, fromTool);
  } else {
    onWrongGuess(letter, fromTool);
  }

  updateKeyboard();
  checkEndCondition();
}

function onCorrectGuess(letter, fromTool) {
  state.correctCount++;
  const occurrences = state.word.split("").filter((c) => c === letter).length;

  const letterScore = Math.max(10, 50 - (occurrences - 1) * 10);
  state.score += letterScore;
  $("tbScore").textContent = state.score;

  if (!fromTool) SFX.correct();
  renderWordDisplay(true);
  updateProgress();

  if (!fromTool) {
    const msg =
      occurrences > 1
        ? `✓ "${letter}" appears ${occurrences} times! +${letterScore} pts`
        : `✓ "${letter}" is in the word! +${letterScore} pts`;
    setStatus(msg, "correct");
  }
}

function onWrongGuess(letter, fromTool) {
  state.wrongCount++;
  state.wrongGuesses.push(letter);

  if (!fromTool) SFX.wrong();
  revealBodyPart(state.wrongCount - 1);
  renderWrongLetters();
  renderAttemptPips();
  $("attLeft").textContent = MAX_WRONG - state.wrongCount;

  if (!fromTool) {
    const remaining = MAX_WRONG - state.wrongCount;
    const msgs = [
      `✗ "${letter}" not found. ${remaining} attempts left.`,
      `✗ "${letter}" is a dead end. ${remaining} left.`,
      `✗ No "${letter}" here. ${remaining} attempts remaining.`,
      `✗ Wrong lead, detective. ${remaining} left.`,
    ];
    setStatus(msgs[Math.floor(Math.random() * msgs.length)], "wrong");
  }
}

/* ── GALLOWS DRAWING ─────────────────────────────────────── */
function revealBodyPart(index) {
  const id = BODY_PARTS[index];
  const el = $(id);
  if (!el) return;
  el.style.display = "";
  el.classList.add("g-part-appear");

  const frame = $("gallowsSvg");
  frame.classList.remove("gallows-shake");
  void frame.offsetWidth;
  frame.classList.add("gallows-shake");
  setTimeout(() => frame.classList.remove("gallows-shake"), 400);
}

function revealDeadFace() {
  ["f-leye", "f-leye2", "f-reye", "f-reye2", "f-mouth"].forEach((id) => {
    const el = $(id);
    if (el) el.style.display = "";
  });
}

/* ── ATTEMPT PIPS ────────────────────────────────────────── */
function renderAttemptPips() {
  const container = $("attPips");
  container.innerHTML = "";
  for (let i = 0; i < MAX_WRONG; i++) {
    const pip = document.createElement("div");
    pip.className = "att-pip" + (i < state.wrongCount ? " used" : "");
    container.appendChild(pip);
  }
}

/* ── WRONG LETTERS ───────────────────────────────────────── */
function renderWrongLetters() {
  const container = $("wrongLetters");
  container.innerHTML = "";
  if (state.wrongGuesses.length === 0) {
    container.innerHTML = '<span class="wrong-empty">none yet</span>';
    return;
  }
  state.wrongGuesses.forEach((letter) => {
    const span = document.createElement("span");
    span.className = "wrong-letter";
    span.textContent = letter;
    container.appendChild(span);
  });
}

/* ── PROGRESS ────────────────────────────────────────────── */
function updateProgress() {
  const unique = [...new Set(state.word.split(""))].filter((c) => c !== " ");
  const found = unique.filter((c) => state.guessed.has(c)).length;
  const pct = unique.length > 0 ? Math.round((found / unique.length) * 100) : 0;

  $("progFill").style.width = pct + "%";
  $("progText").textContent =
    `${found} / ${unique.length} unique letters found`;
}

/* ── STATUS BAR ──────────────────────────────────────────── */
function setStatus(msg, type) {
  const bar = $("statusBar");
  bar.textContent = msg;
  bar.className = "status-bar " + type;
}

/* ── END CONDITION ───────────────────────────────────────── */
function checkEndCondition() {
  const allGuessed = state.word
    .split("")
    .filter((c) => c !== " ")
    .every((c) => state.guessed.has(c));
  if (allGuessed) {
    endGame(true);
    return;
  }

  if (state.wrongCount >= MAX_WRONG) {
    endGame(false);
    return;
  }
}

function endGame(won, reason = "") {
  state.gameOver = true;
  state.won = won;
  stopTimer();

  document.querySelectorAll(".key-btn").forEach((btn) => (btn.disabled = true));
  $("hintStamp").textContent = won ? "SOLVED" : "FAILED";
  $("hintStamp").className = "hint-stamp" + (won ? "" : " closed");
  document.querySelector(".vignette").classList.remove("flicker");

  if (won) {
    const attBonus = (MAX_WRONG - state.wrongCount) * 25;
    const speedBonus =
      state.gameMode === "interrogation"
        ? state.timeRemaining * 5
        : Math.max(0, 200 - state.elapsedSeconds * 2);
    state.score += attBonus + speedBonus;
    $("tbScore").textContent = state.score;
    SFX.win();
    setStatus(`🏆 CASE SOLVED! The word was "${state.word}"`, "correct");
    renderWordDisplay(true);
  } else {
    revealDeadFace();
    SFX.lose();
    if (reason === "TIMEOUT") {
      setStatus(`⏰ TIME EXPIRED! The word was "${state.word}"`, "wrong");
    } else {
      setStatus(`💀 CASE FAILED! The word was "${state.word}"`, "wrong");
    }
    state.word.split("").forEach((c) => state.guessed.add(c));
    renderWordDisplay();
  }

  setTimeout(() => buildResultScreen(won), 1400);
}

/* ── RESULT SCREEN ───────────────────────────────────────── */
function buildResultScreen(won) {
  if (won) vibrate(100);
  else vibrate(150);

  $("resultBadge").textContent = won ? "⚖" : "💀"; // Reverted to justice scales for win to fit theme
  $("resultBadge").classList.add("result-stamp-anim");
  $("resultHeading").textContent = won ? "CASE CLOSED" : "CASE FAILED";
  $("resultHeading").className = "result-heading " + (won ? "win" : "lose");

  if (state.isCampaign && won) {
    if (state.campaignStage >= state.maxCampaignStages) {
      $("resultFlavor").textContent =
        "Campaign complete! Outstanding detective work.";
    } else {
      $("resultFlavor").textContent =
        `Stage ${state.campaignStage} complete. The plot thickens...`;
    }
  } else {
    $("resultFlavor").textContent = won
      ? "Outstanding deduction, Detective. The suspect has been identified."
      : "You have been bested this time. The rope has claimed another.";
  }

  $("rwbWord").textContent = state.word;

  const total = state.correctCount + state.wrongCount;
  const acc =
    total > 0 ? Math.round((state.correctCount / total) * 100) + "%" : "—";

  $("rScore").textContent = state.score;
  $("rTime").textContent =
    state.gameMode === "interrogation"
      ? `${60 - state.timeRemaining}s`
      : formatTime(state.elapsedSeconds);
  $("rAttempts").textContent = `${MAX_WRONG - state.wrongCount} / ${MAX_WRONG}`;
  $("rCorrect").textContent = state.correctCount;
  $("rWrong").textContent = state.wrongCount;
  $("rAccuracy").textContent = acc;

  if (
    state.isCampaign &&
    won &&
    state.campaignStage < state.maxCampaignStages
  ) {
    $("btnNextCampaign").classList.remove("hidden");
    $("btnNewCase").classList.add("hidden");
  } else {
    $("btnNextCampaign").classList.add("hidden");
    $("btnNewCase").classList.remove("hidden");
  }

  showScreen("result");
}

/* ── KEYBOARD INPUT ──────────────────────────────────────── */
function onKeyDown(e) {
  if (state.gameOver) return;
  if (screens.game.classList.contains("hidden")) return;
  const key = e.key.toUpperCase();
  if (/^[A-Z0-9.,\-':]$/.test(key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    guessLetter(key, false);
  }
}

/* ── SHAKE LETTER (duplicate) ────────────────────────────── */
function shakeLetter(letter) {
  document.querySelectorAll(".key-btn").forEach((btn) => {
    if (btn.dataset.letter === letter) {
      btn.animate(
        [
          {transform: "translateX(-5px)"},
          {transform: "translateX(5px)"},
          {transform: "translateX(-3px)"},
          {transform: "translateX(3px)"},
          {transform: "translateX(0)"},
        ],
        {duration: 300, easing: "ease-out"},
      );
    }
  });
}

/* ── INIT ────────────────────────────────────────────────── */
function init() {
  showScreen("title");

  // Difficulty & Mode buttons
  document.querySelectorAll(".opt-btn, .mode-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const isModeBtn = btn.classList.contains("mode-btn");
      const selector = isModeBtn ? ".mode-btn" : ".opt-btn";
      document
        .querySelectorAll(selector)
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      SFX.keyClick();
    });
  });

  // Category buttons
  document.querySelectorAll(".cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".cat-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      SFX.keyClick();
    });
  });

  // Tools
  $("toolGlass").addEventListener("click", () => useTool("glass"));
  $("toolInformant").addEventListener("click", () => useTool("informant"));
  $("toolBribe").addEventListener("click", () => useTool("bribe"));

  // Start Normal
  $("btnStart").addEventListener("click", () => {
    SFX.pageFlip();
    startGame(false);
  });

  // Start Campaign
  $("btnCampaign").addEventListener("click", () => {
    SFX.pageFlip();
    startGame(true);
  });

  // Next Campaign Stage
  $("btnNextCampaign").addEventListener("click", () => {
    SFX.pageFlip();
    startGame(true);
  });

  // Custom Case Modal
  const btnCustom = $("btnCustom");
  if (btnCustom) {
    btnCustom.addEventListener("click", () => {
      SFX.pageFlip();
      showScreen("modalCustom");
    });
  }

  const btnCancelCustom = $("btnCancelCustom");
  if (btnCancelCustom) {
    btnCancelCustom.addEventListener("click", () => {
      SFX.keyClick();
      showScreen("title");
    });
  }

  const btnStartCustom = $("btnStartCustom");
  if (btnStartCustom) {
    btnStartCustom.addEventListener("click", () => {
      const w = $("customWord").value.trim().toUpperCase();
      const h = $("customHint").value.trim();
      if (!w) return alert("You must enter a secret word!");
      if (!/^[A-Z0-9.,\-': ]+$/.test(w))
        return alert(
          "Invalid characters. Only letters, numbers, and basic punctuation allowed.",
        );

      $("customWord").value = "";
      $("customHint").value = "";
      SFX.pageFlip();
      startGame(false, {word: w, hint: h, diff: "custom"});
    });
  }

  // Quit
  $("btnQuit").addEventListener("click", () => {
    stopTimer();
    stopAmbience();
    state.gameOver = true;
    SFX.keyClick();
    showScreen("title");
  });

  // Result screen -> New Case / Menu
  $("btnNewCase").addEventListener("click", () => {
    SFX.pageFlip();
    startGame(false);
  });
  $("btnMenu").addEventListener("click", () => {
    SFX.keyClick();
    stopAmbience();
    showScreen("title");
  });

  document.addEventListener("keydown", onKeyDown);
}

document.addEventListener("DOMContentLoaded", init);
