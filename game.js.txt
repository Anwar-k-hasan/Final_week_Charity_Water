/* Where’s My Clean Water!!! — Vanilla JS, single grid per level
   Tiles:
   - "S": clean source (💧)
   - "D": dirty source (🔥)
   - "W": well/basket (🪣)
   - Pipes: "I" (straight), "L" (elbow), "T" (tee), "X" (cross), "." (blocker/empty)
   Rotation states are 0..3 (0=default). Connections are encoded per rotation.
*/

(() => {
  const $ = (sel) => document.querySelector(sel);
  const gridEl = $("#grid");
  const screens = { title: $("#titleScreen"), game: $("#gameScreen") };
  const levelLabel = $("#levelLabel");
  const modal = $("#modal");
  const modalBody = $("#modalBody");
  const modalTitle = $("#modalTitle");
  const modalActions = $("#modalActions");

  $("#homeBtn").addEventListener("click", () => goHome());
  $("#startBtn").addEventListener("click", () => showInstructions());
  $("#modalClose").addEventListener("click", () => closeModal());

  const SIZE = 5;                  // 5x5 grid
  const TOTAL_LEVELS = 10;

  // Pipe connection maps: for rotation r (0..3) which sides open? [top,right,bottom,left]
  const CONNECT = {
    "I": [
      [1,0,1,0], // vertical
      [0,1,0,1], // horizontal
      [1,0,1,0],
      [0,1,0,1],
    ],
    "L": [
      [1,1,0,0], // top-right
      [0,1,1,0], // right-bottom
      [0,0,1,1], // bottom-left
      [1,0,0,1], // left-top
    ],
    "T": [
      [0,1,1,1], // no top
      [1,0,1,1], // no right
      [1,1,0,1], // no bottom
      [1,1,1,0], // no left
    ],
    "X": [
      [1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]
    ],
    ".": [
      [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]
    ],
    "S": [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]], // treat as open; visual only
    "D": [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]],
    "W": [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]],
  };
  const ICON = { S:"💧", D:"🦠", W:"🪣", I:"┃", L:"┗", T:"┬", X:"╋", ".":"✖" };

  // helper: return true if two indices are orthogonally adjacent
  function isAdjacent(a, b){
    return neighbors(a).some(n => n.idx === b);
  }

  // --- Level generator: guaranteed path from S to W, dirty elsewhere
  function makeLevel(seed) {
    const rng = mulberry32(seed);
    // grid of objects: {type, rot}
    const grid = Array.from({length: SIZE*SIZE}, () => ({type: ".", rot: 0}));

    // pick random S and W on edges; ensure different and not adjacent
    const edges = edgeCells();
    const Spos = edges[Math.floor(rng()*edges.length)];
    let Wpos = edges[Math.floor(rng()*edges.length)];
    // re-pick while same as S or adjacent to S
    while (Wpos === Spos || isAdjacent(Wpos, Spos)) {
      Wpos = edges[Math.floor(rng()*edges.length)];
    }

    // carve simple random walk path between S -> W
    const path = carvePath(Spos, Wpos, rng);
    // place correct pipe pieces along the path with rotations aligned
    for (let i=0;i<path.length;i++){
      const here = path[i], prev = path[i-1], next = path[i+1];
      if (i===0){ grid[here] = {type:"S", rot:0}; continue; }
      if (i===path.length-1){ grid[here] = {type:"W", rot:0}; continue; }
      const dirs = neighbors(here).filter(n=>n.idx===prev || n.idx===next).map(n=>n.dir);
      const piece = derivePiece(dirs);
      grid[here] = piece;
    }

    // drop random filler pieces into remaining cells
    const pool = ["I","L","T","X",".",".","L","I"];
    for (let i=0;i<grid.length;i++){
      if (grid[i].type===".") {
        const t = pool[Math.floor(rng()*pool.length)];
        grid[i] = {type:t, rot:Math.floor(rng()*4)};
      }
    }

    // place dirty source away from the main path start and not adjacent to S or W
    let Dpos = Math.floor(rng()*grid.length);
    let tries = 0;
    while ((Dpos===Spos || Dpos===Wpos || path.includes(Dpos) || isAdjacent(Dpos, Spos) || isAdjacent(Dpos, Wpos)) && tries<200){
      Dpos = Math.floor(rng()*grid.length); tries++;
    }
    grid[Dpos] = {type:"D", rot:0};

    // randomize rotations for all non-source tiles so the carved path is not revealed immediately
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i].type;
      // keep sources visually stable (S, W, D), randomize everything else
      if (t !== "S" && t !== "W" && t !== "D") {
        grid[i].rot = Math.floor(rng() * 4); // 0..3
      }
    }

    return { grid, Spos, Dpos, Wpos };
  }

  function edgeCells(){
    const list=[];
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        if (r===0||c===0||r===SIZE-1||c===SIZE-1) list.push(r*SIZE+c);
      }
    }
    return list;
  }
  function carvePath(start, goal, rng){
    // simple greedy/random step toward goal with Manhattan moves; ensures solvable
    const sr = Math.floor(start/SIZE), sc = start%SIZE;
    const gr = Math.floor(goal/SIZE), gc = goal%SIZE;
    let r=sr, c=sc;
    const path=[start];
    const lim=200;
    let steps=0;
    while ((r!==gr || c!==gc) && steps<lim){
      const moves=[];
      if (gr>r) moves.push([1,0]);
      if (gr<r) moves.push([-1,0]);
      if (gc>c) moves.push([0,1]);
      if (gc<c) moves.push([0,-1]);
      // add some randomness
      if (rng()<0.35) moves.reverse();
      const m = moves[Math.floor(rng()*moves.length)];
      r+=m[0]; c+=m[1];
      const idx=r*SIZE+c;
      if(!path.includes(idx)) path.push(idx);
      steps++;
    }
    return path;
  }
  function derivePiece(dirs){
    // dirs: array of direction strings from {top,right,bottom,left}
    const mapIdx = {top:0,right:1,bottom:2,left:3};
    const open = [0,0,0,0]; dirs.forEach(d=>open[mapIdx[d]]=1);
    // decide piece & rotation that has those two opens
    const candidates = ["I","L","T","X"];
    for (const t of candidates){
      for (let rot=0; rot<4; rot++){
        const conn = CONNECT[t][rot];
        if (equals2(conn, open)) return {type:t, rot};
        // also allow T/X to match exactly two sides when possible
        if (t==="T"||t==="X"){
          const subset = conn.map((v,i)=> open[i] ? v : 0);
          if (equals2(subset, open)) return {type:t, rot};
        }
      }
    }
    // fallback
    return {type:"I", rot:0};
  }
  function equals2(a,b){ return a.every((v,i)=>v===b[i]); }

  // neighbor helper
  function neighbors(idx){
    const r = Math.floor(idx/SIZE), c = idx%SIZE;
    const list=[];
    if (r>0) list.push({idx:(r-1)*SIZE+c, dir:"top", back:"bottom"});
    if (c<SIZE-1) list.push({idx:r*SIZE+(c+1), dir:"right", back:"left"});
    if (r<SIZE-1) list.push({idx:(r+1)*SIZE+c, dir:"bottom", back:"top"});
    if (c>0) list.push({idx:r*SIZE+(c-1), dir:"left", back:"right"});
    return list;
  }
  const DIRI = {top:0,right:1,bottom:2,left:3};

  // --- Game state
  let level = 0;
  let state = null; // {grid,Spos,Dpos,Wpos}

  function goHome(){
    showScreen("title");
    updateLevelLabel(null);
  }
  function showScreen(name){
    Object.values(screens).forEach(s=>s.classList.remove("active"));
    screens[name].classList.add("active");
  }
  function updateLevelLabel(n){
    levelLabel.textContent = n ? `Level: ${n}/${TOTAL_LEVELS}` : "Level: —/10";
  }

  function showInstructions(){
    showScreen("game");
    updateLevelLabel(1);
    openModal(
      "Instructions",
      `<ul>
        <li>Tap/click tiles to <b>rotate pipes</b>.</li>
        <li>Connect the <b>clean water</b> (💧) to the <b>well</b> (🪣).</li>
        <li>Avoid the <b>dirty water</b> (🔥) reaching the well or touching the clean stream.</li>
      </ul>`,
      [{label:"Play", action:() => startLevel(1), primary:true}]
    );
  }

  function startLevel(n){
    level = n;
    updateLevelLabel(level);
    state = makeLevel(1000 + n*97); // deterministic but varied
    renderGrid();
  }

  function renderGrid(){
    gridEl.innerHTML = "";
    gridEl.style.gridTemplateColumns = `repeat(${SIZE}, 1fr)`;
    state.grid.forEach((cell, i) => {
      const btn = document.createElement("button");
      btn.className = "cell";
      btn.setAttribute("role","gridcell");
      btn.setAttribute("aria-label","pipe");
      btn.dataset.index = i;
      btn.addEventListener("click", () => rotate(i));
      // content & badges
      const span = document.createElement("span");
      span.className = "icon";
      span.textContent = iconFor(cell);
      btn.appendChild(span);

    //   if (cell.type==="S") addTag(btn, "Clean", "clean");
    //   if (cell.type==="D") addTag(btn, "Dirty", "dirty");
    //   if (cell.type==="W") addTag(btn, "Well", "well");
      gridEl.appendChild(btn);
    });
  }
  function iconFor(cell){
    // use box-drawing chars + rotate via CSS? simpler: change char per rot
    const t = cell.type;
    if (t==="I"){
      return (cell.rot%2===0) ? "┃" : "━";
    }
    if (t==="L"){
      return ["┗","┏","┓","┛"][cell.rot];
    }
    if (t==="T"){
      return ["┬","┤","┴","┝"][cell.rot]; // approximate tee shapes
    }
    return ICON[t] || " ";
  }
  function addTag(btn, text, cls){
    const s = document.createElement("span");
    s.className = `tag ${cls}`;
    s.textContent = text;
    btn.appendChild(s);
  }

  function rotate(i){
    const cell = state.grid[i];
    if (["S","D","W","."].includes(cell.type)) return; // fixed or empty
    cell.rot = (cell.rot + 1) % 4;
    // update icon
    const span = gridEl.children[i].querySelector(".icon");
    span.textContent = iconFor(cell);
    // check result after each rotation
    checkResult();
  }

  // --- Simulation: BFS waves from clean and dirty, step by step
  function checkResult(){
    const {grid, Spos, Dpos, Wpos} = state;
    const seenC = new Set([Spos]);
    const seenD = new Set([Dpos]);
    let frontierC = [Spos], frontierD = [Dpos];
    let step = 0;

    const arrived = { clean:false, dirty:false, meet:false };

    while ((frontierC.length || frontierD.length) && step < SIZE*SIZE*2){
      step++;
      const nextC = [];
      for (const idx of frontierC){
        // reached well?
        if (idx===Wpos){ arrived.clean = true; break; }
        for (const nb of neighbors(idx)){
          if (canFlow(grid, idx, nb.idx, "C") && !seenC.has(nb.idx)){
            seenC.add(nb.idx); nextC.push(nb.idx);
          }
        }
      }
      if (arrived.clean) break;

      const nextD = [];
      for (const idx of frontierD){
        if (idx===Wpos){ arrived.dirty = true; break; }
        for (const nb of neighbors(idx)){
          if (canFlow(grid, idx, nb.idx, "D") && !seenD.has(nb.idx)){
            // contamination check: did we meet clean?
            if (seenC.has(nb.idx)) arrived.meet = true;
            seenD.add(nb.idx); nextD.push(nb.idx);
          }
        }
      }
      if (arrived.dirty) break;

      frontierC = nextC;
      frontierD = nextD;
      // also check cross-contam both ways
      for (const p of frontierC) if (seenD.has(p)) arrived.meet = true;
      if (arrived.meet) break;
    }

    // decide outcome: dirty to well OR meet -> fail; clean to well first -> win
    if (arrived.dirty || arrived.meet){
      flashOutcome(false);
      openModal("Try Again", "Dirty water reached the well or touched clean water.", [
        {label:"Retry", action:()=>startLevel(level), primary:true},
      ]);
      return;
    }
    if (arrived.clean){
      flashOutcome(true);
      if (level < TOTAL_LEVELS){
        openModal("Level Complete 🎉", "Great job! Ready for the next challenge?", [
          {label:"Next Level", action:()=>startLevel(level+1), primary:true},
        ]);
      } else {
        openModal("Congrats!!!", `
          <p>You beat the game. Now it’s your turn to connect people with clean water.</p>
        `, [
          {label:"Visit Charity: Water", action:()=>window.open("https://www.charitywater.org/", "_blank"), primary:true}
        ]);
      }
    }
  }

  function canFlow(grid, a, b, kind){
    // Both cells must be pipe-like and have matching open sides
    const A = grid[a], B = grid[b];
    const rel = relation(a,b);
    if (!rel) return false;
    const openA = CONNECT[A.type][A.rot][DIRI[rel.dir]];
    const openB = CONNECT[B.type][B.rot][DIRI[rel.back]];
    // allow entering W/S/D tile (they're open in map)
    const ok = openA && openB;
    // Blockers (.) are already closed by map
    return ok;
  }
  function relation(a,b){
    const ar = Math.floor(a/SIZE), ac = a%SIZE;
    const br = Math.floor(b/SIZE), bc = b%SIZE;
    if (ar===br && ac+1===bc) return {dir:"right", back:"left"};
    if (ar===br && ac-1===bc) return {dir:"left", back:"right"};
    if (ac===bc && ar+1===br) return {dir:"bottom", back:"top"};
    if (ac===bc && ar-1===br) return {dir:"top", back:"bottom"};
    return null;
  }

  function flashOutcome(win){
    // brief outline glow on well cell for feedback
    const idx = state.Wpos;
    const el = gridEl.children[idx];
    el.classList.remove("win","lose");
    void el.offsetWidth; // reflow
    el.classList.add(win?"win":"lose");
    setTimeout(()=>el.classList.remove("win","lose"), 800);
  }

  // --- Modal helpers
  function openModal(title, bodyHTML, actions=[]){
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHTML;
    modalActions.innerHTML = "";
    actions.forEach(a=>{
      const b = document.createElement("button");
      b.className = "btn " + (a.primary ? "primary" : "secondary");
      b.textContent = a.label;
      b.addEventListener("click", () => { closeModal(); a.action && a.action(); });
      modalActions.appendChild(b);
    });
    modal.classList.remove("hidden");
  }
  function closeModal(){ modal.classList.add("hidden"); }

  // --- RNG
  function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15, t|1); t^=t+Math.imul(t^t>>>7, t|61); return ((t^t>>>14)>>>0)/4294967296; } }

  // Init
  function goHomeInit(){
    showScreen("title");
    updateLevelLabel(null);
  }
  goHomeInit();
})();
