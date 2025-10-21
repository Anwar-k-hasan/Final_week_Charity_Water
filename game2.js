(() => {
  const $ = (sel) => document.querySelector(sel);
  const gridEl = $("#grid");
  const screens = { title: $("#titleScreen"), game: $("#gameScreen") };
  const levelLabel = $("#levelLabel");
  const timerLabel = $("#timerLabel");
  const modal = $("#modal");
  const modalBody = $("#modalBody");
  const modalTitle = $("#modalTitle");
  const modalActions = $("#modalActions");

  $("#homeBtn").addEventListener("click", () => goHome());
  $("#easyBtn").addEventListener("click", () => startGame("easy"));
  $("#mediumBtn").addEventListener("click", () => startGame("medium"));
  $("#hardBtn").addEventListener("click", () => startGame("hard"));
  $("#modalClose").addEventListener("click", () => closeModal());

  const DIFFICULTY = {
    easy: { size: 5, time: 20 },
    medium: { size: 7, time: 25 },
    hard: { size: 9, time: 30 }
  };

  // Sound disabled: no-op playSfx to keep calls safe
  function playSfx(name) {
    // sounds disabled — intentionally left empty
  }

  const TOTAL_LEVELS = 10;
  let currentDifficulty = null;
  let SIZE = 5;
  let timer = null;
  let timeLeft = 0;

  // Pipe connection maps
  const CONNECT = {
    "I": [
      [1,0,1,0], [0,1,0,1], [1,0,1,0], [0,1,0,1]
    ],
    "L": [
      [1,1,0,0], [0,1,1,0], [0,0,1,1], [1,0,0,1]
    ],
    "T": [
      [0,1,1,1], [1,0,1,1], [1,1,0,1], [1,1,1,0]
    ],
    "X": [
      [1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]
    ],
    ".": [
      [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]
    ],
    "S": [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]],
    "D": [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]],
    "W": [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]],
  };

  //Helpers
  // Replacement for your simple path maker: still O(n) and robust.
function carveGuaranteedPath(start, goal, rng) {
  const sr = Math.floor(start / SIZE), sc = start % SIZE;
  const gr = Math.floor(goal / SIZE), gc = goal % SIZE;
  let r = sr, c = sc;
  const path = [start];

  // Shuffle order in which we tend to move to add variety
  // We’ll primarily move toward goal, with occasional perpendicular wiggles.
  const maxSteps = SIZE * SIZE * 4;
  let steps = 0;

  while ((r !== gr || c !== gc) && steps < maxSteps) {
    const moves = [];
    // Bias toward goal
    if (gr > r) moves.push([1, 0]);
    if (gr < r) moves.push([-1, 0]);
    if (gc > c) moves.push([0, 1]);
    if (gc < c) moves.push([0, -1]);

    // Add a small chance to wiggle sideways to avoid dead-straight lines
    if (rng() < 0.35) {
      // add perpendicular options
      if (rng() < 0.5) { moves.push([0, 1], [0, -1]); } else { moves.push([1, 0], [-1, 0]); }
    }

    // pick one
    const m = moves[Math.floor(rng() * moves.length)];
    r = clamp(r + m[0], 0, SIZE - 1);
    c = clamp(c + m[1], 0, SIZE - 1);
    const idx = r * SIZE + c;
    if (path[path.length - 1] !== idx) path.push(idx);
    steps++;
  }

  // Ensure last is goal
  if (path[path.length - 1] !== goal) path.push(goal);
  return path;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Force a cell's side to be CLOSED. If we can’t rotate to close (e.g., "." already closed), keep it or turn into a blocker.
function forceCloseSide(grid, idx, sideFacing) {
  const cell = grid[idx];
  if (!cell) return;

  // "." is already closed everywhere
  if (cell.type === ".") return;

  const sideIndex = DIRI[sideFacing];
  // Try rotations on current type to find one with that side closed (0)
  for (let r = 0; r < 4; r++) {
    const conn = CONNECT[cell.type][r];
    if (conn[sideIndex] === 0) {
      cell.rot = r;
      return;
    }
  }

  // If impossible (e.g., type "X" opens all sides), switch to a type we can close
  // Prefer "L" or "I" because they’re easy to constrain
  const candidates = ["L","I","T","."];
  for (const t of candidates) {
    for (let r = 0; r < 4; r++) {
      const conn = CONNECT[t][r];
      if (conn[sideIndex] === 0) {
        cell.type = t;
        cell.rot = r;
        return;
      }
    }
  }

  // Last resort: blocker
  grid[idx] = { type: ".", rot: 0 };
}

// Your derivePiece was good—kept here unchanged but slightly guarded.
// Input: dirs is exactly the two directions that must be open.
function derivePiece(dirs) {
  const mapIdx = { top:0, right:1, bottom:2, left:3 };
  const open = [0,0,0,0];
  dirs.forEach(d => open[mapIdx[d]] = 1);

  const count = open.reduce((a,b)=>a+b,0);
  if (count === 2) {
    // straight?
    if ((open[0] && open[2]) || (open[1] && open[3])) {
      return { type: "I", rot: open[1] && open[3] ? 1 : 0 };
    }
    // else elbow
    const Lrots = [
      [1,1,0,0], [0,1,1,0], [0,0,1,1], [1,0,0,1]
    ];
    const rot = Lrots.findIndex(r => r.every((v,i)=>v===open[i]));
    return { type: "L", rot: rot >= 0 ? rot : 0 };
  }
  if (count === 3) {
    const Trots = [
      [0,1,1,1], [1,0,1,1], [1,1,0,1], [1,1,1,0]
    ];
    const rot = Trots.findIndex(r => r.every((v,i)=>v===open[i]));
    return { type: "T", rot: rot >= 0 ? rot : 0 };
  }
  // Fallback
  return { type: "I", rot: 0 };
}

function validateLevel(levelObj) {
  const { grid } = levelObj;
  let sCount = 0, wCount = 0;
  for (const cell of grid) {
    if (cell.type === "S") sCount++;
    if (cell.type === "W") wCount++;
  }
  return sCount === 1 && wCount === 1;
}
//Helpers end



  // Improved level generator that guarantees solvability
  function makeLevel(seed) {
  const rng = mulberry32(seed);
  const grid = Array.from({length: SIZE*SIZE}, () => ({ type: ".", rot: 0 }));

  // --- 1) Pick S and W on opposite edges
  const edges = getEdgeCells();
  const Spos = edges[Math.floor(rng() * edges.length)];
  const opposite = getOppositeEdgeCells(Spos);
  const Wpos = opposite[Math.floor(rng() * opposite.length)];

  // --- 2) Carve a guaranteed path S -> W (simple jittered Manhattan walk)
  const path = carveGuaranteedPath(Spos, Wpos, rng);
  const protectedSet = new Set(path);

  // --- 3) Lay correct pipe pieces for the solution and store their solution rotations
  // We’ll later scramble them so the player must rotate back.
  const solutionRot = new Map(); // idx -> rot that solves the path
  for (let i = 0; i < path.length; i++) {
    const idx = path[i];
    if (i === 0) {
      grid[idx] = { type: "S", rot: 0 };
      continue;
    }
    if (i === path.length - 1) {
      grid[idx] = { type: "W", rot: 0 };
      continue;
    }
    const prev = path[i - 1];
    const next = path[i + 1];
    const dirs = neighbors(idx).filter(n => n.idx === prev || n.idx === next).map(n => n.dir);
    const piece = derivePiece(dirs); // returns {type, rot} that opens exactly toward prev & next
    grid[idx] = { type: piece.type, rot: piece.rot };
    solutionRot.set(idx, piece.rot);
  }

  // --- 4) Fill non-path cells with random pipes
  const pipeBag = ["I","L","T","."]; // avoid X so we can always close sides if needed
  for (let i = 0; i < grid.length; i++) {
    if (grid[i].type === ".") {
      const t = pipeBag[Math.floor(rng() * pipeBag.length)];
      grid[i] = { type: t, rot: Math.floor(rng() * 4) };
    }
  }

  // --- 5) Sanitize: for ANY neighbor of a path tile that is NOT the path direction,
  // force the neighbor’s side that faces the path to be CLOSED.
  // This prevents accidental openings into the guaranteed path.
  for (const idx of path) {
    // skip S and W; they’re visually open but we still block neighbors facing them
    const adj = neighbors(idx);
    // Determine which two cells the path is meant to connect to (except ends)
    let allowed = new Set();
    const iInPath = path.indexOf(idx);
    if (iInPath > 0) allowed.add(path[iInPath - 1]);
    if (iInPath < path.length - 1) allowed.add(path[iInPath + 1]);

    for (const nb of adj) {
      if (!allowed.has(nb.idx)) {
        // close neighbor's side facing 'idx'
        forceCloseSide(grid, nb.idx, nb.back);
      }
    }
  }

  // --- 6) Place Dirty source far from the path and not adjacent to it
  let Dpos = null;
  const pathOrAdj = new Set(path);
  // add adjacency around path to reserve a buffer
  for (const p of path) {
    for (const nb of neighbors(p)) pathOrAdj.add(nb.idx);
  }
  const candidates = [];
  for (let i = 0; i < grid.length; i++) {
    if (!pathOrAdj.has(i) && i !== Spos && i !== Wpos) candidates.push(i);
  }
  if (candidates.length > 0) {
    Dpos = candidates[Math.floor(rng() * candidates.length)];
    grid[Dpos] = { type: "D", rot: 0 };
    // Also close any side of D that faces the path buffer, to be extra safe
    for (const nb of neighbors(Dpos)) {
      if (protectedSet.has(nb.idx) || path.includes(nb.idx)) {
        forceCloseSide(grid, Dpos, nb.dir);
      }
    }
  }

  // --- 7) SCRAMBLE the path so it starts UNSOLVED:
  // rotate each path pipe (not S, W) by a random 1..3 turns.
  for (const idx of path) {
    const cell = grid[idx];
    if (!cell) continue;
    if (cell.type === "S" || cell.type === "W") continue;
    const sol = solutionRot.get(idx);
    const add = 1 + Math.floor(rng() * 3);  // 1..3
    cell.rot = (sol + add) % 4;
  }

  // --- Final safety: ensure S and W are present and correct
  grid[Spos] = { type: "S", rot: 0 };
  grid[Wpos] = { type: "W", rot: 0 };

  // (Optional) sanity check during dev
  const ok = validateLevel({ grid, Spos, Dpos, Wpos });
  if (!ok) {
  // regenerate with a nudged seed to avoid infinite loop
  return makeLevel(seed + 1337);
  }

  return { grid, Spos, Dpos, Wpos };
}

  // Fallback level generator
  function makeSimpleLevel(seed) {
    const rng = mulberry32(seed);
    const grid = Array.from({length: SIZE*SIZE}, () => ({type: ".", rot: 0}));
    
    // Simple straight line from left to right
    const Spos = Math.floor(rng() * SIZE) * SIZE;
    const Wpos = Math.floor(rng() * SIZE) * SIZE + (SIZE - 1);
    
    grid[Spos] = {type: "S", rot: 0};
    grid[Wpos] = {type: "W", rot: 0};
    
    // Connect with straight pipes
    const startRow = Math.floor(Spos / SIZE);
    const protectedSet = new Set();
    protectedSet.add(Spos);
    protectedSet.add(Wpos);
    for (let c = 1; c < SIZE - 1; c++) {
      const idx = startRow * SIZE + c;
      grid[idx] = {type: "I", rot: 1}; // Horizontal
      protectedSet.add(idx);
    }
    
    // Place dirty source (avoid adjacency to protected path)
    let Dpos;
    let tries = 0;
    do {
      Dpos = Math.floor(rng() * grid.length);
      tries++;
    } while ((Dpos === Spos || Dpos === Wpos || protectedSet.has(Dpos) || Array.from(protectedSet).some(p => isAdjacent(p, Dpos))) && tries < 1000);
    
    if (tries < 1000) {
      grid[Dpos] = {type: "D", rot: 0};
    } else {
      Dpos = null;
    }
    
    // Fill rest
    const pipeTypes = ["I", "L", "T", "X", "."];
    for (let i = 0; i < grid.length; i++) {
      if (grid[i].type === ".") {
        const type = pipeTypes[Math.floor(rng() * pipeTypes.length)];
        grid[i] = {type, rot: Math.floor(rng() * 4)};
      }
    }

    // Randomize rotations except protected path pieces and sources
    for (let i = 0; i < grid.length; i++) {
      const cell = grid[i];
      if (cell && !["S", "D", "W"].includes(cell.type) && !protectedSet.has(i)) {
        cell.rot = Math.floor(rng() * 4);
      }
    }

    // SANITIZE neighbors so none open into the protected path
    for (let i = 0; i < grid.length; i++) {
      if (protectedSet.has(i)) continue;
      for (const nb of neighbors(i)) {
        if (protectedSet.has(nb.idx) && canFlow(grid, i, nb.idx)) {
          grid[i] = { type: ".", rot: 0 };
          break;
        }
      }
    }

    // Remove dirty source if it ended up connecting into path
    if (Dpos !== null) {
      for (const nb of neighbors(Dpos)) {
        if (protectedSet.has(nb.idx) && canFlow(grid, Dpos, nb.idx)) {
          grid[Dpos] = { type: ".", rot: 0 };
          Dpos = null;
          break;
        }
      }
    }
    
    return { grid, Spos, Dpos, Wpos };
  }

  function findPath(start, goal, grid, rng) {
    const openSet = [start];
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    
    gScore.set(start, 0);
    fScore.set(start, heuristic(start, goal));
    
    while (openSet.length > 0) {
      openSet.sort((a, b) => (fScore.get(a) || Infinity) - (fScore.get(b) || Infinity));
      const current = openSet.shift();
      
      if (current === goal) {
        return reconstructPath(cameFrom, current);
      }
      
      for (const neighbor of neighbors(current)) {
        const tentativeGScore = (gScore.get(current) || Infinity) + 1;
        
        if (tentativeGScore < (gScore.get(neighbor.idx) || Infinity)) {
          cameFrom.set(neighbor.idx, current);
          gScore.set(neighbor.idx, tentativeGScore);
          fScore.set(neighbor.idx, tentativeGScore + heuristic(neighbor.idx, goal));
          
          if (!openSet.includes(neighbor.idx)) {
            openSet.push(neighbor.idx);
          }
        }
      }
    }
    
    return null; // No path found
  }

  function heuristic(a, b) {
    const ar = Math.floor(a / SIZE), ac = a % SIZE;
    const br = Math.floor(b / SIZE), bc = b % SIZE;
    return Math.abs(ar - br) + Math.abs(ac - bc);
  }

  function reconstructPath(cameFrom, current) {
    const path = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current);
      path.unshift(current);
    }
    return path;
  }

  function getEdgeCells() {
    const list = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (r === 0 || c === 0 || r === SIZE - 1 || c === SIZE - 1) {
          list.push(r * SIZE + c);
        }
      }
    }
    return list;
  }

  function getOppositeEdgeCells(pos) {
    const r = Math.floor(pos / SIZE), c = pos % SIZE;
    const list = [];
    
    if (r === 0) {
      // Source on top, put well on bottom
      for (let c = 0; c < SIZE; c++) {
        list.push((SIZE - 1) * SIZE + c);
      }
    } else if (r === SIZE - 1) {
      // Source on bottom, put well on top
      for (let c = 0; c < SIZE; c++) {
        list.push(c);
      }
    } else if (c === 0) {
      // Source on left, put well on right
      for (let r = 0; r < SIZE; r++) {
        list.push(r * SIZE + (SIZE - 1));
      }
    } else {
      // Source on right, put well on left
      for (let r = 0; r < SIZE; r++) {
        list.push(r * SIZE);
      }
    }
    
    return list;
  }

  function isAdjacent(a, b) {
    return neighbors(a).some(n => n.idx === b);
  }

  function derivePiece(dirs) {
    const mapIdx = {top:0, right:1, bottom:2, left:3};
    const open = [0,0,0,0];
    dirs.forEach(d => open[mapIdx[d]] = 1);
    
    // Find matching pipe type
    if (open.filter(x => x).length === 2) {
      if ((open[0] && open[2]) || (open[1] && open[3])) {
        return {type: "I", rot: open[1] && open[3] ? 1 : 0};
      } else {
        const rotations = [
          [1,1,0,0], [0,1,1,0], [0,0,1,1], [1,0,0,1]
        ];
        const rot = rotations.findIndex(r => 
          r[0] === open[0] && r[1] === open[1] && r[2] === open[2] && r[3] === open[3]
        );
        return {type: "L", rot: rot !== -1 ? rot : 0};
      }
    } else if (open.filter(x => x).length === 3) {
      const rotations = [
        [0,1,1,1], [1,0,1,1], [1,1,0,1], [1,1,1,0]
      ];
      const rot = rotations.findIndex(r => 
        r[0] === open[0] && r[1] === open[1] && r[2] === open[2] && r[3] === open[3]
      );
      return {type: "T", rot: rot !== -1 ? rot : 0};
    }
    
    return {type: "X", rot: 0};
  }

  function neighbors(idx) {
    const r = Math.floor(idx / SIZE), c = idx % SIZE;
    const list = [];
    if (r > 0) list.push({idx: (r-1)*SIZE + c, dir: "top", back: "bottom"});
    if (c < SIZE-1) list.push({idx: r*SIZE + (c+1), dir: "right", back: "left"});
    if (r < SIZE-1) list.push({idx: (r+1)*SIZE + c, dir: "bottom", back: "top"});
    if (c > 0) list.push({idx: r*SIZE + (c-1), dir: "left", back: "right"});
    return list;
  }

  const DIRI = {top:0, right:1, bottom:2, left:3};

  // Game state
  let level = 0;
  let state = null;

  function goHome() {
    showScreen("title");
    updateLevelLabel(null);
    $("#homeBtn").classList.add("hidden");
    clearInterval(timer);
    // show neutral timer on the menu
    timerLabel.textContent = "Time: —s";
    timerLabel.classList.remove("warning");
  }

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function updateLevelLabel(n) {
    levelLabel.textContent = n ? `Level: ${n}/${TOTAL_LEVELS}` : "Level: —/10";
  }

  function startGame(difficulty) {
    currentDifficulty = difficulty;
    SIZE = DIFFICULTY[difficulty].size;
    showScreen("game");
    updateLevelLabel(1);
    $("#homeBtn").classList.remove("hidden");
    // show selected difficulty's time in the header immediately
    timerLabel.textContent = `Time: ${DIFFICULTY[difficulty].time}s`;
    timerLabel.classList.remove("warning");
    // play start sound when user selects a difficulty
    playSfx("start");
    openModal(
      "Instructions",
      `<ul>
        <li>Tap/click tiles to <b>rotate pipes</b>.</li>
        <li>Connect the <b>clean water</b> to the <b>well</b>.</li>
        <li>Avoid the <b>dirty water</b> reaching the well or touching the clean stream.</li>
        <li>Time limit: ${DIFFICULTY[difficulty].time} seconds</li>
      </ul>`,
      [{label: "Play", action: () => startLevel(1), primary: true}]
    );
  }

  function startLevel(n) {
    level = n;
    updateLevelLabel(level);
    const seed = 1000 + n * 97 + (currentDifficulty === "medium" ? 100 : currentDifficulty === "hard" ? 200 : 0);
    state = makeLevel(seed);
    renderGrid();
    startTimer();
  }

  function startTimer() {
    timeLeft = DIFFICULTY[currentDifficulty].time;
    updateTimerDisplay();
    clearInterval(timer);
    timerLabel.classList.remove("warning");
    
    timer = setInterval(() => {
      timeLeft--;
      updateTimerDisplay();
      
      if (timeLeft <= 5) {
        timerLabel.classList.add("warning");
      }
      
      if (timeLeft <= 0) {
        clearInterval(timer);
        timeUp();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    timerLabel.textContent = `Time: ${timeLeft}s`;
  }

  function timeUp() {
    playSfx("gameover");
    flashOutcome(false);
    openModal("Time's Up!", "You ran out of time! The clean water didn't reach the well in time.", [
      {label: "Retry", action: () => startLevel(level), primary: true},
      {label: "Menu", action: () => goHome()}
    ]);
  }

  function renderGrid() {
    gridEl.innerHTML = "";
    gridEl.className = `grid ${currentDifficulty}`;
    
    state.grid.forEach((cell, i) => {
      const btn = document.createElement("button");
      btn.className = "cell";
      btn.setAttribute("role", "gridcell");
      btn.setAttribute("aria-label", "pipe");
      btn.dataset.index = i;
      btn.addEventListener("click", () => rotate(i));
      
      if (cell.type === "S") {
        btn.classList.add("source-clean");
        const img = document.createElement("img");
        img.src = "assets/water.png";
        img.alt = "Clean Water Source";
        btn.appendChild(img);
      } else if (cell.type === "D") {
        btn.classList.add("source-dirty");
        const img = document.createElement("img");
        img.src = "assets/dirty_water.png";
        img.alt = "Dirty Water Source";
        btn.appendChild(img);
      } else if (cell.type === "W") {
        btn.classList.add("well");
        const img = document.createElement("img");
        img.src = "assets/well.png";
        img.alt = "Well";
        btn.appendChild(img);
      } 
      else if (cell.type === "W") {
        btn.classList.add("well");

        const img = document.createElement("img");
        img.src = "assets/well.png";
        img.alt = "Well";
        img.onerror = () => {
          // Fallback if image path is wrong or missing
          btn.textContent = "🪣";
        };
        btn.appendChild(img);

        // Small corner badge so it’s always obvious
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "Well";
        btn.appendChild(badge);
      }
      else {
        updatePipeVisual(btn, cell.type, cell.rot);
      }
      
      gridEl.appendChild(btn);
    });
  }

  function updatePipeVisual(cellElement, type, rotation) {
    const existingPipe = cellElement.querySelector('.pipe');
    if (existingPipe) {
      cellElement.removeChild(existingPipe);
    }

    const pipeDiv = document.createElement("div");
    pipeDiv.className = "pipe";
    
    switch(type) {
      case "I":
        pipeDiv.classList.add("straight");
        pipeDiv.classList.add(rotation % 2 === 0 ? "vertical" : "horizontal");
        break;
      case "L":
        pipeDiv.classList.add("elbow");
        const elbowOrientations = ["top-right", "right-bottom", "bottom-left", "left-top"];
        pipeDiv.classList.add(elbowOrientations[rotation]);
        break;
      case "T":
        pipeDiv.classList.add("tee");
        const teeOrientations = ["top", "right", "bottom", "left"];
        pipeDiv.classList.add(teeOrientations[rotation]);
        break;
      case "X":
        pipeDiv.classList.add("cross");
        break;
      case ".":
        pipeDiv.classList.add("blocker");
        break;
    }
    
    cellElement.appendChild(pipeDiv);
  }

  function rotate(i) {
    const cell = state.grid[i];
    if (["S", "D", "W", "."].includes(cell.type)) return;
    
    cell.rot = (cell.rot + 1) % 4;
    const cellElement = gridEl.children[i];
    updatePipeVisual(cellElement, cell.type, cell.rot);
    
    checkResult();
  }

  function checkResult() {
    const {grid, Spos, Dpos, Wpos} = state;
    const seenC = new Set([Spos]);
    // tolerate missing dirty source
    const seenD = (Dpos !== null && typeof Dpos !== 'undefined') ? new Set([Dpos]) : new Set();
    let frontierC = [Spos], frontierD = (Dpos !== null && typeof Dpos !== 'undefined') ? [Dpos] : [];

    // Clear previous connection states
    for (let i = 0; i < gridEl.children.length; i++) {
      gridEl.children[i].classList.remove("connected-clean", "connected-dirty");
    }

    let arrived = { clean: false, dirty: false, meet: false };

    while ((frontierC.length || frontierD.length) && !(arrived.clean || arrived.dirty || arrived.meet)) {
      // Process clean water
      const nextC = [];
      for (const idx of frontierC) {
        gridEl.children[idx].classList.add("connected-clean");
        if (idx === Wpos) {
          arrived.clean = true;
          break;
        }
        for (const nb of neighbors(idx)) {
          if (canFlow(grid, idx, nb.idx) && !seenC.has(nb.idx)) {
            seenC.add(nb.idx);
            nextC.push(nb.idx);
          }
        }
      }
      if (arrived.clean) break;

      // Process dirty water
      const nextD = [];
      for (const idx of frontierD) {
        gridEl.children[idx].classList.add("connected-dirty");
        if (idx === Wpos) {
          arrived.dirty = true;
          break;
        }
        for (const nb of neighbors(idx)) {
          if (canFlow(grid, idx, nb.idx) && !seenD.has(nb.idx)) {
            if (seenC.has(nb.idx)) {
              arrived.meet = true;
            }
            seenD.add(nb.idx);
            nextD.push(nb.idx);
          }
        }
      }
      if (arrived.dirty || arrived.meet) break;

      frontierC = nextC;
      frontierD = nextD;

      // Check for meeting
      for (const c of frontierC) {
        if (seenD.has(c)) {
          arrived.meet = true;
          break;
        }
      }
      for (const d of frontierD) {
        if (seenC.has(d)) {
          arrived.meet = true;
          break;
        }
      }
    }

    if (arrived.dirty || arrived.meet) {
      clearInterval(timer);
      playSfx("gameover");
      flashOutcome(false);
      openModal("Try Again", "Dirty water reached the well or touched clean water.", [
        {label: "Retry", action: () => startLevel(level), primary: true},
        {label: "Menu", action: () => goHome()}
      ]);
      return;
    }
    
    if (arrived.clean) {
      clearInterval(timer);
      playSfx("win");
      flashOutcome(true);
      if (level < TOTAL_LEVELS) {
        openModal("Level Complete 🎉", "Great job! Ready for the next challenge?", [
          {label: "Next Level", action: () => startLevel(level + 1), primary: true},
        ]);
      } else {
        openModal("Congrats!!!", `
          <p>You beat the game on ${currentDifficulty} difficulty! Now it's your turn to connect people with clean water.</p>
        `, [
          {label: "Visit Charity: Water", action: () => window.open("https://www.charitywater.org/", "_blank"), primary: true},
          {label: "Play Again", action: () => goHome()}
        ]);
      }
    }
  }

  function canFlow(grid, a, b) {
    const A = grid[a], B = grid[b];
    const rel = relation(a, b);
    if (!rel) return false;
    const openA = CONNECT[A.type][A.rot][DIRI[rel.dir]];
    const openB = CONNECT[B.type][B.rot][DIRI[rel.back]];
    return openA && openB;
  }

  function relation(a, b) {
    const ar = Math.floor(a / SIZE), ac = a % SIZE;
    const br = Math.floor(b / SIZE), bc = b % SIZE;
    if (ar === br && ac + 1 === bc) return {dir: "right", back: "left"};
    if (ar === br && ac - 1 === bc) return {dir: "left", back: "right"};
    if (ac === bc && ar + 1 === br) return {dir: "bottom", back: "top"};
    if (ac === bc && ar - 1 === br) return {dir: "top", back: "bottom"};
    return null;
  }

  function flashOutcome(win) {
    const idx = state.Wpos;
    const el = gridEl.children[idx];
    el.classList.remove("win", "lose");
    void el.offsetWidth;
    el.classList.add(win ? "win" : "lose");
    setTimeout(() => el.classList.remove("win", "lose"), 800);
  }

  function openModal(title, bodyHTML, actions = []) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHTML;
    modalActions.innerHTML = "";
    actions.forEach(a => {
      const b = document.createElement("button");
      b.className = "btn " + (a.primary ? "primary" : "secondary");
      b.textContent = a.label;
      b.addEventListener("click", () => { closeModal(); a.action && a.action(); });
      modalActions.appendChild(b);
    });
    modal.classList.remove("hidden");
  }

  function closeModal() { 
    modal.classList.add("hidden");
  }

  // RNG
  function mulberry32(a) {
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }

  // Init
  function init() {
    showScreen("title");
    updateLevelLabel(null);
  }
  
  init();
})();