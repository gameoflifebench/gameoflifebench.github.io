const benchmarkConfig = window.CELL_AUTO_BENCHMARK_CONFIG;
const meta = document.getElementById("meta");
const benchmarkLog = document.getElementById("benchmark-log");
const leaderboardTable = document.getElementById("leaderboard-table");
const benchmarkViewCanvas = document.getElementById("benchmark-view-canvas");
const bestBoardModel = document.getElementById("best-board-model");
const benchmarkViewLabel = document.getElementById("benchmark-view-label");
const simulateBoardButton = document.getElementById("simulate-board-button");
const benchmarkSimStatus = document.getElementById("benchmark-sim-status");
const benchmarkPlayButton = document.getElementById("benchmark-play-button");
const benchmarkPauseButton = document.getElementById("benchmark-pause-button");
const benchmarkFrameSlider = document.getElementById("benchmark-frame-slider");
const benchmarkCtx = benchmarkViewCanvas.getContext("2d");
const sortState = { key: "submission_score", direction: "desc" };

let selectedEntry = null;
let simFrames = [];
let simAnimationHandle = null;

simulateBoardButton.addEventListener("click", simulateSelectedBoard);
benchmarkPlayButton.addEventListener("click", playSimulation);
benchmarkPauseButton.addEventListener("click", stopSimulation);
benchmarkFrameSlider.addEventListener("input", () => {
  const index = Number(benchmarkFrameSlider.value);
  if (simFrames[index]) {
    drawBoard(simFrames[index]);
  }
});

loadLeaderboard();

async function loadLeaderboard() {
  try {
    const response = await fetch("./leaderboard.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load leaderboard.json (${response.status})`);
    }
    const payload = await response.json();
    const entries = payload.leaderboard || [];
    meta.textContent = `${entries.length} ranked models`;
    renderLeaderboard(entries);
  } catch (error) {
    meta.textContent = "load failed";
    leaderboardTable.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function renderLeaderboard(entries) {
  if (!entries.length) {
    leaderboardTable.innerHTML = '<div class="empty-state">No benchmark results published yet.</div>';
    return;
  }

  const sortedEntries = [...entries].sort(compareEntries);
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>rank</th>
        <th data-sort-key="provider">provider</th>
        <th data-sort-key="model_name">model</th>
        <th data-sort-key="submission_score">max</th>
        <th data-sort-key="best_average_score">avg</th>
        <th data-sort-key="total_cost">cost</th>
        <th data-sort-key="trial_count">total runs</th>
        <th data-sort-key="alive_count">alive cells</th>
        <th data-sort-key="avg_output_tokens">avg tokens</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  sortedEntries.forEach((entry, index) => {
    const modelParts = splitModel(entry.model);
    const row = document.createElement("tr");
    row.dataset.rank = String(entry.rank);
    row.dataset.provider = modelParts.provider;
    row.dataset.modelName = modelParts.name;
    row.dataset.model = entry.model;
    row.dataset.bestBoard = JSON.stringify(entry.best_board);
    row.dataset.trialCount = String(entry.trial_count ?? 0);
    row.dataset.aliveCount = String(countAliveCells(entry.best_board));
    row.dataset.submissionScore = String(entry.submission_score);
    row.dataset.bestAverageScore = String(entry.best_average_score);
    row.dataset.avgOutputTokens = entry.avg_output_tokens == null ? "" : String(entry.avg_output_tokens);
    row.dataset.bestRunId = entry.best_run_id || "";
    row.dataset.bestBenchmarkId = entry.best_benchmark_id || "";
    row.dataset.totalCost = entry.total_cost == null ? "" : String(entry.total_cost);
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${modelParts.provider}</td>
      <td>${modelParts.name}</td>
      <td>${entry.submission_score}</td>
      <td>${Number(entry.best_average_score).toFixed(2)}</td>
      <td>${formatCost(entry.total_cost)}</td>
      <td>${entry.trial_count ?? 0}</td>
      <td>${countAliveCells(entry.best_board)}</td>
      <td>${formatAvgOutputTokens(entry.avg_output_tokens)}</td>
    `;
    row.addEventListener("click", () => renderBestBoard(entry));
    if (index === 0) {
      row.classList.add("selected");
      renderBestBoard(entry);
    }
    tbody.appendChild(row);
  });

  leaderboardTable.innerHTML = "";
  leaderboardTable.appendChild(table);
  decorateSortHeaders(table);
  bindSortHeaders(table);
}

function renderBestBoard(entry) {
  selectedEntry = entry;
  stopSimulation();
  simFrames = [];
  benchmarkFrameSlider.max = "0";
  benchmarkFrameSlider.value = "0";
  bestBoardModel.textContent = entry.model;
  benchmarkViewLabel.textContent = "submission";
  benchmarkSimStatus.textContent = "idle";
  benchmarkLog.textContent = "Select a model and load its simulation.";
  drawBoard(entry.best_board);

  document.querySelectorAll("#leaderboard-table tbody tr").forEach((row) => row.classList.remove("selected"));
  const selectedRow = Array.from(document.querySelectorAll("#leaderboard-table tbody tr")).find(
    (row) => row.dataset.model === entry.model
  );
  if (selectedRow) {
    selectedRow.classList.add("selected");
  }
}

function simulateSelectedBoard() {
  if (!selectedEntry) {
    return;
  }
  stopSimulation();
  benchmarkViewLabel.textContent = "simulation";
  benchmarkSimStatus.textContent = "loading...";

  try {
    const simulation = simulateBoard(selectedEntry.best_board, benchmarkConfig.maxSteps);
    simFrames = simulation.frames;
    benchmarkFrameSlider.max = String(Math.max(simFrames.length - 1, 0));
    benchmarkFrameSlider.value = "0";
    drawBoard(simFrames[0]);
    benchmarkSimStatus.textContent = `score ${simulation.score}`;
    benchmarkLog.textContent = `Loaded ${selectedEntry.model} submission. Score ${simulation.score}.`;
    playSimulation();
  } catch (error) {
    benchmarkSimStatus.textContent = "simulation failed";
    benchmarkLog.textContent = error.message;
  }
}

function simulateBoard(initialBoard, maxSteps) {
  const seen = new Map();
  const frames = [cloneBoard(initialBoard)];
  let current = cloneBoard(initialBoard);
  const initialKey = serializeBoard(current);
  seen.set(initialKey, 0);

  let repeatStep = 0;
  for (let step = 1; step <= maxSteps; step += 1) {
    current = nextBoard(current);
    const cloned = cloneBoard(current);
    frames.push(cloned);
    const key = serializeBoard(cloned);
    if (seen.has(key)) {
      repeatStep = step;
      break;
    }
    seen.set(key, step);
  }

  return {
    frames,
    score: repeatStep || maxSteps
  };
}

function nextBoard(board) {
  const rows = benchmarkConfig.rows;
  const cols = benchmarkConfig.cols;
  const next = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      let neighbors = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) {
            continue;
          }
          const rr = (r + dr + rows) % rows;
          const cc = (c + dc + cols) % cols;
          neighbors += board[rr][cc];
        }
      }

      if (board[r][c]) {
        next[r][c] = neighbors === 2 || neighbors === 3 ? 1 : 0;
      } else {
        next[r][c] = neighbors === 3 ? 1 : 0;
      }
    }
  }

  return next;
}

function serializeBoard(board) {
  return board.map((row) => row.join("")).join("|");
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function playSimulation() {
  stopSimulation();
  if (!simFrames.length) {
    benchmarkLog.textContent = "Load a simulation first.";
    return;
  }
  benchmarkSimStatus.textContent = "playing";
  let index = Number(benchmarkFrameSlider.value);
  simAnimationHandle = window.setInterval(() => {
    drawBoard(simFrames[index]);
    benchmarkFrameSlider.value = String(index);
    index = (index + 1) % simFrames.length;
  }, 260);
}

function stopSimulation() {
  if (simAnimationHandle !== null) {
    window.clearInterval(simAnimationHandle);
    simAnimationHandle = null;
    if (simFrames.length) {
      benchmarkSimStatus.textContent = "paused";
    }
  }
}

function drawBoard(board) {
  const rows = benchmarkConfig.rows;
  const cols = benchmarkConfig.cols;
  const size = Math.min(benchmarkViewCanvas.width / cols, benchmarkViewCanvas.height / rows);
  const deadFill = "#0c1311";
  const liveFill = "#8df7a9";
  const gridLine = "rgba(126, 240, 163, 0.12)";

  benchmarkCtx.clearRect(0, 0, benchmarkViewCanvas.width, benchmarkViewCanvas.height);
  benchmarkCtx.fillStyle = "#050908";
  benchmarkCtx.fillRect(0, 0, benchmarkViewCanvas.width, benchmarkViewCanvas.height);
  benchmarkCtx.strokeStyle = gridLine;
  benchmarkCtx.lineWidth = 1;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = c * size;
      const y = r * size;
      benchmarkCtx.fillStyle = deadFill;
      benchmarkCtx.fillRect(x, y, size, size);
      if (board?.[r]?.[c]) {
        benchmarkCtx.fillStyle = liveFill;
        benchmarkCtx.fillRect(x + 3, y + 3, size - 6, size - 6);
      }
      benchmarkCtx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }
  }
}

function bindSortHeaders(table) {
  table.querySelectorAll("th[data-sort-key]").forEach((header) => {
    header.addEventListener("click", () => {
      const key = header.dataset.sortKey;
      if (sortState.key === key) {
        sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
      } else {
        sortState.key = key;
        sortState.direction = key === "provider" || key === "model_name" ? "asc" : "desc";
      }
      sortStaticTable(table);
      decorateSortHeaders(table);
    });
  });
}

function decorateSortHeaders(table) {
  table.querySelectorAll("th[data-sort-key]").forEach((header) => {
    const key = header.dataset.sortKey;
    const base = header.textContent.replace(/[▲▼]$/, "").trim();
    header.textContent = key === sortState.key ? `${base}${sortState.direction === "asc" ? " ▲" : " ▼"}` : base;
  });
}

function sortStaticTable(table) {
  const tbody = table.querySelector("tbody");
  const rows = Array.from(tbody.querySelectorAll("tr"));
  rows.sort((a, b) => compareRowData(rowToEntry(a), rowToEntry(b)));
  rows.forEach((row, index) => {
    row.children[0].textContent = String(index + 1);
    tbody.appendChild(row);
  });
}

function rowToEntry(row) {
  return {
    rank: Number(row.dataset.rank),
    provider: row.dataset.provider,
    model_name: row.dataset.modelName,
    trial_count: Number(row.dataset.trialCount),
    alive_count: Number(row.dataset.aliveCount),
    submission_score: Number(row.dataset.submissionScore),
    best_average_score: Number(row.dataset.bestAverageScore),
    avg_output_tokens: row.dataset.avgOutputTokens ? Number(row.dataset.avgOutputTokens) : null,
    total_cost: row.dataset.totalCost ? Number(row.dataset.totalCost) : null
  };
}

function compareEntries(a, b) {
  return compareRowData(
    {
      rank: a.rank,
      provider: splitModel(a.model).provider,
      model_name: splitModel(a.model).name,
      trial_count: a.trial_count ?? 0,
      alive_count: countAliveCells(a.best_board),
      submission_score: a.submission_score,
      best_average_score: a.best_average_score,
      avg_output_tokens: a.avg_output_tokens,
      total_cost: a.total_cost
    },
    {
      rank: b.rank,
      provider: splitModel(b.model).provider,
      model_name: splitModel(b.model).name,
      trial_count: b.trial_count ?? 0,
      alive_count: countAliveCells(b.best_board),
      submission_score: b.submission_score,
      best_average_score: b.best_average_score,
      avg_output_tokens: b.avg_output_tokens,
      total_cost: b.total_cost
    }
  );
}

function compareRowData(a, b) {
  const direction = sortState.direction === "asc" ? 1 : -1;
  const key = sortState.key;
  const aValue = a[key];
  const bValue = b[key];

  if (typeof aValue === "string" || typeof bValue === "string") {
    return String(aValue).localeCompare(String(bValue)) * direction;
  }

  const aNumber = aValue == null ? Number.NEGATIVE_INFINITY : Number(aValue);
  const bNumber = bValue == null ? Number.NEGATIVE_INFINITY : Number(bValue);
  if (aNumber === bNumber) {
    return 0;
  }
  return (aNumber - bNumber) * direction;
}

function splitModel(modelId) {
  const slashIndex = modelId.indexOf("/");
  if (slashIndex === -1) {
    return { provider: "unknown", name: modelId };
  }
  return {
    provider: modelId.slice(0, slashIndex),
    name: modelId.slice(slashIndex + 1)
  };
}

function formatCost(value) {
  return value == null || Number.isNaN(value) ? "-" : `$${Number(value).toFixed(4)}`;
}

function formatAvgOutputTokens(value) {
  return value == null || Number.isNaN(value) ? "-" : Number(value).toFixed(1);
}

function countAliveCells(board) {
  if (!Array.isArray(board)) {
    return 0;
  }

  return board.reduce(
    (total, row) => total + (Array.isArray(row) ? row.reduce((sum, cell) => sum + Number(Boolean(cell)), 0) : 0),
    0
  );
}
