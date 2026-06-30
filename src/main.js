import { Plugin, ItemView, Modal, Notice, PluginSettingTab, Setting, normalizePath } from "obsidian";
import VexFlow from "vexflow/bravura";

const VIEW_TYPE = "spartito-view";

const NOTE_LETTERS = ["c", "d", "e", "f", "g", "a", "b"];
const NOTE_LABELS = { c: "C", d: "D", e: "E", f: "F", g: "G", a: "A", b: "B" };

const DURATIONS = [
  ["w", "Whole"],
  ["h", "Half"],
  ["q", "Quarter"],
  ["8", "Eighth"],
  ["16", "Sixteenth"],
  ["32", "Thirty-second"],
];

const DUR_BEATS = { w: 4, h: 2, q: 1, "8": 0.5, "16": 0.25, "32": 0.125 };

const TIME_SIGNATURES = ["4/4", "3/4", "2/4", "2/2", "6/8", "3/8", "9/8", "12/8", "6/4"];
const KEY_SIGNATURES = ["C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"];

const DEFAULT_SETTINGS = {
  defaultTime: "4/4",
  defaultKey: "C",
  defaultTempo: "",
  saveFolder: "",
};

const VF = VexFlow;

let fontsReady;
function ensureFontsReady() {
  if (!fontsReady) fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  return fontsReady;
}

function parseToken(raw) {
  let tok = raw.trim().toLowerCase();
  if (!tok || tok === "|") return null;
  let dur = "q";
  let dotted = false;
  const ci = tok.indexOf(":");
  if (ci >= 0) {
    dur = tok.slice(ci + 1);
    tok = tok.slice(0, ci);
  }
  if (dur.endsWith(".")) {
    dotted = true;
    dur = dur.slice(0, -1);
  }
  if (!(dur in DUR_BEATS)) dur = "q";
  const beats = DUR_BEATS[dur] * (dotted ? 1.5 : 1);
  if (tok === "r" || tok === "rest") return { isRest: true, dur, dotted, beats, keys: [] };
  const parts = tok.split("+");
  const keys = [];
  for (const p of parts) {
    const mm = p.match(/^([a-g])(#{1,2}|b{1,2}|n)?([0-9])$/);
    if (!mm) return null;
    keys.push(mm[1] + (mm[2] || "") + "/" + mm[3]);
  }
  return { isRest: false, dur, dotted, beats, keys };
}

function tokenize(s) {
  return (s || "").replace(/\|/g, " ").split(/\s+/).filter(Boolean);
}

function invalidTokens(s) {
  return tokenize(s).filter((t) => parseToken(t) === null);
}

const NOTE_VALUES = [
  { dur: "w", dotted: true, beats: 6 },
  { dur: "w", dotted: false, beats: 4 },
  { dur: "h", dotted: true, beats: 3 },
  { dur: "h", dotted: false, beats: 2 },
  { dur: "q", dotted: true, beats: 1.5 },
  { dur: "q", dotted: false, beats: 1 },
  { dur: "8", dotted: true, beats: 0.75 },
  { dur: "8", dotted: false, beats: 0.5 },
  { dur: "16", dotted: true, beats: 0.375 },
  { dur: "16", dotted: false, beats: 0.25 },
  { dur: "32", dotted: true, beats: 0.1875 },
  { dur: "32", dotted: false, beats: 0.125 },
];

function decompose(beats) {
  const out = [];
  let rem = beats;
  for (const v of NOTE_VALUES) {
    while (rem >= v.beats - 1e-6) {
      out.push({ dur: v.dur, dotted: v.dotted, beats: v.beats });
      rem -= v.beats;
    }
    if (rem < 1e-6) break;
  }
  return out;
}

function splitMeasures(specs, cap) {
  const out = [];
  let cur = [];
  let acc = 0;
  const emit = (frag) => {
    cur.push(frag);
    acc += frag.beats;
    if (acc >= cap - 1e-6) {
      out.push(cur);
      cur = [];
      acc = 0;
    }
  };
  for (const sp of specs) {
    const frags = [];
    let rem = sp.beats;
    let space = cap - acc;
    while (rem > 1e-6) {
      const take = Math.min(space, rem);
      for (const f of decompose(take)) frags.push(f);
      rem -= take;
      space = cap;
    }
    for (let i = 0; i < frags.length; i++) {
      const f = frags[i];
      emit({
        isRest: sp.isRest,
        keys: sp.keys,
        dur: f.dur,
        dotted: f.dotted,
        beats: f.beats,
        tieToNext: !sp.isRest && i < frags.length - 1,
      });
    }
  }
  if (acc > 1e-6 && acc < cap - 1e-6) {
    for (const f of decompose(cap - acc)) {
      cur.push({ isRest: true, keys: [], dur: f.dur, dotted: f.dotted, beats: f.beats, tieToNext: false });
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

function buildHand(VF, measures, clef, cap, count) {
  const notesByMeasure = [];
  const ties = [];
  let pending = null;
  for (let m = 0; m < count; m++) {
    let measure = measures[m];
    if (!measure || !measure.length) {
      measure = [{ isRest: true, keys: [], dur: "w", dotted: false, beats: cap, tieToNext: false }];
    }
    const notes = [];
    for (const sp of measure) {
      let note;
      if (sp.isRest) {
        const k = clef === "bass" ? "d/3" : "b/4";
        note = new VF.StaveNote({ keys: [k], duration: sp.dur + "r", clef });
      } else {
        note = new VF.StaveNote({ keys: sp.keys, duration: sp.dur, clef });
      }
      if (sp.dotted) VF.Dot.buildAndAttach([note], { all: true });
      if (pending) {
        ties.push({ first: pending.note, last: note, indices: pending.indices });
        pending = null;
      }
      if (sp.tieToNext) pending = { note, indices: sp.keys.map((_, i) => i) };
      notes.push(note);
    }
    notesByMeasure.push(notes);
  }
  return { notesByMeasure, ties };
}

function renderScore(VF, container, data, width) {
  container.empty();
  const time = data.time || "4/4";
  const key = data.key || "C";
  const parts = time.split("/").map(Number);
  const num = parts[0] || 4;
  const den = parts[1] || 4;
  const cap = (num * 4) / den;

  const trebleSpecs = tokenize(data.treble).map(parseToken).filter(Boolean);
  const bassSpecs = tokenize(data.bass).map(parseToken).filter(Boolean);
  if (trebleSpecs.length === 0 && bassSpecs.length === 0) {
    container.setText("No valid notes.");
    return;
  }
  const trebleMeasures = splitMeasures(trebleSpecs, cap);
  const bassMeasures = splitMeasures(bassSpecs, cap);
  const measureCount = Math.max(trebleMeasures.length, bassMeasures.length, 1);
  const trebleHand = buildHand(VF, trebleMeasures, "treble", cap, measureCount);
  const bassHand = buildHand(VF, bassMeasures, "bass", cap, measureCount);

  const W = Math.max(360, Math.min(1100, width || 700));
  const perRow = Math.max(1, Math.min(4, Math.floor((W - 20) / 240)));
  const rows = Math.ceil(measureCount / perRow);
  const startY = data.title ? 46 : 12;
  const rowH = 190;

  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(W, startY + rows * rowH + 20);
  const ctx = renderer.getContext();

  if (data.title) {
    ctx.save();
    ctx.setFont("Arial", 16, "bold");
    ctx.fillText(String(data.title), 12, 24);
    ctx.restore();
  }
  if (data.tempo) {
    ctx.save();
    ctx.setFont("Arial", 11, "");
    ctx.fillText("♩ = " + data.tempo, 12, data.title ? 40 : 24);
    ctx.restore();
  }

  const measureW = (W - 20) / perRow;
  for (let i = 0; i < measureCount; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const rowStart = col === 0;
    const first = i === 0;
    const last = i === measureCount - 1;
    const x = 10 + col * measureW;
    const trebleY = startY + row * rowH;
    const bassY = trebleY + 90;

    const trebleStave = new VF.Stave(x, trebleY, measureW);
    const bassStave = new VF.Stave(x, bassY, measureW);
    let modifierW = 12;
    if (rowStart) {
      trebleStave.addClef("treble").addKeySignature(key);
      bassStave.addClef("bass").addKeySignature(key);
      modifierW += 60;
    }
    if (first) {
      trebleStave.addTimeSignature(time);
      bassStave.addTimeSignature(time);
      modifierW += 28;
    }
    if (last) {
      trebleStave.setEndBarType(VF.Barline.type.END);
      bassStave.setEndBarType(VF.Barline.type.END);
    }
    trebleStave.setContext(ctx).draw();
    bassStave.setContext(ctx).draw();

    const trebleNotes = trebleHand.notesByMeasure[i];
    const bassNotes = bassHand.notesByMeasure[i];
    const trebleVoice = new VF.Voice({ numBeats: num, beatValue: den }).setStrict(false).addTickables(trebleNotes);
    const bassVoice = new VF.Voice({ numBeats: num, beatValue: den }).setStrict(false).addTickables(bassNotes);
    VF.Accidental.applyAccidentals([trebleVoice], key);
    VF.Accidental.applyAccidentals([bassVoice], key);
    const formatW = Math.max(60, measureW - modifierW);
    new VF.Formatter().format([trebleVoice, bassVoice], formatW);
    const trebleBeams = VF.Beam.generateBeams(trebleNotes);
    const bassBeams = VF.Beam.generateBeams(bassNotes);
    trebleVoice.setStave(trebleStave).setContext(ctx).draw();
    bassVoice.setStave(bassStave).setContext(ctx).draw();
    trebleBeams.forEach((b) => b.setContext(ctx).draw());
    bassBeams.forEach((b) => b.setContext(ctx).draw());

    if (rowStart) {
      new VF.StaveConnector(trebleStave, bassStave).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
      new VF.StaveConnector(trebleStave, bassStave).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
    }
  }

  const drawTie = (t) => {
    try {
      new VF.StaveTie({ firstNote: t.first, lastNote: t.last, firstIndexes: t.indices, lastIndexes: t.indices })
        .setContext(ctx)
        .draw();
    } catch (e) {}
  };
  trebleHand.ties.forEach(drawTie);
  bassHand.ties.forEach(drawTie);
}

function parseSource(source) {
  const data = { title: "", tempo: "", time: "4/4", key: "C", treble: "", bass: "" };
  for (const line of source.split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    const v = line.slice(idx + 1).trim();
    if (k in data) data[k] = v;
  }
  return data;
}

function serializeBlock(data) {
  const lines = [];
  if (data.title) lines.push("title: " + data.title);
  if (data.tempo) lines.push("tempo: " + data.tempo);
  lines.push("time: " + (data.time || "4/4"));
  lines.push("key: " + (data.key || "C"));
  lines.push("treble: " + (data.treble || ""));
  lines.push("bass: " + (data.bass || ""));
  return "```spartito\n" + lines.join("\n") + "\n```";
}

function serializeSource(data) {
  return serializeBlock(data) + "\n";
}

function replaceScoreBlock(content, data) {
  const block = serializeBlock(data);
  if (/```spartito[\s\S]*?```/.test(content)) {
    return content.replace(/```spartito[\s\S]*?```/, block);
  }
  return content.trimEnd() + "\n\n" + block + "\n";
}

class NameModal extends Modal {
  constructor(app, defaultName, onSubmit) {
    super(app);
    this.defaultName = defaultName;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Save score as note" });
    const input = contentEl.createEl("input", { type: "text", cls: "spartito-name-input" });
    input.value = this.defaultName;
    input.focus();
    input.select();
    const row = contentEl.createDiv({ cls: "spartito-name-row" });
    const ok = row.createEl("button", { text: "Save", cls: "mod-cta" });
    const cancel = row.createEl("button", { text: "Cancel" });
    const submit = () => {
      const name = input.value.trim();
      if (!name) {
        new Notice("Enter a name.");
        return;
      }
      this.close();
      this.onSubmit(name);
    };
    ok.onclick = submit;
    cancel.onclick = () => this.close();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
}

class SpartitoView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.activeHand = "treble";
    this.currentPath = null;
    this.isReady = false;
    this.resizeObserver = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Score";
  }
  getIcon() {
    return "music";
  }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass("spartito-view");

    const meta = root.createDiv({ cls: "spartito-meta" });
    this.titleEl = meta.createEl("input", { type: "text", cls: "spartito-title" });
    this.titleEl.placeholder = "Title";
    this.tempoEl = meta.createEl("input", { type: "number", cls: "spartito-tempo" });
    this.tempoEl.placeholder = "BPM";

    const toolbar = root.createDiv({ cls: "spartito-toolbar" });

    const timeWrap = toolbar.createDiv({ cls: "spartito-select" });
    timeWrap.createSpan({ text: "Time" });
    this.timeEl = timeWrap.createEl("select");
    for (const t of TIME_SIGNATURES) this.timeEl.createEl("option", { text: t, value: t });

    const keyWrap = toolbar.createDiv({ cls: "spartito-select" });
    keyWrap.createSpan({ text: "Key" });
    this.keyEl = keyWrap.createEl("select");
    for (const k of KEY_SIGNATURES) this.keyEl.createEl("option", { text: k, value: k });

    const handWrap = toolbar.createDiv({ cls: "spartito-select" });
    handWrap.createSpan({ text: "Hand" });
    this.handEl = handWrap.createEl("select");
    this.handEl.createEl("option", { text: "Right (treble)", value: "treble" });
    this.handEl.createEl("option", { text: "Left (bass)", value: "bass" });
    this.handEl.onchange = () => {
      this.activeHand = this.handEl.value;
      this.octaveEl.value = this.activeHand === "bass" ? "3" : "4";
    };

    const octWrap = toolbar.createDiv({ cls: "spartito-select" });
    octWrap.createSpan({ text: "Octave" });
    this.octaveEl = octWrap.createEl("select");
    for (let o = 1; o <= 7; o++) this.octaveEl.createEl("option", { text: String(o), value: String(o) });
    this.octaveEl.value = "4";

    const accWrap = toolbar.createDiv({ cls: "spartito-select" });
    accWrap.createSpan({ text: "Accidental" });
    this.accEl = accWrap.createEl("select");
    this.accEl.createEl("option", { text: "Natural", value: "" });
    this.accEl.createEl("option", { text: "Sharp #", value: "#" });
    this.accEl.createEl("option", { text: "Flat b", value: "b" });

    const durWrap = toolbar.createDiv({ cls: "spartito-select" });
    durWrap.createSpan({ text: "Duration" });
    this.durEl = durWrap.createEl("select");
    for (const [val, label] of DURATIONS) this.durEl.createEl("option", { text: label, value: val });
    this.durEl.value = "q";
    this.dotEl = durWrap.createEl("label", { cls: "spartito-dot" });
    this.dotCheck = this.dotEl.createEl("input", { type: "checkbox" });
    this.dotEl.createSpan({ text: " Dotted" });

    const keys = root.createDiv({ cls: "spartito-keys" });
    for (const letter of NOTE_LETTERS) {
      const btn = keys.createEl("button", { text: NOTE_LABELS[letter] });
      btn.onclick = () => this.appendNote(letter);
    }
    const restBtn = keys.createEl("button", { text: "Rest", cls: "spartito-rest" });
    restBtn.onclick = () => this.appendNote("r");

    const hands = root.createDiv({ cls: "spartito-hands" });
    const rh = hands.createDiv({ cls: "spartito-hand" });
    rh.createEl("label", { text: "Right hand (treble clef)" });
    this.trebleEl = rh.createEl("textarea", { cls: "spartito-input" });
    this.trebleEl.placeholder = "e.g. c4 d4 e4 f4 | g4 a4 b4 c5";
    this.trebleEl.value = "c4 d4 e4 f4 g4 a4 b4 c5";
    const lh = hands.createDiv({ cls: "spartito-hand" });
    lh.createEl("label", { text: "Left hand (bass clef)" });
    this.bassEl = lh.createEl("textarea", { cls: "spartito-input" });
    this.bassEl.placeholder = "e.g. c3 e3 g3 e3 | c3 e3 g3 e3";
    this.bassEl.value = "c3 e3 g3 c3 e3 g3 e3 c3";

    this.trebleEl.addEventListener("input", () => this.render());
    this.bassEl.addEventListener("input", () => this.render());

    const actions = root.createDiv({ cls: "spartito-actions" });
    const renderBtn = actions.createEl("button", { text: "Update score", cls: "mod-cta" });
    renderBtn.onclick = () => this.render();
    const undoBtn = actions.createEl("button", { text: "Undo last" });
    undoBtn.onclick = () => this.undo();
    const clearBtn = actions.createEl("button", { text: "Clear hand" });
    clearBtn.onclick = () => {
      this.targetEl().value = "";
      this.render();
    };
    this.saveBtn = actions.createEl("button", { text: "Save as note" });
    this.saveBtn.onclick = () => this.save();
    const newBtn = actions.createEl("button", { text: "New" });
    newBtn.onclick = () => this.resetEditor();

    this.scoreEl = root.createDiv({ cls: "spartito-score" });
    this.statusEl = root.createDiv({ cls: "spartito-status" });

    root.createDiv({
      cls: "spartito-hint",
      text:
        "Choose Hand, Octave, Accidental and Duration, then click the notes (or type them). " +
        "Format: c4, c#4, db4, chord c4+e4+g4, duration after a colon c4:h, dotted c4:q. " +
        "r = rest. Bar lines (|) are optional: measures are split automatically from the time signature.",
    });

    this.resizeObserver = new ResizeObserver(() => {
      if (this.isReady) this.render();
    });
    this.resizeObserver.observe(this.scoreEl);

    this.timeEl.value = this.plugin.settings.defaultTime || "4/4";
    this.keyEl.value = this.plugin.settings.defaultKey || "C";
    if (this.plugin.settings.defaultTempo) this.tempoEl.value = this.plugin.settings.defaultTempo;

    try {
      await ensureFontsReady();
      this.isReady = true;
      const pending = this.plugin.consumePending();
      if (pending) this.applyData(pending.data, pending.path);
      else this.render();
    } catch (e) {
      this.scoreEl.setText("Could not render score: " + e.message);
    }
  }

  applyData(data, path) {
    this.currentPath = path || null;
    this.titleEl.value = data.title || "";
    this.tempoEl.value = data.tempo || "";
    this.timeEl.value = data.time || "4/4";
    this.keyEl.value = data.key || "C";
    this.trebleEl.value = data.treble || "";
    this.bassEl.value = data.bass || "";
    this.updateSaveLabel();
    this.render();
  }

  resetEditor() {
    this.currentPath = null;
    this.titleEl.value = "";
    this.tempoEl.value = this.plugin.settings.defaultTempo || "";
    this.timeEl.value = this.plugin.settings.defaultTime || "4/4";
    this.keyEl.value = this.plugin.settings.defaultKey || "C";
    this.trebleEl.value = "";
    this.bassEl.value = "";
    this.updateSaveLabel();
    this.render();
  }

  updateSaveLabel() {
    if (this.saveBtn) this.saveBtn.setText(this.currentPath ? "Save (update note)" : "Save as note");
  }

  targetEl() {
    return this.activeHand === "bass" ? this.bassEl : this.trebleEl;
  }

  appendNote(letter) {
    const dur = this.durEl.value;
    const dot = this.dotCheck.checked ? "." : "";
    let token;
    if (letter === "r") {
      token = "r";
      if (dur !== "q" || dot) token += ":" + dur + dot;
    } else {
      const acc = this.accEl.value;
      const oct = this.octaveEl.value;
      token = letter + acc + oct;
      if (dur !== "q" || dot) token += ":" + dur + dot;
    }
    const el = this.targetEl();
    const cur = el.value.trim();
    el.value = cur ? cur + " " + token : token;
    this.render();
  }

  undo() {
    const el = this.targetEl();
    const parts = el.value.trim().split(/\s+/).filter(Boolean);
    parts.pop();
    el.value = parts.join(" ");
    this.render();
  }

  collect() {
    return {
      title: this.titleEl.value.trim(),
      tempo: this.tempoEl.value.trim(),
      time: this.timeEl.value,
      key: this.keyEl.value,
      treble: this.trebleEl.value.trim(),
      bass: this.bassEl.value.trim(),
    };
  }

  reportInvalid(data) {
    if (!this.statusEl) return;
    const bad = invalidTokens(data.treble).concat(invalidTokens(data.bass));
    if (bad.length) {
      this.statusEl.setText("Ignored invalid tokens: " + bad.join(", "));
      this.statusEl.addClass("is-visible");
    } else {
      this.statusEl.setText("");
      this.statusEl.removeClass("is-visible");
    }
  }

  render() {
    try {
      const data = this.collect();
      const width = this.scoreEl.clientWidth || 700;
      renderScore(VF, this.scoreEl, data, width);
      this.reportInvalid(data);
    } catch (e) {
      this.scoreEl.setText("Render error: " + e.message);
    }
  }

  async save() {
    const data = this.collect();
    if (!data.treble && !data.bass) {
      new Notice("Add at least one note before saving.");
      return;
    }
    if (this.currentPath) {
      const cur = this.app.vault.getAbstractFileByPath(this.currentPath);
      if (cur) {
        const old = await this.app.vault.read(cur);
        await this.app.vault.modify(cur, replaceScoreBlock(old, data));
        new Notice("Updated: " + cur.path);
        return;
      }
      this.currentPath = null;
      this.updateSaveLabel();
    }
    const def = data.title || "Score";
    new NameModal(this.app, def, async (name) => {
      const safe = name.replace(/[\\/:*?"<>|]/g, "-");
      const folder = (this.plugin.settings.saveFolder || "").trim();
      if (folder) await this.plugin.ensureFolder(folder);
      const base = folder ? folder + "/" + safe : safe;
      let path = normalizePath(base + ".md");
      let n = 2;
      while (this.app.vault.getAbstractFileByPath(path)) {
        path = normalizePath(base + " " + n + ".md");
        n++;
      }
      const content = "# " + (data.title || safe) + "\n\n" + serializeSource(data);
      const file = await this.app.vault.create(path, content);
      this.currentPath = file.path;
      this.updateSaveLabel();
      new Notice("Saved: " + file.path);
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.openFile(file);
    }).open();
  }

  async onClose() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }
}

class SpartitoSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default time signature")
      .setDesc("Time signature used for a new score.")
      .addDropdown((d) => {
        for (const t of TIME_SIGNATURES) d.addOption(t, t);
        d.setValue(this.plugin.settings.defaultTime).onChange(async (v) => {
          this.plugin.settings.defaultTime = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Default key")
      .setDesc("Key signature used for a new score.")
      .addDropdown((d) => {
        for (const k of KEY_SIGNATURES) d.addOption(k, k);
        d.setValue(this.plugin.settings.defaultKey).onChange(async (v) => {
          this.plugin.settings.defaultKey = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Default tempo (BPM)")
      .setDesc("Optional tempo prefilled for a new score.")
      .addText((t) => {
        t.setPlaceholder("e.g. 120")
          .setValue(this.plugin.settings.defaultTempo)
          .onChange(async (v) => {
            this.plugin.settings.defaultTempo = v.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Save folder")
      .setDesc("Vault folder where saved scores are created. Leave empty for the vault root.")
      .addText((t) => {
        t.setPlaceholder("e.g. Scores")
          .setValue(this.plugin.settings.saveFolder)
          .onChange(async (v) => {
            this.plugin.settings.saveFolder = v.trim();
            await this.plugin.saveSettings();
          });
      });
  }
}

export default class SpartitoPlugin extends Plugin {
  async onload() {
    this.pending = null;
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new SpartitoView(leaf, this));
    this.addRibbonIcon("music", "Open score editor", () => this.activateView());
    this.addCommand({
      id: "open-spartito",
      name: "Open score editor",
      callback: () => this.activateView(),
    });
    this.addSettingTab(new SpartitoSettingTab(this.app, this));

    const processor = async (source, el, ctx) => {
      try {
        await ensureFontsReady();
        const holder = el.createDiv({ cls: "spartito-score" });
        const width = el.clientWidth || 680;
        const data = parseSource(source);
        renderScore(VF, holder, data, width);
        const bar = el.createDiv({ cls: "spartito-actions" });
        const editBtn = bar.createEl("button", { text: "Edit in editor" });
        editBtn.onclick = () => this.openInEditor(data, ctx.sourcePath);
      } catch (e) {
        el.setText("Score: error - " + e.message);
      }
    };
    this.registerMarkdownCodeBlockProcessor("spartito", processor);
    this.registerMarkdownCodeBlockProcessor("score", processor);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }

  async ensureFolder(folder) {
    const path = normalizePath(folder);
    if (!this.app.vault.getAbstractFileByPath(path)) {
      try {
        await this.app.vault.createFolder(path);
      } catch (e) {}
    }
  }

  consumePending() {
    const p = this.pending;
    this.pending = null;
    return p;
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
    return leaf.view;
  }

  async openInEditor(data, sourcePath) {
    this.pending = { data, path: sourcePath || null };
    const view = await this.activateView();
    if (view && view.isReady && this.pending) {
      this.pending = null;
      view.applyData(data, sourcePath || null);
    }
  }

  onunload() {}
};
