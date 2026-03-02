async function loadLeaderboard() {
  const meta = document.getElementById("meta");
  const container = document.getElementById("leaderboard");
  try {
    const response = await fetch("./leaderboard.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load leaderboard.json (${response.status})`);
    }
    const payload = await response.json();
    meta.textContent = `${payload.benchmark_count} benchmark batches`;
    const rows = payload.leaderboard || [];
    if (!rows.length) {
      container.innerHTML = "<p>No leaderboard data found.</p>";
      return;
    }

    const table = document.createElement("table");
    table.innerHTML = `
      <thead>
        <tr>
          <th>rank</th>
          <th>provider</th>
          <th>model</th>
          <th>max</th>
          <th>avg</th>
          <th>avg tokens</th>
          <th>cost</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");
    rows.forEach((entry) => {
      const [provider, name] = splitModel(entry.model);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${entry.rank}</td>
        <td>${provider}</td>
        <td>${name}</td>
        <td>${entry.submission_score}</td>
        <td>${Number(entry.best_average_score).toFixed(2)}</td>
        <td>${formatNumber(entry.avg_output_tokens, 1)}</td>
        <td>${formatCost(entry.total_cost)}</td>
      `;
      tbody.appendChild(tr);
    });
    container.innerHTML = "";
    container.appendChild(table);
  } catch (error) {
    meta.textContent = "load failed";
    container.textContent = error.message;
  }
}

function splitModel(modelId) {
  const idx = modelId.indexOf("/");
  return idx === -1 ? ["unknown", modelId] : [modelId.slice(0, idx), modelId.slice(idx + 1)];
}

function formatCost(value) {
  return value == null ? "-" : `$${Number(value).toFixed(4)}`;
}

function formatNumber(value, digits) {
  return value == null ? "-" : Number(value).toFixed(digits);
}

loadLeaderboard();
