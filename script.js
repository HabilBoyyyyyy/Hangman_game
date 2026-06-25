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

const SFX = {
  correct() {
    // Typewriter click + bell ding
    noise(0.08, 0.4, 3000); // Sharp mechanical clack
    tone(1400, 1400, "sine", 0.4, 0.3, 0.01, 0.05); // Bell fundamental
    tone(2800, 2800, "sine", 0.3, 0.1, 0.01, 0.05); // Bell harmonic
  },
  wrong() {
    // Heavy rubber stamp "Thud-Thud" on the case file
    noise(0.12, 0.6, 250);
    tone(100, 60, "sine", 0.12, 0.5, 0.01, 0); // was "square" — sine reads as a dull thud, not a blip
    noise(0.15, 0.7, 200, 0.15);
    tone(80, 40, "sine", 0.15, 0.6, 0.01, 0.15); // was "square"
  },
  duplicate() {
    // Paper rustle / scratching out a mistake
    noise(0.1, 0.25, 1200);
    noise(0.08, 0.3, 1000, 0.08);
    noise(0.12, 0.2, 1500, 0.15);
  },
  win() {
    // Rapid typewriter clacks + final satisfying ding and stamp
    for (let i = 0; i < 5; i++) {
      noise(0.05, 0.3, 2000, i * 0.08); // noise alone carries the clack now (no square blip layered in)
    }
    tone(1200, 1200, "sine", 0.6, 0.4, 0.01, 0.4);
    tone(2400, 2400, "sine", 0.4, 0.2, 0.01, 0.4);
    noise(0.2, 0.5, 300, 0.5);
    tone(90, 50, "sine", 0.2, 0.4, 0.01, 0.5); // was "square"
  },
  lose() {
    // Jail cell door slam (metal latch clank + heavy reverberating slam)
    noise(0.1, 0.5, 1000);
    tone(300, 150, "triangle", 0.2, 0.4, 0.01); // was "sawtooth"
    noise(0.4, 0.7, 300, 0.1);
    tone(120, 60, "triangle", 0.4, 0.6, 0.01, 0.1); // was "square"
    tone(60, 30, "triangle", 0.4, 0.5, 0.01, 0.1); // was "sawtooth"
    noise(0.8, 0.3, 150, 0.1);
  },
  keyClick() {
    // Analog typewriter key press
    noise(0.03, 0.25, 2500); // strike
    noise(0.02, 0.15, 4500, 0.01); // brief mechanical clink (replaces the old square blip)
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

/* ── STATE ───────────────────────────────────────────────── */
let state = {};

function freshState() {
  return {
    word: "",
    hint: "",
    category: "",
    difficulty: "easy",
    guessed: new Set(),
    wrongGuesses: [],
    correctCount: 0,
    wrongCount: 0,
    maxWrong: MAX_WRONG,
    gameOver: false,
    won: false,
    timerInterval: null,
    elapsedSeconds: 0,
    score: 0,
  };
}

/* ── DOM ─────────────────────────────────────────────────── */
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
function pickWord(diff, cat) {
  let pool = WORD_BANK[cat] || WORD_BANK.all;
  // Filter by difficulty length
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
  updateTimerUI();
  state.timerInterval = setInterval(() => {
    state.elapsedSeconds++;
    updateTimerUI();
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
}

function updateTimerUI() {
  const m = Math.floor(state.elapsedSeconds / 60);
  const s = state.elapsedSeconds % 60;
  $("tbTimer").textContent = `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/* ── GAME LIFECYCLE ──────────────────────────────────────── */
function startGame() {
  const diff =
    document.querySelector(".opt-btn.active")?.dataset.diff || "easy";
  const cat = document.querySelector(".cat-btn.active")?.dataset.cat || "all";

  state = freshState();
  state.difficulty = diff;

  const entry = pickWord(diff, cat);
  state.word = entry.word.toUpperCase();
  state.hint = entry.hint;
  state.category =
    cat === "all" ? entry.diff.toUpperCase() + " LEVEL" : cat.toUpperCase();

  // Set topbar
  $("tbCategory").textContent = state.category;
  $("tbScore").textContent = "0";

  // Reset gallows
  resetGallows();

  // Set hint card
  $("hintText").textContent = state.hint;
  $("hintDiff").textContent =
    `DIFFICULTY: ${diff.toUpperCase()} · ${state.word.length} LETTERS`;
  $("hintStamp").textContent = "OPEN";
  $("hintStamp").className = "hint-stamp";

  // Build word display
  renderWordDisplay();

  // Build keyboard
  buildKeyboard();

  // Reset wrong letters
  $("wrongLetters").innerHTML = '<span class="wrong-empty">none yet</span>';

  // Reset attempts
  renderAttemptPips();
  $("attLeft").textContent = MAX_WRONG;

  // Reset status
  setStatus("Make your first deduction, Detective.", "neutral");

  // Reset progress
  updateProgress();

  // Metadata
  $("wordMeta").textContent = `${state.word.length}-letter word`;

  showScreen("game");
  startTimer();
  SFX.pageFlip();
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

/* ── RENDER WORD ─────────────────────────────────────────── */
function renderWordDisplay(flashCorrect = false) {
  const display = $("wordDisplay");
  display.innerHTML = "";

  state.word.split("").forEach((ch, i) => {
    const slot = document.createElement("div");
    slot.className = "letter-slot";

    if (ch === " ") {
      // If it's a space, assign a special class and don't add underlines
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
  // Added numbers, apostrophe, and colon to the string
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.,':".split("").forEach((letter) => {
    const btn = document.createElement("button");
    btn.className = "key-btn";
    btn.textContent = letter;
    btn.dataset.letter = letter;
    btn.addEventListener("click", () => guessLetter(letter));
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
function guessLetter(letter) {
  letter = letter.toUpperCase();
  if (state.gameOver) return;
  if (!/^[A-Z0-9.,\-':]$/.test(letter)) return;

  if (state.guessed.has(letter)) {
    SFX.duplicate();
    setStatus(`"${letter}" was already interrogated. Pick another.`, "dupe");
    shakeLetter(letter);
    return;
  }

  SFX.keyClick();
  state.guessed.add(letter);

  if (state.word.includes(letter)) {
    onCorrectGuess(letter);
  } else {
    onWrongGuess(letter);
  }

  updateKeyboard();
  checkEndCondition();
}
function onCorrectGuess(letter) {
  state.correctCount++;
  const occurrences = state.word.split("").filter((c) => c === letter).length;

  // Score: more occurrences = less value (make guessing rare letters rewarding)
  const letterScore = Math.max(10, 50 - (occurrences - 1) * 10);
  state.score += letterScore;
  $("tbScore").textContent = state.score;

  SFX.correct();
  renderWordDisplay(true);
  updateProgress();

  const msg =
    occurrences > 1
      ? `✓ "${letter}" appears ${occurrences} times! +${letterScore} pts`
      : `✓ "${letter}" is in the word! +${letterScore} pts`;
  setStatus(msg, "correct");
}

function onWrongGuess(letter) {
  state.wrongCount++;
  state.wrongGuesses.push(letter);

  SFX.wrong();
  revealBodyPart(state.wrongCount - 1);
  renderWrongLetters();
  renderAttemptPips();
  $("attLeft").textContent = MAX_WRONG - state.wrongCount;

  const remaining = MAX_WRONG - state.wrongCount;
  const msgs = [
    `✗ "${letter}" not found. ${remaining} attempts left.`,
    `✗ "${letter}" is a dead end. ${remaining} left.`,
    `✗ No "${letter}" here. ${remaining} attempts remaining.`,
    `✗ Wrong lead, detective. ${remaining} left.`,
  ];
  setStatus(msgs[Math.floor(Math.random() * msgs.length)], "wrong");
}

/* ── GALLOWS DRAWING ─────────────────────────────────────── */
function revealBodyPart(index) {
  const id = BODY_PARTS[index];
  const el = $(id);
  if (!el) return;
  el.style.display = "";
  el.classList.add("g-part-appear");

  // Shake gallows frame
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
  // Win: all letters (excluding spaces) guessed
  const allGuessed = state.word
    .split("")
    .filter((c) => c !== " ")
    .every((c) => state.guessed.has(c));
  if (allGuessed) {
    endGame(true);
    return;
  }

  // Lose
  if (state.wrongCount >= MAX_WRONG) {
    endGame(false);
    return;
  }
}

function endGame(won) {
  state.gameOver = true;
  state.won = won;
  stopTimer();

  // Disable keyboard
  document.querySelectorAll(".key-btn").forEach((btn) => (btn.disabled = true));

  // Lock hint stamp
  $("hintStamp").textContent = won ? "SOLVED" : "FAILED";
  $("hintStamp").className = "hint-stamp" + (won ? "" : " closed");

  if (won) {
    // Bonus score for remaining attempts + speed
    const attBonus = (MAX_WRONG - state.wrongCount) * 25;
    const speedBonus = Math.max(0, 200 - state.elapsedSeconds * 2);
    state.score += attBonus + speedBonus;
    $("tbScore").textContent = state.score;
    SFX.win();
    setStatus(`🏆 CASE SOLVED! The word was "${state.word}"`, "correct");
    // Reveal whole word with fanfare
    renderWordDisplay(true);
  } else {
    revealDeadFace();
    SFX.lose();
    setStatus(`💀 CASE FAILED! The word was "${state.word}"`, "wrong");
    // Reveal word
    state.word.split("").forEach((c) => state.guessed.add(c));
    renderWordDisplay();
  }

  setTimeout(() => buildResultScreen(won), 1400);
}

/* ── RESULT SCREEN ───────────────────────────────────────── */
function buildResultScreen(won) {
  $("resultBadge").textContent = won ? "🏆" : "💀";
  $("resultHeading").textContent = won ? "CASE CLOSED" : "CASE FAILED";
  $("resultHeading").className = "result-heading " + (won ? "win" : "lose");
  $("resultFlavor").textContent = won
    ? "Outstanding deduction, Detective. The word has been identified."
    : `You have been bested this time. The rope has claimed another.`;

  $("rwbWord").textContent = state.word;

  const total = state.correctCount + state.wrongCount;
  const acc =
    total > 0 ? Math.round((state.correctCount / total) * 100) + "%" : "—";

  $("rScore").textContent = state.score;
  $("rTime").textContent = formatTime(state.elapsedSeconds);
  $("rAttempts").textContent = `${MAX_WRONG - state.wrongCount} / ${MAX_WRONG}`;
  $("rCorrect").textContent = state.correctCount;
  $("rWrong").textContent = state.wrongCount;
  $("rAccuracy").textContent = acc;

  showScreen("result");
}

/* ── KEYBOARD INPUT ──────────────────────────────────────── */
function onKeyDown(e) {
  if (state.gameOver) return;
  if (screens.game.classList.contains("hidden")) return;
  const key = e.key.toUpperCase();
  if (/^[A-Z0-9.,\-':]$/.test(key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    guessLetter(key);
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

  // Difficulty buttons
  document.querySelectorAll(".opt-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".opt-btn")
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

  // Start
  $("btnStart").addEventListener("click", () => {
    SFX.pageFlip();
    startGame();
  });

  // Quit
  $("btnQuit").addEventListener("click", () => {
    stopTimer();
    state.gameOver = true;
    SFX.keyClick();
    showScreen("title");
  });

  // Result screen
  $("btnNewCase").addEventListener("click", () => {
    SFX.pageFlip();
    startGame();
  });
  $("btnMenu").addEventListener("click", () => {
    SFX.keyClick();
    showScreen("title");
  });

  // Physical keyboard
  document.addEventListener("keydown", onKeyDown);
}

document.addEventListener("DOMContentLoaded", init);
