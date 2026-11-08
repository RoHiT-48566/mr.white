import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Eye,
  EyeOff,
  Info,
  Hourglass,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import library from "./data/words.json";
import aceCard from "./assets/01_ace_of_spades.png";
import jackCard from "./assets/02_jack_of_clubs.png";
import jesterCard from "./assets/03_mr_white_joker.png";
import queenCard from "./assets/04_queen_of_hearts.png";
import kingCard from "./assets/05_king_of_diamonds.png";

type Pair = { wordA: string; wordB: string; difficulty: string };
type Category = { id: string; name: string; pairs: Pair[] };
type Player = {
  id: number;
  name: string;
  isMrWhite: boolean;
  word: string;
  eliminated: boolean;
};
type Screen =
  | "home"
  | "setup"
  | "players"
  | "deal"
  | "discussion"
  | "guess"
  | "result";
type Difficulty = "easy" | "medium" | "hard";

const categories = library.categories as Category[];
const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

// Fisher–Yates shuffle using an unbiased cryptographic random index.
function secureShuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Uniformly select a player slot using the browser's secure random source.
function randomIndex(max: number): number {
  if (max <= 1) return 0;
  const range = 0x1_0000_0000;
  const limit = range - (range % max);
  const value = new Uint32Array(1);
  do {
    window.crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % max;
}

function chooseWeightedDifficulty(pool: Pair[]): Difficulty | null {
  const weights: Record<Difficulty, number> = {
    easy: 10,
    medium: 70,
    hard: 20,
  };
  const available = (["easy", "medium", "hard"] as Difficulty[]).filter(
    (difficulty) =>
      pool.some((pair) => pair.difficulty.toLowerCase() === difficulty),
  );
  if (!available.length) return null;

  const totalWeight = available.reduce(
    (sum, difficulty) => sum + weights[difficulty],
    0,
  );
  let roll = Math.random() * totalWeight;
  for (const difficulty of available) {
    roll -= weights[difficulty];
    if (roll < 0) return difficulty;
  }
  return available[available.length - 1];
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [count, setCount] = useState(6);
  const [names, setNames] = useState<string[]>(
    Array.from({ length: 12 }, (_, i) => `Player ${i + 1}`),
  );
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [surpriseCategory, setSurpriseCategory] = useState(true);
  const [mode, setMode] = useState<"undercover" | "classic">("undercover");
  const [showRole, setShowRole] = useState(true);
  const [finalGuessEnabled, setFinalGuessEnabled] = useState(true);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [players, setPlayers] = useState<Player[]>([]);
  const [turnOrder, setTurnOrder] = useState<number[]>([]);
  const [majorityWord, setMajorityWord] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [eliminateId, setEliminateId] = useState<number | null>(null);
  const [showAccusationConfirm, setShowAccusationConfirm] = useState(false);
  const [lastEliminated, setLastEliminated] = useState<Player | null>(null);
  const [eliminationNotice, setEliminationNotice] = useState("");
  const [guess, setGuess] = useState("");
  const [guessCorrect, setGuessCorrect] = useState<boolean | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [showEndEarlyConfirm, setShowEndEarlyConfirm] = useState(false);
  const [endedEarly, setEndedEarly] = useState(false);

  const currentPlayer =
    players.find((player) => player.id === turnOrder[currentIndex]) ??
    players[currentIndex];
  const alive = players.filter((player) => !player.eliminated);
  const mrWhite = players.find((player) => player.isMrWhite);

  const selectedCategories = useMemo(
    () =>
      categories.filter((category) =>
        selectedCategoryIds.includes(category.id),
      ),
    [selectedCategoryIds],
  );

  const availablePairs = useMemo(() => {
    const pool = surpriseCategory
      ? categories.flatMap((category) => category.pairs)
      : selectedCategories.flatMap((category) => category.pairs);
    return pool;
  }, [surpriseCategory, selectedCategories]);

  useEffect(() => {
    if (!timerRunning || secondsLeft <= 0) return;
    const intervalId = window.setInterval(() => {
      setSecondsLeft((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [timerRunning, secondsLeft]);

  useEffect(() => {
    if (secondsLeft === 0) setTimerRunning(false);
  }, [secondsLeft]);

  function updateName(index: number, value: string) {
    setNames((old) => old.map((name, i) => (i === index ? value : name)));
  }

  function toggleCategory(id: string) {
    setSurpriseCategory(false);
    setSelectedCategoryIds((old) =>
      old.includes(id)
        ? old.filter((categoryId) => categoryId !== id)
        : [...old, id],
    );
  }

  function toggleSelectAll() {
    setSurpriseCategory(false);
    setSelectedCategoryIds((old) =>
      old.length === categories.length
        ? []
        : categories.map((category) => category.id),
    );
  }

  function chooseSurpriseCategory() {
    setSurpriseCategory((old) => !old);
    setSelectedCategoryIds([]);
  }

  function continueToPlayers() {
    if (!surpriseCategory && selectedCategoryIds.length === 0) return;
    // Generate a fresh turn order each round; the Shuffle button can reroll it.
    setTurnOrder(secureShuffle(Array.from({ length: count }, (_, i) => i)));
    setScreen("players");
  }

  function reshuffleTurnOrder() {
    setTurnOrder(secureShuffle(Array.from({ length: count }, (_, i) => i)));
  }

  function startGame() {
    if (availablePairs.length === 0) return;

    const roundPool = surpriseCategory
      ? shuffle(categories)[0].pairs
      : availablePairs;
    const difficulty = chooseWeightedDifficulty(roundPool);
    const difficultyPool = difficulty
      ? roundPool.filter((pair) => pair.difficulty.toLowerCase() === difficulty)
      : roundPool;

    const chosen = shuffle(
      difficultyPool.length ? difficultyPool : roundPool,
    )[0];
    // Choose the role independently of names and turn order. Every player slot
    // has the same probability, using the secure random source.
    const whitePlayerId = randomIndex(count);
    const roundOrder =
      turnOrder.length === count
        ? turnOrder
        : secureShuffle(Array.from({ length: count }, (_, i) => i));
    setTurnOrder(roundOrder);
    const majority = Math.random() < 0.5 ? chosen.wordA : chosen.wordB;
    const minority = majority === chosen.wordA ? chosen.wordB : chosen.wordA;

    const nextPlayers = Array.from({ length: count }, (_, i) => ({
      id: i,
      name: names[i]?.trim() || `Player ${i + 1}`,
      isMrWhite: i === whitePlayerId,
      word:
        i === whitePlayerId
          ? mode === "undercover"
            ? minority
            : ""
          : majority,
      eliminated: false,
    }));

    setMajorityWord(majority);
    setPlayers(nextPlayers);
    setCurrentIndex(0);
    setRevealed(false);
    setEliminateId(null);
    setShowAccusationConfirm(false);
    setShowEndEarlyConfirm(false);
    setEndedEarly(false);
    setLastEliminated(null);
    setGuess("");
    setGuessCorrect(null);
    setEliminationNotice("");
    setSecondsLeft(0);
    setTimerRunning(false);
    setScreen("deal");
  }

  function nextPlayer() {
    setRevealed(false);
    if (currentIndex + 1 < players.length) {
      setCurrentIndex((index) => index + 1);
    } else {
      setSecondsLeft(timerMinutes * 60);
      setTimerRunning(false);
      setScreen("discussion");
    }
  }

  function resolveElimination() {
    if (eliminateId === null) return;
    const target = players.find((player) => player.id === eliminateId);
    if (!target || target.eliminated) return;

    const updated = players.map((player) =>
      player.id === eliminateId ? { ...player, eliminated: true } : player,
    );
    setPlayers(updated);
    setLastEliminated(target);
    setEliminateId(null);
    setShowAccusationConfirm(false);

    if (target.isMrWhite) {
      setEliminationNotice(
        `${target.name} is Mr. White. Their assigned word was ${target.word || "no word"}.`,
      );
      if (finalGuessEnabled) setScreen("guess");
      else {
        setGuessCorrect(false);
        setScreen("result");
      }
      return;
    }

    setEliminationNotice(
      `${target.name} is not Mr. White. Their word remains secret.`,
    );
    if (updated.filter((player) => !player.eliminated).length <= 2)
      setScreen("result");
    else setScreen("discussion");
  }

  function submitGuess() {
    setGuessCorrect(
      guess.trim().toLowerCase() === majorityWord.trim().toLowerCase(),
    );
    setScreen("result");
  }

  function reset() {
    setScreen("home");
    setShowEndEarlyConfirm(false);
    setEndedEarly(false);
    setPlayers([]);
    setTurnOrder([]);
    setRevealed(false);
    setTimerRunning(false);
    setSecondsLeft(0);
    setGuess("");
    setGuessCorrect(null);
    setLastEliminated(null);
    setEliminateId(null);
    setShowAccusationConfirm(false);
    setEliminationNotice("");
  }

  const time = `${Math.floor(secondsLeft / 60)
    .toString()
    .padStart(2, "0")}:${(secondsLeft % 60).toString().padStart(2, "0")}`;
  const allCategoriesSelected =
    selectedCategoryIds.length === categories.length;

  return (
    <main className="app-shell">
      <header
        className={`topbar topbar--global ${screen === "home" ? "topbar--home" : ""}`}
      >
        <button className="brand" onClick={reset} aria-label="Mr. White home">
          <span className="brand-mark">R</span>
          <span>MR. WHITE</span>
        </button>
        <div className="top-card-symbols" aria-label="Playing card suits">
          <span aria-label="Spade">♠</span>
          <span aria-label="Club">♣</span>
          <span className="jester-suit" aria-label="Jester">
            ✣
          </span>
          <span aria-label="Heart">♥</span>
          <span aria-label="Diamond">♦</span>
        </div>
      </header>

      {screen === "home" && (
        <section className="hero page-width">
          <div className="hero-content">
            <div
              className="card-fan-stage"
              aria-label="Five illustrated playing cards"
            >
              <img
                className="hero-playing-card hero-card--ace"
                src={aceCard}
                alt="Ace of spades"
              />
              <img
                className="hero-playing-card hero-card--jack"
                src={jackCard}
                alt="Jack of clubs"
              />
              <img
                className="hero-playing-card hero-card--jester"
                src={jesterCard}
                alt="Mr. White jester"
              />
              <img
                className="hero-playing-card hero-card--queen"
                src={queenCard}
                alt="Queen of hearts"
              />
              <img
                className="hero-playing-card hero-card--king"
                src={kingCard}
                alt="King of diamonds"
              />
            </div>
            <div className="eyebrow">
              <Sparkles size={14} /> THE ULTIMATE BLUFFING GAME
            </div>
            <h1>
              Trust no one.
              <br />
              <span>Kill any one.</span> <br />
              Be only ONE.
            </h1>
            <p className="hero-copy">
              One secret word. One hidden outsider. A room full of suspicious
              friends. Can you spot Mr. White?
            </p>
            <div className="hero-actions">
              <button
                className="primary-btn"
                onClick={() => setScreen("setup")}
              >
                <Play size={17} fill="currentColor" />
                Start a game
                <ArrowRight size={17} />
              </button>
              <span className="micro-copy">
                <Users size={15} /> 3–12 players · One device
              </span>
            </div>
            <div className="feature-row">
              <div>
                <Shield />
                <b>Secret roles</b>
                <span>Only you see your card</span>
              </div>
              <div>
                <EyeOff />
                <b>Pass & play</b>
                <span>Keep the phone moving</span>
              </div>
              <div>
                <Clock3 />
                <b>Pure mind games</b>
                <span>Discuss. Accuse. Vote.</span>
              </div>
            </div>
            <div className="how-card">
              <div className="how-number">01</div>
              <div>
                <b>Everyone gets a word.</b>
                <span>
                  Except Mr. White, who gets a related word — or no word at all.
                </span>
              </div>
              <div className="how-number">02</div>
              <div>
                <b>Give clues. Find the outsider.</b>
                <span>
                  Talk it out, then vote in person. The app keeps the secrets.
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {screen === "setup" && (
        <section className="page-width narrow-page">
          <button className="back-link" onClick={() => setScreen("home")}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="eyebrow">
            <span className="suit-mark">♠</span> GAME CONFIGURATION
          </div>
          <h2>Set up your game.</h2>
          <p className="subcopy">
            A few quick choices, then pass the phone around.
          </p>

          <div className="panel setup-panel">
            <section className="setup-section">
              <div className="field-head">
                <label>
                  <span className="section-symbol" aria-hidden="true">
                    ♠
                  </span>{" "}
                  NUMBER OF PLAYERS
                </label>
                <span className="value-pill">{count} players</span>
              </div>
              <div className="stepper">
                <button
                  onClick={() => setCount((value) => Math.max(3, value - 1))}
                  disabled={count === 3}
                  aria-label="Decrease player count"
                >
                  −
                </button>
                <strong>{count}</strong>
                <button
                  onClick={() => setCount((value) => Math.min(12, value + 1))}
                  disabled={count === 12}
                  aria-label="Increase player count"
                >
                  +
                </button>
              </div>
            </section>

            <div className="divider" />

            <section className="setup-section">
              <div className="field-head">
                <label>
                  <span className="section-symbol" aria-hidden="true">
                    ✣
                  </span>{" "}
                  MR. WHITE MODE
                </label>
              </div>
              <div className="choice-grid">
                <button
                  className={
                    mode === "undercover" ? "choice selected" : "choice"
                  }
                  onClick={() => setMode("undercover")}
                  aria-pressed={mode === "undercover"}
                >
                  <span className="choice-heading">
                    <span className="choice-icon">♠</span>
                    <b>Undercover</b>
                  </span>
                  <small>Mr. White gets a related but different word.</small>
                  <span className="choice-check">
                    {mode === "undercover" && <Check size={13} />}
                  </span>
                </button>
                <button
                  className={mode === "classic" ? "choice selected" : "choice"}
                  onClick={() => setMode("classic")}
                  aria-pressed={mode === "classic"}
                >
                  <span className="choice-heading">
                    <span className="choice-icon">♣</span>
                    <b>Classic</b>
                  </span>
                  <small>Mr. White gets no word.</small>
                  <span className="choice-check">
                    {mode === "classic" && <Check size={13} />}
                  </span>
                </button>
              </div>
            </section>

            <div className="divider" />

            <section className="setup-section">
              <div className="field-head">
                <label>
                  <span className="section-symbol" aria-hidden="true">
                    ♥
                  </span>{" "}
                  GAME OPTIONS
                </label>
              </div>
              <div className="options-grid">
                <div className="option-card">
                  <div>
                    <b>Show on card</b>
                    <small>
                      Display the player's role alongside their word.
                    </small>
                  </div>
                  <button
                    className={`toggle ${showRole ? "on" : ""}`}
                    onClick={() => setShowRole((value) => !value)}
                    aria-label="Toggle show role"
                    aria-pressed={showRole}
                  >
                    <span />
                  </button>
                </div>
                <div className="option-card">
                  <div>
                    <b>White's last chance</b>
                    <small>
                      Allow one final guess after Mr. White is caught.
                    </small>
                  </div>
                  <button
                    className={`toggle ${finalGuessEnabled ? "on" : ""}`}
                    onClick={() => setFinalGuessEnabled((value) => !value)}
                    aria-label="Toggle White's last chance"
                    aria-pressed={finalGuessEnabled}
                  >
                    <span />
                  </button>
                </div>
              </div>
            </section>

            <div className="divider" />

            <section className="setup-section">
              <div className="field-head">
                <label>
                  <span className="section-symbol" aria-hidden="true">
                    ♥
                  </span>{" "}
                  DISCUSSION TIMER
                </label>
                <span className="value-pill">{timerMinutes} min</span>
              </div>
              <input
                className="range"
                type="range"
                min="1"
                max="10"
                value={timerMinutes}
                onChange={(event) =>
                  setTimerMinutes(Number(event.target.value))
                }
              />
              <div className="range-labels">
                <span className="range-endpoint">
                  <Clock3 size={13} aria-hidden="true" /> 1 min
                </span>
                <span className="range-endpoint">
                  <Hourglass size={13} aria-hidden="true" /> 10 min
                </span>
              </div>
            </section>

            <div className="divider" />

            <section className="setup-section">
              <div className="field-head">
                <label>
                  <span className="section-symbol" aria-hidden="true">
                    ♦
                  </span>{" "}
                  WORD CATEGORIES
                </label>
                <span className="value-pill">
                  {surpriseCategory
                    ? "Random"
                    : `${selectedCategoryIds.length} selected`}
                </span>
              </div>
              <p className="section-help">
                Choose one or more categories, or let the game surprise you.
              </p>
              <button
                type="button"
                className={`surprise-choice ${surpriseCategory ? "selected" : ""}`}
                onClick={chooseSurpriseCategory}
                aria-pressed={surpriseCategory}
              >
                <span className="surprise-icon">✦</span>
                <span className="surprise-copy">
                  <b>Surprise me</b>
                  <small>Pick a category at random each round</small>
                </span>
                <span
                  className={`selection-indicator ${surpriseCategory ? "checked" : ""}`}
                >
                  {surpriseCategory && <Check size={13} />}
                </span>
              </button>

              <div className="category-toolbar">
                <span>CHOOSE CATEGORIES</span>
                <button type="button" onClick={toggleSelectAll}>
                  {allCategoriesSelected ? "CLEAR ALL" : "SELECT ALL"}
                </button>
              </div>
              <div className="category-grid">
                {categories.map((category) => {
                  const checked = selectedCategoryIds.includes(category.id);
                  return (
                    <label
                      className={`category-option ${checked ? "selected" : ""}`}
                      key={category.id}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(category.id)}
                      />
                      <span className="custom-checkbox">
                        {checked && <Check size={13} />}
                      </span>
                      <span>{category.name}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          </div>

          <button
            className="primary-btn full continue-btn"
            onClick={continueToPlayers}
            disabled={!surpriseCategory && selectedCategoryIds.length === 0}
          >
            Continue <ArrowRight size={17} />
          </button>
          <p className="footnote">
            <Info size={13} /> Difficulty is selected automatically for every
            round: 10% Easy, 70% Medium and 20% Hard.
          </p>
        </section>
      )}

      {screen === "players" && (
        <section className="page-width narrow-page">
          <button className="back-link" onClick={() => setScreen("setup")}>
            <ArrowLeft size={16} /> Back to setup
          </button>
          <div className="eyebrow">
            <span className="suit-mark">♦</span> PLAYER DETAILS
          </div>
          <h2>Who's playing?</h2>
          <p className="subcopy">
            Add names so everyone knows when it's their turn. You can leave the
            defaults if you prefer.
          </p>
          <div className="panel">
            <div className="field-head">
              <label>PLAYER NAMES</label>
              <span className="value-pill">{count} players</span>
            </div>
            <div className="name-grid">
              {Array.from({ length: count }, (_, index) => {
                const assignedNumber = turnOrder.indexOf(index) + 1;
                return (
                  <label className="name-field" key={index}>
                    <span>
                      {String(
                        assignedNumber > 0 ? assignedNumber : index + 1,
                      ).padStart(2, "0")}
                    </span>
                    <input
                      value={names[index] ?? `Player ${index + 1}`}
                      onChange={(event) =>
                        updateName(index, event.target.value)
                      }
                      placeholder={`Player ${index + 1}`}
                    />
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              className="secondary-btn full shuffle-order-btn"
              onClick={reshuffleTurnOrder}
            >
              <RotateCcw size={15} /> Shuffle player order
            </button>
            <p className="shuffle-help">
              Shuffle assigns a fresh random turn number to every player. Pass
              the phone in that order.
            </p>
          </div>
          <button
            className="primary-btn full"
            onClick={startGame}
            disabled={availablePairs.length === 0}
          >
            Deal secret cards <ArrowRight size={17} />
          </button>
          <p className="footnote">
            <Info size={13} /> Players reveal their cards in the shuffled order
            shown above. Mr. White is assigned independently and randomly.
          </p>
        </section>
      )}

      {screen === "deal" && currentPlayer && (
        <section className="page-width game-page">
          <div className="progress-top">
            <span>SECRET CARD DISTRIBUTION</span>
            <span>
              {currentIndex + 1} OF {players.length}
            </span>
          </div>
          <div className="progress-track">
            <div
              style={{
                width: `${((currentIndex + 1) / players.length) * 100}%`,
              }}
            />
          </div>
          <div className="deal-content">
            <div className="eyebrow">
              <span className="suit-mark">♠</span> PASS THE PHONE
            </div>
            <h2>
              Hand it to <span>{currentPlayer.name}</span>.
            </h2>
            <p className="subcopy">
              Make sure nobody else can see the screen. Tap below when they're
              ready.
            </p>
            <div className={`secret-card ${revealed ? "revealed" : ""}`}>
              <span className="playing-card-corner top-left">
                A<br />♠
              </span>
              <span className="playing-card-corner bottom-right">
                A<br />♠
              </span>
              {!revealed ? (
                <>
                  <div className="card-symbol">♠</div>
                  <span className="card-label">
                    PLAYER {currentIndex + 1} · PRIVATE
                  </span>
                  <h3>
                    Your identity
                    <br />
                    is hidden.
                  </h3>
                  <p>Tap to reveal your secret word.</p>
                  <button
                    className="reveal-btn"
                    onClick={() => setRevealed(true)}
                  >
                    <Eye size={17} /> Reveal my card
                  </button>
                </>
              ) : (
                <>
                  <div className="card-symbol">
                    {currentPlayer.isMrWhite ? "♠" : "♣"}
                  </div>
                  <span className="card-label">YOUR SECRET WORD</span>
                  <h3 className="secret-word">
                    {currentPlayer.word || "No word"}
                  </h3>
                  {showRole && (
                    <span
                      className={`role-chip ${currentPlayer.isMrWhite ? "danger" : ""}`}
                    >
                      {currentPlayer.isMrWhite
                        ? "MR. WHITE"
                        : "YOU ARE INNOCENT"}
                    </span>
                  )}
                  <p>
                    {showRole && currentPlayer.isMrWhite
                      ? "Blend in. Listen carefully. Figure out the majority word."
                      : "Give clues that prove you know the word — without making it too obvious."}
                  </p>
                  <button
                    className="reveal-btn"
                    onClick={() => setRevealed(false)}
                  >
                    <EyeOff size={16} /> Hide my card
                  </button>
                </>
              )}
            </div>
            <div className="deal-actions">
              <button
                className="primary-btn full"
                disabled={!revealed}
                onClick={nextPlayer}
              >
                {currentIndex + 1 === players.length
                  ? "Start discussion"
                  : "I'm done — pass phone"}{" "}
                <ArrowRight size={17} />
              </button>
              <span className="micro-copy">
                Your card will be hidden before the next player.
              </span>
            </div>
          </div>
        </section>
      )}

      {screen === "discussion" && (
        <section className="page-width narrow-page">
          <div className="eyebrow">THE DISCUSSION</div>
          <h2>Who seems suspicious?</h2>
          <p className="subcopy">
            Give clues, discuss and vote out loud. Use the app only to record
            the player your group eliminates.
          </p>
          <div className="timer-card">
            <span className="timer-caption">
              <Clock3 size={15} /> DISCUSSION TIMER
            </span>
            <strong className={secondsLeft === 0 ? "" : "timer-active"}>
              {time}
            </strong>
            <div className="timer-buttons">
              <button
                onClick={() => {
                  setSecondsLeft(timerMinutes * 60);
                  setTimerRunning(false);
                }}
              >
                <RotateCcw size={15} /> Reset
              </button>
              <button
                className="timer-start"
                onClick={() => setTimerRunning((value) => !value)}
              >
                {timerRunning ? "Pause" : "Start"} timer
              </button>
            </div>
          </div>
          {eliminationNotice && (
            <div className="notice-card">
              <Info size={16} />
              <span>{eliminationNotice}</span>
              <button
                onClick={() => setEliminationNotice("")}
                aria-label="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div className="panel suspicion-panel">
            <div className="field-head">
              <label>WHO SEEMS SUSPICIOUS?</label>
              <span className="value-pill">{alive.length} remaining</span>
            </div>
            <p className="muted small">
              Select the player your group voted to eliminate.
            </p>
            <div className="suspicion-grid">
              {players.map((player) => (
                <button
                  type="button"
                  key={player.id}
                  className={`suspicion-player-card ${player.eliminated ? "is-eliminated" : ""}`}
                  disabled={player.eliminated}
                  onClick={() => {
                    setEliminateId(player.id);
                    setShowAccusationConfirm(true);
                  }}
                >
                  <span className="suspicion-player-initial">
                    {player.name.slice(0, 1).toUpperCase()}
                  </span>
                  <strong>{player.name}</strong>
                  <span className="suspicion-player-status">
                    {player.eliminated ? "ELIMINATED" : "IN GAME"}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {showAccusationConfirm && eliminateId !== null && (
            <div
              className="accusation-overlay"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setShowAccusationConfirm(false);
                  setEliminateId(null);
                }
              }}
            >
              <section
                className="accusation-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="accusation-title"
              >
                <span className="accusation-mark">?</span>
                <div className="eyebrow">FINAL CONFIRMATION</div>
                <h3 id="accusation-title">
                  Accuse{" "}
                  {players.find((player) => player.id === eliminateId)?.name}?
                </h3>
                <p>
                  This player will be eliminated from the round. Their secret
                  word will remain hidden unless they are Mr. White.
                </p>
                <div className="accusation-actions">
                  <button
                    className="secondary-btn"
                    onClick={() => {
                      setShowAccusationConfirm(false);
                      setEliminateId(null);
                    }}
                  >
                    Leave
                  </button>
                  <button className="primary-btn" onClick={resolveElimination}>
                    Accuse
                  </button>
                </div>
              </section>
            </div>
          )}
          <button
            type="button"
            className="secondary-btn full end-early-btn"
            onClick={() => setShowEndEarlyConfirm(true)}
          >
            End game early
          </button>
          {showEndEarlyConfirm && (
            <div
              className="accusation-overlay"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  setShowEndEarlyConfirm(false);
              }}
            >
              <section
                className="accusation-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="end-early-title"
              >
                <span className="accusation-mark">!</span>
                <div className="eyebrow">END ROUND</div>
                <h3 id="end-early-title">End the game now?</h3>
                <p>
                  The round will end immediately. The results and all five
                  playing cards will be revealed.
                </p>
                <div className="accusation-actions">
                  <button
                    className="secondary-btn"
                    onClick={() => setShowEndEarlyConfirm(false)}
                  >
                    Keep playing
                  </button>
                  <button
                    className="primary-btn"
                    onClick={() => {
                      setEndedEarly(true);
                      setShowEndEarlyConfirm(false);
                      setGuessCorrect(null);
                      setScreen("result");
                    }}
                  >
                    End game
                  </button>
                </div>
              </section>
            </div>
          )}
        </section>
      )}

      {screen === "guess" && (
        <section className="page-width narrow-page centered-page">
          <div className="mr-white-card-stage reveal-flash">
            <img
              src={jesterCard}
              alt="Mr. White jester card"
              className="outcome-playing-card outcome-jester-card"
            />
          </div>
          <div className="result-icon caught">!</div>
          <div className="eyebrow">MR. WHITE CAUGHT</div>
          <h2 className="mr-white-reveal-title">
            Yes, {lastEliminated?.name} is Mr. White.
          </h2>
          <p className="subcopy">
            Their assigned word was <b>{lastEliminated?.word || "no word"}.</b>{" "}
            One final chance: can they guess the majority word?
          </p>
          <div className="panel guess-panel">
            <label>MR. WHITE'S FINAL GUESS</label>
            <input
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              placeholder="Enter the majority word…"
              onKeyDown={(event) => event.key === "Enter" && submitGuess()}
            />
            <button
              className="primary-btn full"
              disabled={!guess.trim()}
              onClick={submitGuess}
            >
              Lock in final guess <ArrowRight size={17} />
            </button>
          </div>
          <button
            className="text-btn"
            onClick={() => {
              setGuessCorrect(false);
              setScreen("result");
            }}
          >
            Skip final guess
          </button>
        </section>
      )}

      {screen === "result" && (
        <section className="page-width narrow-page centered-page">
          <div className={`result-icon ${guessCorrect ? "caught" : "win"}`}>
            {endedEarly ? "Ⅱ" : guessCorrect ? "✦" : "✓"}
          </div>
          <div className="eyebrow">
            {endedEarly ? "ROUND ENDED EARLY" : "ROUND COMPLETE"}
          </div>
          <h2>
            {endedEarly
              ? "The game was ended early."
              : guessCorrect
                ? "Mr. White stole the win!"
                : lastEliminated?.isMrWhite
                  ? "The group wins!"
                  : "Mr. White survives."}
          </h2>
          <p className="subcopy">
            {endedEarly
              ? "The round was stopped before a winner was determined. Here are the full results."
              : guessCorrect
                ? "The final guess was correct. Mr. White wins."
                : lastEliminated?.isMrWhite
                  ? "Mr. White was eliminated and the group wins."
                  : "Only two players remain. Mr. White wins by surviving."}
          </p>
          {!endedEarly && lastEliminated?.isMrWhite && !finalGuessEnabled && (
            <div
              className="mr-white-card-stage reveal-flash reveal-flash-dismiss"
              aria-label="Mr. White revealed"
            >
              <img
                src={jesterCard}
                alt="Mr. White jester card revealed"
                className="outcome-playing-card outcome-jester-card"
              />
            </div>
          )}
          <div
            className={`outcome-cards ${endedEarly ? "outcome-cards-all" : guessCorrect ? "outcome-cards-white" : lastEliminated?.isMrWhite ? "outcome-cards-group" : "outcome-cards-white"}`}
          >
            {endedEarly ? (
              <>
                <img
                  src={aceCard}
                  alt="Ace of spades"
                  className="outcome-playing-card"
                />
                <img
                  src={jackCard}
                  alt="Jack of clubs"
                  className="outcome-playing-card"
                />
                <img
                  src={jesterCard}
                  alt="Mr. White jester"
                  className="outcome-playing-card outcome-jester-card"
                />
                <img
                  src={queenCard}
                  alt="Queen of hearts"
                  className="outcome-playing-card"
                />
                <img
                  src={kingCard}
                  alt="King of diamonds"
                  className="outcome-playing-card"
                />
              </>
            ) : guessCorrect ? (
              <img
                src={jesterCard}
                alt="Mr. White jester card"
                className="outcome-playing-card outcome-jester-card"
              />
            ) : lastEliminated?.isMrWhite ? (
              <>
                <img
                  src={aceCard}
                  alt="Ace of spades"
                  className="outcome-playing-card"
                />
                <img
                  src={jackCard}
                  alt="Jack of clubs"
                  className="outcome-playing-card"
                />
                <img
                  src={queenCard}
                  alt="Queen of hearts"
                  className="outcome-playing-card"
                />
                <img
                  src={kingCard}
                  alt="King of diamonds"
                  className="outcome-playing-card"
                />
              </>
            ) : (
              <img
                src={jesterCard}
                alt="Mr. White jester card"
                className="outcome-playing-card outcome-jester-card"
              />
            )}
          </div>
          {lastEliminated && !endedEarly && (
            <div
              className={`elimination-reveal ${lastEliminated.isMrWhite ? "is-white" : "is-innocent"}`}
            >
              {lastEliminated.isMrWhite
                ? `Yes, ${lastEliminated.name} is Mr. White.`
                : `${lastEliminated.name} is not Mr. White.`}
            </div>
          )}
          <div className="panel result-panel">
            <div className="result-line">
              <span>Majority word</span>
              <b>{majorityWord}</b>
            </div>
            <div className="result-line">
              <span>Mr. White</span>
              <b>{mrWhite?.name}</b>
            </div>
            <div className="result-line">
              <span>Mr. White's word</span>
              <b>{mrWhite?.word || "No word"}</b>
            </div>
            {!endedEarly && lastEliminated && (
              <div className="result-line">
                <span>Last eliminated</span>
                <b>{lastEliminated.name}</b>
              </div>
            )}
            {guessCorrect !== null && (
              <div className="result-line">
                <span>Final guess</span>
                <b>{guessCorrect ? "Correct" : "Incorrect / skipped"}</b>
              </div>
            )}
          </div>
          <button className="primary-btn full" onClick={reset}>
            <RotateCcw size={17} /> Back to home
          </button>
          <button
            className="secondary-btn full"
            onClick={() => {
              setScreen("setup");
              setPlayers([]);
            }}
          >
            Play another round <ArrowRight size={17} />
          </button>
        </section>
      )}

      <footer className="footer">
        MADE FOR GAME NIGHT <span>·</span> KEEP YOUR SECRETS CLOSE
      </footer>
    </main>
  );
}
