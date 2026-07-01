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

/* ── AUDIO ENGINE ────────────────────────────────────────── */
let isMuted = false;
const audioFiles = {
  bgm: new Audio("Audio/bgm-noir.mp3"),
  key: new Audio("Audio/sfx-key.mp3"),
  correct: new Audio("Audio/sfx-correct.mp3"),
  wrong: new Audio("Audio/sfx-wrong.mp3"),
  duplicate: new Audio("Audio/sfx-duplicate.mp3"),
  win: new Audio("Audio/sfx-win.mp3"),
  lose: new Audio("Audio/sfx-lose.mp3"),
  page: new Audio("Audio/sfx-page.mp3"),
};

// Configure background music
audioFiles.bgm.loop = true;
audioFiles.bgm.volume = 0.4;

function playAudio(id) {
  if (isMuted) return;
  const a = audioFiles[id];
  if (!a) return;

  if (id !== "bgm") {
    // Clone node allows overlapping sounds (e.g. typing quickly)
    const clone = a.cloneNode();
    clone.volume = 0.6;
    clone.play().catch(() => {});
  }
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

const SFX = {
  correct() {
    vibrate(15);
    playAudio("correct");
  },
  wrong() {
    vibrate([40, 50, 40]);
    playAudio("wrong");
  },
  duplicate() {
    vibrate(30);
    playAudio("duplicate");
  },
  win() {
    vibrate([50, 50, 100, 50, 150]);
    playAudio("win");
  },
  lose() {
    vibrate([150, 50, 200]);
    playAudio("lose");
  },
  keyClick() {
    vibrate(10);
    playAudio("key");
  },
  pageFlip() {
    playAudio("page");
  },
  timerTick() {
    if (isMuted) return;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, ac.currentTime);
      gain.gain.setValueAtTime(0, ac.currentTime);
      gain.gain.linearRampToValueAtTime(0.04, ac.currentTime + 0.002);
      gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.12);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + 0.15);
    } catch (e) {}
  },
  wordReveal() {
    if (isMuted) return;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [261, 329, 392].forEach((f, i) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.type = "sine";
        const t = ac.currentTime + i * 0.07;
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 1.02, t + 0.24);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.005);
        gain.gain.setValueAtTime(0.16, t + 0.2);
        gain.gain.linearRampToValueAtTime(0, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    } catch (e) {}
  },
};

function startAmbience() {
  if (isMuted) return;
  audioFiles.bgm.play().catch(() => {});
}

function stopAmbience() {
  audioFiles.bgm.pause();
  audioFiles.bgm.currentTime = 0;
}

function toggleMute() {
  isMuted = !isMuted;
  const btn = document.getElementById("btnAudioToggle");
  if (isMuted) {
    btn.classList.add("muted");
    btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    audioFiles.bgm.pause();
  } else {
    btn.classList.remove("muted");
    btn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    if (
      document.getElementById("screenGame").classList.contains("hidden") ===
      false
    ) {
      startAmbience();
    }
  }
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
async function startGame(isCampaign = false) {
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

  const entry = await pickWordAsync(activeDiff, cat);

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

  // Audio Toggle
  const btnAudioToggle = document.getElementById("btnAudioToggle");
  if (btnAudioToggle) {
    btnAudioToggle.addEventListener("click", toggleMute);
  }

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
