(function () {
  "use strict";

  const STORAGE_KEY = "meniscus-v1";

  const state = {
    acknowledged: false,
    tab: "bench",
    peptideId: "semaglutide",
    protocolId: "wegovy",
    vialMg: 5,
    waterMl: 2,
    doseMcg: 250,
    syringeMl: 0.5,
    libraryOpen: null,
    libraryQuery: "",
    libraryFilter: "all",
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      Object.assign(state, {
        acknowledged: !!saved.acknowledged,
        peptideId: saved.peptideId || state.peptideId,
        protocolId: saved.protocolId || state.protocolId,
        vialMg: Number(saved.vialMg) || state.vialMg,
        waterMl: Number(saved.waterMl) || state.waterMl,
        doseMcg: Number(saved.doseMcg) || state.doseMcg,
        syringeMl: Number(saved.syringeMl) || state.syringeMl,
      });
    } catch (_) {
      /* ignore */
    }
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          acknowledged: state.acknowledged,
          peptideId: state.peptideId,
          protocolId: state.protocolId,
          vialMg: state.vialMg,
          waterMl: state.waterMl,
          doseMcg: state.doseMcg,
          syringeMl: state.syringeMl,
        })
      );
    } catch (_) {
      /* ignore */
    }
  }

  function peptides() {
    return window.MENISCUS_DATA.peptides;
  }

  function getPeptide(id) {
    return peptides().find((p) => p.id === id);
  }

  function getProtocol(peptide, protocolId) {
    if (!peptide || !peptide.protocols.length) return null;
    return peptide.protocols.find((p) => p.id === protocolId) || peptide.protocols[0];
  }

  function syringeUnits(ml) {
    return Math.round(ml * 100);
  }

  function computeRecon(vialMg, waterMl, doseMcg, syringeMl) {
    const capacity = syringeUnits(syringeMl);
    const errors = [];
    const warnings = [];
    const notes = [];

    if (!(vialMg > 0)) errors.push("Enter a vial amount greater than zero.");
    if (!(waterMl > 0)) errors.push("Enter a diluent volume greater than zero.");
    if (!(doseMcg > 0)) errors.push("Enter a dose greater than zero.");

    if (errors.length) {
      return {
        ok: false,
        errors,
        warnings,
        notes,
        concentrationMcgPerMl: null,
        concentrationMgPerMl: null,
        drawMl: null,
        units: null,
        dosesPerVial: null,
        syringeUnits: capacity,
        perTenUnitsMcg: null,
      };
    }

    const vialMcg = vialMg * 1000;
    const concentrationMcgPerMl = vialMcg / waterMl;
    const concentrationMgPerMl = vialMg / waterMl;
    const drawMl = doseMcg / concentrationMcgPerMl;
    const units = drawMl * 100;
    const dosesPerVial = vialMcg / doseMcg;
    const perTenUnitsMcg = concentrationMcgPerMl * 0.1;

    if (doseMcg > vialMcg + 1e-6) {
      warnings.push("That dose is larger than the peptide mass in the vial.");
    }
    if (units > capacity + 0.05) {
      warnings.push(
        `Draw is ${formatUnits(units)} units, past a ${syringeMl} mL U-100 syringe (${capacity} units). Use a larger syringe or less diluent.`
      );
    } else if (units < 5) {
      warnings.push(
        "Under 5 units on a U-100 syringe is hard to measure. Less diluent makes each unit a larger share of the dose."
      );
    } else if (Math.abs(units - Math.round(units)) > 0.05) {
      warnings.push("This draw does not land on a whole unit mark.");
    }

    if (concentrationMgPerMl > 20) {
      warnings.push("Concentration is very high. A small volume error becomes a large dose error.");
    }

    if (units <= 30 && syringeMl > 0.3) {
      notes.push("This draw also fits a 0.3 mL (30-unit) syringe.");
    } else if (units <= 50 && syringeMl > 0.5) {
      notes.push("This draw also fits a 0.5 mL (50-unit) syringe.");
    }

    return {
      ok: true,
      errors,
      warnings,
      notes,
      concentrationMcgPerMl,
      concentrationMgPerMl,
      drawMl,
      units,
      dosesPerVial,
      syringeUnits: capacity,
      perTenUnitsMcg,
    };
  }

  function waterMlForTargetUnits(vialMg, doseMcg, units) {
    if (!(vialMg > 0) || !(doseMcg > 0) || !(units > 0)) return null;
    const drawMl = units / 100;
    return ((vialMg * 1000) / doseMcg) * drawMl;
  }

  function formatUnits(n) {
    if (!Number.isFinite(n)) return "—";
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function formatMl(n) {
    if (!Number.isFinite(n)) return "—";
    if (n >= 1) return (Math.round(n * 1000) / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    return (Math.round(n * 1000) / 1000).toFixed(3);
  }

  function formatMg(n) {
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    const digits = abs >= 10 ? 2 : 3;
    return n.toFixed(digits).replace(/\.?0+$/, "");
  }

  function formatMcg(n) {
    if (!Number.isFinite(n)) return "—";
    if (n >= 100) return Math.round(n).toLocaleString("en-US");
    return n.toFixed(1).replace(/\.0$/, "");
  }

  function formatEnteredDose(mcg, entry) {
    if (!Number.isFinite(mcg)) return "—";
    if (entry === "mg") return `${formatMg(mcg / 1000)} mg`;
    return `${formatMcg(mcg)} mcg`;
  }

  function formatDose(mcg) {
    if (!Number.isFinite(mcg)) return "—";
    if (mcg >= 1000) return `${formatMg(mcg / 1000)} mg`;
    return `${formatMcg(mcg)} mcg`;
  }

  function trimNumber(n) {
    if (!Number.isFinite(n)) return "";
    return n.toFixed(4).replace(/\.?0+$/, "");
  }

  function stepWeekLabel(steps, index) {
    let start = 1;
    for (let i = 0; i < index; i++) {
      const w = steps[i].weeks;
      if (w == null) return "Ongoing";
      start += w;
    }
    const w = steps[index] && steps[index].weeks;
    if (w == null) return `Week ${start} on`;
    if (w === 1) return `Week ${start}`;
    return `Weeks ${start}–${start + w - 1}`;
  }

  function supplyLabel(doses, frequency) {
    if (!Number.isFinite(doses)) return null;
    const perWeek = frequency === "weekly" ? 1 : frequency === "daily" ? 7 : frequency === "twice-weekly" ? 2 : null;
    if (!perWeek) return null;
    if (frequency === "daily") {
      const days = Math.floor(doses + 1e-9);
      return `${days.toLocaleString("en-US")} day${days === 1 ? "" : "s"} at this dose`;
    }
    const weeks = doses / perWeek;
    if (weeks >= 10) return `${Math.floor(weeks).toLocaleString("en-US")} weeks at this dose`;
    const rounded = Math.round(weeks * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${text} weeks at this dose`;
  }

  function selectPeptide(id) {
    const p = getPeptide(id);
    if (!p) return;
    const protocol = p.protocols[0];
    state.peptideId = id;
    state.protocolId = protocol ? protocol.id : "";
    state.vialMg = p.defaultVialMg;
    state.waterMl = p.defaultWaterMl;
    state.doseMcg = protocol && protocol.steps[0] ? protocol.steps[0].doseMg * 1000 : 0;
    state.syringeMl = p.defaultSyringe;
    state.tab = "bench";
    state.libraryOpen = null;
    save();
    render();
  }

  function applyStep(index) {
    const p = getPeptide(state.peptideId);
    const protocol = getProtocol(p, state.protocolId);
    const step = protocol && protocol.steps[index];
    if (!step) return;
    state.doseMcg = step.doseMg * 1000;
    save();
    render();
  }

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function syringeHtml(units, capacity) {
    const raw = units != null && Number.isFinite(units) ? Math.max(0, units) : 0;
    const pct = capacity > 0 ? Math.min(1, raw / capacity) : 0;
    return `
      <figure class="syringe">
        <div class="syringe-bar">
          <div class="syringe-needle" aria-hidden="true"></div>
          <div class="syringe-track">
            <div class="syringe-fill" style="width: max(0px, calc(${pct} * (100% - 8px)))"></div>
          </div>
          <div class="syringe-plunger" aria-hidden="true"></div>
        </div>
        <div class="syringe-scale">
          <span>0</span>
          <span>${capacity / 2}</span>
          <span>${capacity} u</span>
        </div>
        <p class="sr-only">${
          units == null ? "Syringe empty." : `${formatUnits(units)} units of ${capacity} marked.`
        }</p>
      </figure>
    `;
  }

  function renderGate() {
    const root = document.getElementById("app");
    root.innerHTML = "";
    const gate = el(`
      <main class="gate">
        <p class="tiny" style="font-weight:600;letter-spacing:0.06em;text-transform:uppercase">Research reference</p>
        <h1>Meniscus</h1>
        <p class="muted" style="margin-top:0.75rem;max-width:36rem">
          A reconstitution bench. Vial mass, diluent volume, and a dose become a syringe mark.
          Published titration schedules sit beside the math. Nothing here is a prescription.
        </p>
        <section class="card" style="margin-top:1.25rem" aria-label="Worked example">
          <p class="draw-label">Example arithmetic</p>
          <p class="muted" style="margin:0.5rem 0 0">
            5 mg in 2 mL is 2.5 mg/mL. A 0.25 mg dose is 0.100 mL, which is 10 units on a U-100 syringe.
          </p>
          ${syringeHtml(10, 50)}
          <p class="tiny">Illustration of the scale only. Not a suggested dose.</p>
        </section>
        <section style="margin-top:1.25rem;font-size:0.875rem">
          <h2 style="font-size:1rem;font-family:var(--font-sans);font-weight:600">Before you use the numbers</h2>
          <ul class="muted" style="margin:0.5rem 0 0;padding-left:1.15rem">
            <li>This is not medical advice, not a diagnosis, and not an instruction to take, give, or compound anything.</li>
            <li>Labeled schedules describe specific pharmaceutical products. A research vial is a different substance.</li>
            <li>Where a human schedule is not established, Meniscus does not invent one.</li>
            <li>Check every figure against the primary source.</li>
          </ul>
        </section>
        <label class="gate-check">
          <input type="checkbox" id="ack" />
          <span>I understand this is a research reference and volume calculator, not medical advice.</span>
        </label>
        <button type="button" class="btn btn-primary" id="enter" disabled>Enter the bench</button>
      </main>
    `);
    root.appendChild(gate);
    const ack = gate.querySelector("#ack");
    const enter = gate.querySelector("#enter");
    ack.addEventListener("change", () => {
      enter.disabled = !ack.checked;
    });
    enter.addEventListener("click", () => {
      state.acknowledged = true;
      save();
      render();
    });
  }

  function navHtml(active) {
    const items = [
      { id: "bench", label: "Bench", icon: "flask" },
      { id: "plan", label: "Plan", icon: "cal" },
      { id: "index", label: "Index", icon: "book" },
    ];
    const icons = {
      flask: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6M10 3v6.5L5.5 18a3 3 0 0 0 2.6 4.5h8a3 3 0 0 0 2.6-4.5L14 9.5V3"/><path d="M8.5 14h7"/></svg>`,
      cal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
      book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    };
    return `
      <nav class="nav" aria-label="Sections">
        <div class="nav-inner">
          ${items
            .map(
              (item) => `
            <button type="button" data-tab="${item.id}" class="${active === item.id ? "on" : ""}" ${
                active === item.id ? 'aria-current="page"' : ""
              }>
              ${icons[item.icon]}
              ${item.label}
            </button>`
            )
            .join("")}
        </div>
      </nav>
    `;
  }

  function renderBench() {
    const peptide = getPeptide(state.peptideId);
    if (!peptide) return "<p>Peptide not found.</p>";
    const protocol = getProtocol(peptide, state.protocolId);
    const result = computeRecon(state.vialMg, state.waterMl, state.doseMcg, state.syringeMl);
    const entry = peptide.doseEntry;
    const doseDisplay = entry === "mg" ? state.doseMcg / 1000 : state.doseMcg;
    const supply =
      result.dosesPerVial != null && protocol ? supplyLabel(result.dosesPerVial, protocol.frequency) : null;
    const targetWater = waterMlForTargetUnits(state.vialMg, state.doseMcg, 10);
    const alreadyTen = targetWater && Math.abs(targetWater - state.waterMl) < 0.02;
    const canFit = targetWater && targetWater > 0 && targetWater < 30;

    return `
      <div class="stack">
        <section class="card">
          <p class="draw-label">Draw</p>
          <div class="draw-row">
            <div>
              <p class="draw-units">${result.units == null ? "—" : formatUnits(result.units)}</p>
              <p class="tiny" style="margin:0.35rem 0 0">units on a U-100 syringe</p>
            </div>
            <div class="draw-meta">
              <p class="ml">${result.drawMl == null ? "—" : formatMl(result.drawMl)}<span class="unit">mL</span></p>
              <p class="muted" style="margin:0.25rem 0 0;font-variant-numeric:tabular-nums">
                ${state.doseMcg > 0 ? formatEnteredDose(state.doseMcg, entry) : "No dose"}
              </p>
            </div>
          </div>
          ${syringeHtml(result.units, result.syringeUnits)}
          <p class="tiny">U-100 scale only: 100 units = 1 mL. A U-40 syringe is a different scale.</p>
          ${
            result.ok
              ? `<dl class="stats">
                  <div><dt>Concentration</dt><dd>${formatMg(result.concentrationMgPerMl)} mg/mL</dd></div>
                  <div><dt>Each 10 units</dt><dd>${formatDose(result.perTenUnitsMcg)}</dd></div>
                  <div><dt>Withdrawals in vial</dt><dd>${
                    result.dosesPerVial > 200
                      ? "200+"
                      : (Math.floor(result.dosesPerVial * 10) / 10).toLocaleString("en-US")
                  }</dd></div>
                  <div><dt>At this dose</dt><dd>${supply || "Frequency not set"}</dd></div>
                </dl>`
              : `<ul class="muted" style="margin:1rem 0 0;padding-left:1.1rem">${result.errors
                  .map((e) => `<li>${e}</li>`)
                  .join("")}</ul>`
          }
        </section>

        ${result.warnings
          .map((w) => `<div class="warn"><span class="warn-icon" aria-hidden="true">!</span><span>${w}</span></div>`)
          .join("")}
        ${result.notes.map((n) => `<p class="tiny">${n}</p>`).join("")}

        <section>
          <div class="row-between">
            <div>
              <h2 style="font-size:1.5rem">${peptide.name}</h2>
              <p class="muted" style="margin:0.25rem 0 0;font-size:0.875rem">
                ${peptide.klass}
                <span style="color:var(--line);padding:0 0.35rem">/</span>
                ${window.MENISCUS_DATA.evidenceLabel[peptide.evidence]}
              </p>
            </div>
            <button type="button" class="btn-link" data-action="goto-index">Change</button>
          </div>

          ${
            !peptide.protocols.length
              ? `<div class="card" style="background:var(--sand);margin-top:1rem">
                  <p style="margin:0;font-weight:500;font-size:0.875rem">No published human schedule is listed.</p>
                  <p class="muted" style="margin:0.35rem 0 0;font-size:0.875rem">Enter a dose for the arithmetic only. Read the index card before treating any number as a protocol.</p>
                </div>`
              : protocol
              ? `<div style="margin-top:1rem">
                  ${
                    peptide.protocols.length > 1
                      ? `<label class="field">Published schedule
                          <div class="field-input">
                            <select id="protocol-select">
                              ${peptide.protocols
                                .map(
                                  (p) =>
                                    `<option value="${p.id}" ${
                                      p.id === protocol.id ? "selected" : ""
                                    }>${p.name}</option>`
                                )
                                .join("")}
                            </select>
                          </div>
                        </label>`
                      : `<p class="muted" style="font-size:0.875rem;margin:0"><span style="color:var(--ink)">Schedule · </span>${protocol.name}</p>`
                  }
                  <p class="tiny" style="margin-top:0.5rem">
                    ${window.MENISCUS_DATA.frequencyLabel[protocol.frequency] || protocol.frequency}.
                  </p>
                  <div class="chips" style="overflow-x:auto;flex-wrap:nowrap">
                    ${protocol.steps
                      .map((step, i) => {
                        const on = Math.abs(step.doseMg * 1000 - state.doseMcg) < 0.5;
                        const label = step.label || formatEnteredDose(step.doseMg * 1000, entry);
                        return `<button type="button" class="chip ${on ? "on" : ""}" data-step="${i}">${label}</button>`;
                      })
                      .join("")}
                  </div>
                  <button type="button" class="btn-link" data-action="goto-plan" style="margin-top:0.25rem">Open the full plan</button>
                </div>`
              : ""
          }

          <div class="field">
            <label for="dose">Dose</label>
            <div class="field-input">
              <input id="dose" inputmode="decimal" autocomplete="off" value="${
                doseDisplay > 0 ? trimNumber(doseDisplay) : ""
              }" />
              <span class="suffix">${entry}</span>
            </div>
            <p class="tiny">${entry === "mg" ? "Entered in milligrams." : "Entered in micrograms. 1 mg = 1,000 mcg."}</p>
          </div>

          <div style="display:grid;gap:1rem;margin-top:0.25rem">
            <div class="field" style="margin-top:0">
              <label for="vial">Vial size</label>
              <div class="field-input">
                <input id="vial" inputmode="decimal" autocomplete="off" value="${trimNumber(state.vialMg)}" />
                <span class="suffix">mg</span>
              </div>
              <div class="chips">
                ${peptide.vialPresets
                  .map(
                    (p) =>
                      `<button type="button" class="chip ${
                        Math.abs(p - state.vialMg) < 1e-9 ? "on" : ""
                      }" data-vial="${p}">${trimNumber(p)}</button>`
                  )
                  .join("")}
              </div>
            </div>
            <div class="field" style="margin-top:0">
              <label for="water">Diluent</label>
              <div class="field-input">
                <input id="water" inputmode="decimal" autocomplete="off" value="${trimNumber(state.waterMl)}" />
                <span class="suffix">mL</span>
              </div>
              <div class="chips">
                ${peptide.waterPresets
                  .map(
                    (p) =>
                      `<button type="button" class="chip ${
                        Math.abs(p - state.waterMl) < 1e-9 ? "on" : ""
                      }" data-water="${p}">${trimNumber(p)}</button>`
                  )
                  .join("")}
              </div>
            </div>
          </div>

          <div class="field">
            <label>Syringe</label>
            <div class="segmented" role="group" aria-label="Syringe size">
              ${[0.3, 0.5, 1]
                .map(
                  (ml) =>
                    `<button type="button" class="${state.syringeMl === ml ? "on" : ""}" data-syringe="${ml}">${ml} mL</button>`
                )
                .join("")}
            </div>
          </div>

          <button type="button" class="btn" id="fit-ten" style="margin-top:1rem" ${
            !canFit || alreadyTen ? "disabled" : ""
          }>
            ${
              !canFit
                ? "Can't fit this dose on a 10-unit mark"
                : alreadyTen
                ? "This dose already lands on 10 units"
                : `Set diluent so this dose is 10 units (${trimNumber(Math.round(targetWater * 1000) / 1000)} mL)`
            }
          </button>
        </section>
      </div>
    `;
  }

  function renderPlan() {
    const peptide = getPeptide(state.peptideId);
    if (!peptide) return "<p>Peptide not found.</p>";
    const protocol = getProtocol(peptide, state.protocolId);

    if (!protocol) {
      return `
        <div class="card">
          <h2 style="font-size:1.75rem">${peptide.name}</h2>
          <p class="muted" style="margin-top:0.75rem">
            There is no published human titration to put on a calendar. The notes on the index card are the record.
            You can still run draw math from a dose you type on the bench.
          </p>
          <button type="button" class="btn-link" data-action="goto-index">Back to the index</button>
        </div>
      `;
    }

    return `
      <div>
        <p class="draw-label">Published plan</p>
        <h2 style="font-size:1.75rem;margin-top:0.25rem">${peptide.name}</h2>
        ${
          peptide.protocols.length > 1
            ? `<label class="field">Schedule
                <div class="field-input">
                  <select id="protocol-select">
                    ${peptide.protocols
                      .map(
                        (p) =>
                          `<option value="${p.id}" ${p.id === protocol.id ? "selected" : ""}>${p.name}</option>`
                      )
                      .join("")}
                  </select>
                </div>
              </label>`
            : `<p style="margin:0.5rem 0 0;font-weight:500;font-size:0.875rem">${protocol.name}</p>`
        }
        <p class="muted" style="margin-top:0.75rem;font-size:0.875rem">${protocol.summary}</p>
        ${protocol.finding ? `<p style="margin-top:0.5rem;font-size:0.875rem">${protocol.finding}</p>` : ""}
        ${protocol.caveat ? `<p class="muted" style="margin-top:0.5rem;font-size:0.875rem">${protocol.caveat}</p>` : ""}
        ${
          protocol.mode === "levels"
            ? `<p class="muted" style="margin-top:0.75rem;font-size:0.875rem">These are studied or labeled dose levels, not a week-by-week climb. Tap one to load it on the bench.</p>`
            : ""
        }
        <ol style="list-style:none;padding:0;margin:1rem 0 0">
          ${protocol.steps
            .map((step, i) => {
              const recon = computeRecon(state.vialMg, state.waterMl, step.doseMg * 1000, state.syringeMl);
              return `
                <li class="card plan-step">
                  <div class="row-between" style="align-items:flex-start">
                    <div>
                      <p class="tiny">${
                        protocol.mode === "timeline" ? stepWeekLabel(protocol.steps, i) : "Studied level"
                      }</p>
                      <p class="dose">${formatEnteredDose(step.doseMg * 1000, peptide.doseEntry)}</p>
                      ${step.note ? `<p class="muted" style="margin-top:0.5rem;font-size:0.875rem">${step.note}</p>` : ""}
                    </div>
                    <div style="text-align:right">
                      <p class="units">${recon.units == null ? "—" : formatUnits(recon.units)}</p>
                      <p class="tiny">units</p>
                      <p class="tiny" style="font-variant-numeric:tabular-nums">${
                        recon.drawMl == null ? "" : formatMl(recon.drawMl) + " mL"
                      }</p>
                    </div>
                  </div>
                  <button type="button" class="btn btn-primary" style="margin-top:0.75rem" data-step="${i}">Use on the bench</button>
                </li>
              `;
            })
            .join("")}
        </ol>
        <p class="tiny" style="margin-top:1rem">Source: ${protocol.source}</p>
        <p class="tiny">Using current bench recon: ${trimNumber(state.vialMg)} mg in ${trimNumber(state.waterMl)} mL.</p>
      </div>
    `;
  }

  function renderIndex() {
    const q = state.libraryQuery.trim().toLowerCase();
    const filter = state.libraryFilter;
    const list = peptides().filter((p) => {
      if (filter !== "all" && p.evidence !== filter) return false;
      if (!q) return true;
      const blob = `${p.name} ${p.aka} ${p.klass} ${p.summary}`.toLowerCase();
      return blob.includes(q);
    });

    const filters = [
      { id: "all", label: "All" },
      { id: "label", label: "Labels" },
      { id: "trial", label: "Trials" },
      { id: "none", label: "No schedule" },
    ];

    return `
      <div>
        <p class="draw-label">Index</p>
        <h2 style="font-size:1.75rem;margin-top:0.25rem">What the record actually says</h2>
        <p class="muted" style="margin-top:0.5rem;font-size:0.875rem">
          Label schedules are copied from prescribing information. Trial arms are copied from papers.
          If a human schedule is not established, it is not invented.
        </p>
        <div class="search">
          <span class="search-icon" aria-hidden="true">⌕</span>
          <input id="lib-search" type="search" placeholder="Search compounds" aria-label="Search compounds" value="${state.libraryQuery.replace(
            /"/g,
            "&quot;"
          )}" />
        </div>
        <div class="filters">
          ${filters
            .map(
              (f) =>
                `<button type="button" class="chip ${
                  filter === f.id ? "on" : ""
                }" data-filter="${f.id}">${f.label}</button>`
            )
            .join("")}
        </div>
        <div>
          ${list
            .map((p) => {
              const open = state.libraryOpen === p.id;
              return `
                <article>
                  <button type="button" class="library-item" data-open="${p.id}" aria-expanded="${open}">
                    <div class="row-between" style="align-items:flex-start">
                      <div>
                        <h3 style="font-size:1.35rem">${p.name}</h3>
                        <p class="tiny" style="margin:0.15rem 0 0">${p.aka}</p>
                      </div>
                      <span class="badge">${window.MENISCUS_DATA.evidenceLabel[p.evidence]}</span>
                    </div>
                    <p class="muted" style="margin:0.5rem 0 0;font-size:0.875rem">${p.klass}</p>
                  </button>
                  ${
                    open
                      ? `<div class="library-body card" style="margin-top:0;border-top-left-radius:0;border-top-right-radius:0;border-top:0">
                          <p>${p.summary}</p>
                          ${
                            p.halfLife
                              ? `<p class="muted" style="margin-top:0.5rem">Reported half-life: ${p.halfLife}. Half-life is not a dosing instruction.</p>`
                              : ""
                          }
                          <ul>${p.notes.map((n) => `<li>${n}</li>`).join("")}</ul>
                          ${p.protocols
                            .map(
                              (protocol) => `
                            <div style="margin-top:1rem">
                              <p style="font-weight:600;margin:0">${protocol.name}</p>
                              <p class="muted" style="margin:0.25rem 0 0">${protocol.summary}</p>
                              ${protocol.finding ? `<p style="margin:0.5rem 0 0">${protocol.finding}</p>` : ""}
                              <ol style="margin:0.5rem 0 0;padding-left:1.1rem;font-variant-numeric:tabular-nums">
                                ${protocol.steps
                                  .map((step) => {
                                    const label = step.label
                                      ? `${step.label}: `
                                      : "";
                                    const dose = formatEnteredDose(step.doseMg * 1000, p.doseEntry);
                                    const weeks =
                                      protocol.mode === "timeline"
                                        ? step.weeks == null
                                          ? " · ongoing"
                                          : ` · ${step.weeks} wk`
                                        : "";
                                    return `<li>${label}${dose}${weeks}</li>`;
                                  })
                                  .join("")}
                              </ol>
                              <p class="tiny" style="margin-top:0.5rem">${protocol.source}</p>
                            </div>`
                            )
                            .join("")}
                          <button type="button" class="btn btn-primary" style="margin-top:1rem" data-use="${p.id}">Use on the bench</button>
                        </div>`
                      : ""
                  }
                </article>
              `;
            })
            .join("")}
          ${list.length === 0 ? `<p class="muted" style="margin-top:1rem">Nothing matches.</p>` : ""}
        </div>
      </div>
    `;
  }

  function bindShell(root) {
    root.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tab = btn.getAttribute("data-tab");
        render();
      });
    });

    root.querySelectorAll("[data-action='goto-index']").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tab = "index";
        render();
      });
    });
    root.querySelectorAll("[data-action='goto-plan']").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tab = "plan";
        render();
      });
    });

    const protocolSelect = root.querySelector("#protocol-select");
    if (protocolSelect) {
      protocolSelect.addEventListener("change", () => {
        state.protocolId = protocolSelect.value;
        const p = getPeptide(state.peptideId);
        const protocol = getProtocol(p, state.protocolId);
        if (protocol && protocol.steps[0]) {
          state.doseMcg = protocol.steps[0].doseMg * 1000;
        }
        save();
        render();
      });
    }

    root.querySelectorAll("[data-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyStep(Number(btn.getAttribute("data-step")));
        state.tab = "bench";
        save();
        render();
      });
    });

    root.querySelectorAll("[data-vial]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.vialMg = Number(btn.getAttribute("data-vial"));
        save();
        render();
      });
    });
    root.querySelectorAll("[data-water]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.waterMl = Number(btn.getAttribute("data-water"));
        save();
        render();
      });
    });
    root.querySelectorAll("[data-syringe]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.syringeMl = Number(btn.getAttribute("data-syringe"));
        save();
        render();
      });
    });

    const dose = root.querySelector("#dose");
    if (dose) {
      dose.addEventListener("input", () => {
        const peptide = getPeptide(state.peptideId);
        const n = Number(dose.value);
        if (dose.value.trim() === "") {
          state.doseMcg = 0;
        } else if (Number.isFinite(n)) {
          state.doseMcg = peptide.doseEntry === "mg" ? n * 1000 : n;
        }
        save();
        // soft re-render of result only would be better; full render is fine for static size
        render();
        const again = document.querySelector("#dose");
        if (again) {
          again.focus();
          const len = again.value.length;
          again.setSelectionRange(len, len);
        }
      });
    }

    const vial = root.querySelector("#vial");
    if (vial) {
      vial.addEventListener("input", () => {
        const n = Number(vial.value);
        state.vialMg = vial.value.trim() === "" || !Number.isFinite(n) ? 0 : n;
        save();
        render();
        const again = document.querySelector("#vial");
        if (again) {
          again.focus();
          const len = again.value.length;
          again.setSelectionRange(len, len);
        }
      });
    }

    const water = root.querySelector("#water");
    if (water) {
      water.addEventListener("input", () => {
        const n = Number(water.value);
        state.waterMl = water.value.trim() === "" || !Number.isFinite(n) ? 0 : n;
        save();
        render();
        const again = document.querySelector("#water");
        if (again) {
          again.focus();
          const len = again.value.length;
          again.setSelectionRange(len, len);
        }
      });
    }

    const fit = root.querySelector("#fit-ten");
    if (fit) {
      fit.addEventListener("click", () => {
        const w = waterMlForTargetUnits(state.vialMg, state.doseMcg, 10);
        if (w && w > 0 && w < 30) {
          state.waterMl = Math.round(w * 1000) / 1000;
          save();
          render();
        }
      });
    }

    root.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.libraryFilter = btn.getAttribute("data-filter");
        render();
      });
    });

    const search = root.querySelector("#lib-search");
    if (search) {
      search.addEventListener("input", () => {
        state.libraryQuery = search.value;
        render();
        const again = document.querySelector("#lib-search");
        if (again) {
          again.focus();
          const len = again.value.length;
          again.setSelectionRange(len, len);
        }
      });
    }

    root.querySelectorAll("[data-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-open");
        state.libraryOpen = state.libraryOpen === id ? null : id;
        render();
      });
    });

    root.querySelectorAll("[data-use]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectPeptide(btn.getAttribute("data-use"));
      });
    });
  }

  function render() {
    if (!state.acknowledged) {
      renderGate();
      return;
    }
    const root = document.getElementById("app");
    let body = "";
    if (state.tab === "bench") body = renderBench();
    else if (state.tab === "plan") body = renderPlan();
    else body = renderIndex();

    root.innerHTML = `
      <div class="app-shell">
        <header class="header">
          <div>
            <h1>Meniscus</h1>
            <p class="tag">Research reconstitution bench</p>
          </div>
          <p class="disclaimer">Research reference only. Not medical advice.</p>
        </header>
        <main>${body}</main>
      </div>
      ${navHtml(state.tab)}
    `;
    bindShell(root);
  }

  load();
  // Validate peptide still exists
  if (!getPeptide(state.peptideId)) {
    state.peptideId = "semaglutide";
    state.protocolId = "wegovy";
  }
  render();
})();
