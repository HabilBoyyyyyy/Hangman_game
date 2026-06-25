# THE GALLOWS - A Noir Hangman Experience

Welcome to **THE GALLOWS**, a classic game of Hangman reimagined as a 1940s detective/noir investigation! Step into the shoes of a seasoned detective and solve classified case files before the rope tightens. 

Every wrong letter is a strike against your suspect. Choose wisely, detective.

---

## Features

- **Immersive Noir Theme**: A gritty, classified intelligence brief UI complete with paper textures, vignettes, and film grain.
- **Dynamic Foley Audio**: Custom Web Audio API sound engine that generates organic, physical sounds—from the sharp clack of a vintage typewriter and heavy rubber *DECLINED* stamps, to the ominous reverberating slam of a jail cell door.
- **Multiple Difficulties**:
  - **Rookie** (4–5 letter words)
  - **Detective** (6–8 letter words)
  - **Inspector** (9+ letter words)
- **Diverse Case Files (Categories)**: Choose your area of investigation:
  - 🐾 Animals
  - 🌎 Countries
  - 🎬 Movies
  - 🔬 Science
  - 🍔 Food
  - 💻 Technology
  - 🎵 Music
  - 🏛️ Mythology
- **Scoring & Timers**: Track your speed, accuracy, and overall score as you attempt to solve the case.
- **Hints Included**: Every suspect word comes with an intelligence brief (hint) to help you crack the case.

---

## Tech Stack

This project is built using pure, vanilla web technologies. No external libraries or frameworks are required.
- **HTML5**: Structured with semantic tags.
- **Vanilla CSS**: Styled from scratch to create the immersive 1940s aesthetic.
- **Vanilla JavaScript**: Handles game logic, DOM manipulation, and dynamic sound generation.
- **Web Audio API**: Used to synthetically generate all of the analog Foley sound effects in real-time.

---

## How to Play

Since this is a static web application, playing it is incredibly simple:

1. Clone the repository to your local machine:
   ```bash
   git clone https://github.com/HabilBoyyyyyy/HabilBoyyyyyy.git
   ```
2. Navigate to the project directory:
   ```bash
   cd HabilBoyyyyyy
   ```
3. Open the `index.html` file in your preferred modern web browser.
4. Select your difficulty, choose a case file category, and click **OPEN CASE FILE** to begin your investigation!

---

## Project Structure

```text
├── index.html        # The main game interface
├── style.css         # All styles, animations, and aesthetic logic
├── script.js         # Core game loop and Web Audio API engine
└── Words/            # Modular word bank separated by category
    ├── animals.js
    ├── countries.js
    ├── movies.js
    ├── science.js
    ├── food.js
    ├── technology.js
    ├── music.js
    ├── mythology.js
    └── all.js        # Compiler that merges all categories for "ALL FILES" mode
```

---

*“Every wrong letter tightens the rope. Choose wisely, detective.”* ⚖️
