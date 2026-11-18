(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const announcement = document.querySelector("#announcement");
  const TAU = Math.PI * 2;
  const COLORS = {
    ink: "#080b16", text: "#ebf5ff", muted: "#8ca0b9",
    cyan: "#4bebff", blue: "#5a82ff", purple: "#b46eff",
    green: "#5bffbe", red: "#dc1e28", orange: "#ffbe3c",
  };
  const STORE = {
    high: "neon-survivor-high-score",
    settings: "neon-survivor-controls",
  };
  const state = {
    width: innerWidth, height: innerHeight, dpr: 1,
    screen: "home", time: 0, lastFrame: 0, lastSpawn: 0, lastRipple: 0,
    score: 0, health: 3, high: 0, spaceHeld: false,
    player: { x: 0, y: 0, size: 50, speed: 5, remX: 0, remY: 0 },
    enemies: [], rockets: [], enemyShots: [], grenades: [], nukes: [],
    shockwaves: [], explosions: [], blasts: [], ripples: [],
    crosshair: null, aim: { x: 0, y: -1 },
    joystick: { pointer: null, x: 0, y: 0 },
    skill: { pointer: null, name: null, start: null, direction: null },
    layoutDrag: null, ui: new Map(), keys: new Set(),
    settingsMessage: "", stars: [], controlSize: 1,
    layout: null, lastAnnouncement: "",
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const vec = (x, y) => ({ x, y });
  const length = (v) => Math.hypot(v.x, v.y);
  const normalize = (v) => {
    const magnitude = length(v);
    return magnitude ? { x: v.x / magnitude, y: v.y / magnitude } : { x: 0, y: 0 };
  };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rect = (x, y, w, h) => ({ x, y, w, h });
  const inside = (p, r) =>
    p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const playerCenter = () => ({
    x: state.player.x + state.player.size / 2,
    y: state.player.y + state.player.size / 2,
  });

  try {
    state.high = Number.parseInt(localStorage.getItem(STORE.high) || "0", 10) || 0;
  } catch {
    state.high = 0;
  }

  function defaultLayout() {
    const unit = clamp(Math.min(state.width, state.height) * 0.1, 34, 58);
    const sx = state.width - unit * 1.55;
    const sy = state.height - unit * 1.65;
    return {
      joystick: [unit * 1.65 / state.width, 1 - unit * 1.65 / state.height],
      attack: [sx / state.width, sy / state.height],
      grenade: [sx / state.width, (sy - unit * 1.65) / state.height],
      nuke: [sx / state.width, (sy - unit * 3.25) / state.height],
    };
  }

  state.layout = defaultLayout();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE.settings) || "{}");
    if (Number.isFinite(saved.controlSize) && saved.controlSize >= 0.65 && saved.controlSize <= 1.6) {
      state.controlSize = saved.controlSize;
    }
    if (saved.layout && typeof saved.layout === "object") {
      for (const name of Object.keys(state.layout)) {
        const p = saved.layout[name];
        if (Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) {
          state.layout[name] = [clamp(p[0], 0.03, 0.97), clamp(p[1], 0.05, 0.95)];
        }
      }
    }
  } catch {
    state.settingsMessage = "Saved settings could not be read";
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORE.settings, JSON.stringify({
        controlSize: state.controlSize,
        layout: state.layout,
      }));
      state.settingsMessage = "Settings saved";
    } catch {
      state.settingsMessage = "Settings apply for this session";
    }
  }

  function resize() {
    const oldW = state.width || innerWidth;
    const oldH = state.height || innerHeight;
    state.width = Math.max(1, innerWidth);
    state.height = Math.max(1, innerHeight);
    state.dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (state.player.x || state.player.y) {
      const center = playerCenter();
      state.player.x = center.x / oldW * state.width - state.player.size / 2;
      state.player.y = center.y / oldH * state.height - state.player.size / 2;
    } else {
      state.player.x = (state.width - state.player.size) / 2;
      state.player.y = (state.height - state.player.size) / 2;
    }
    state.stars = Array.from({ length: 72 }, () => ({
      x: Math.random() * state.width,
      y: Math.random() * state.height,
      r: Math.random() < 0.76 ? 1 : 2,
    }));
    if (state.layout && oldW > 0 && oldH > 0) {
      for (const [name, point] of Object.entries(state.layout)) {
        state.layout[name] = [
          clamp(point[0] * oldW / state.width, 0.03, 0.97),
          clamp(point[1] * oldH / state.height, 0.05, 0.95),
        ];
      }
    }
    state.orbitRadius = Math.min(state.width, state.height) * 0.4;
  }

  function controlMetrics() {
    const unit = clamp(Math.min(state.width, state.height) * 0.1, 34, 58) * state.controlSize;
    const center = (name) => ({
      x: state.layout[name][0] * state.width,
      y: state.layout[name][1] * state.height,
    });
    return {
      joystick: { center: center("joystick"), radius: unit },
      attack: { center: center("attack"), radius: unit * 0.82 },
      grenade: { center: center("grenade"), radius: unit * 0.68 },
      nuke: { center: center("nuke"), radius: unit * 0.68 },
    };
  }

  function announce(message) {
    if (message !== state.lastAnnouncement) {
      announcement.textContent = message;
      state.lastAnnouncement = message;
    }
  }

  function setScreen(name) {
    state.screen = name;
    state.ui.clear();
    const labels = {
      home: "Home screen", settings: "Settings",
      help: "How to play", paused: "Game paused", gameOver: "Game over",
    };
    announce(labels[name] || name);
  }

  function lowestHealthEnemy() {
    if (!state.enemies.length) return null;
    const p = playerCenter();
    return state.enemies.reduce((lowest, enemy) => {
      if (enemy.hp < lowest.hp) return enemy;
      if (enemy.hp === lowest.hp && distance(enemy, p) < distance(lowest, p)) return enemy;
      return lowest;
    });
  }

  function spawnEnemyWave() {
    const first = Math.random() * TAU;
    for (let i = 0; i < 8; i++) {
      const angle = first + TAU * i / 8;
      const p = playerCenter();
      const position = {
        x: p.x + Math.cos(angle) * state.orbitRadius,
        y: p.y + Math.sin(angle) * state.orbitRadius,
      };
      state.enemies.push({
        x: position.x, y: position.y, size: 30,
        orbitDirection: Math.random() < 0.5 ? -1 : 1,
        orbitSpeed: 0.0025 + Math.random() * 0.0025,
        nextShot: state.time + 4000, hp: 100, pullTarget: null, pullUntil: 0,
      });
    }
  }

  function damageEnemy(enemy, damage) {
    enemy.hp -= damage;
    if (enemy.hp > 0) return;
    const index = state.enemies.indexOf(enemy);
    if (index >= 0) state.enemies.splice(index, 1);
    state.score += 3;
    const particles = [];
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * TAU;
      const velocity = 1.2 + Math.random() * 2.6;
      particles.push({
        x: enemy.x, y: enemy.y,
        vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
        radius: 2 + Math.floor(Math.random() * 3),
      });
    }
    state.explosions.push({ start: state.time, particles });
  }

  function saveHighScore() {
    if (state.score <= state.high) return;
    state.high = state.score;
    try { localStorage.setItem(STORE.high, String(state.high)); } catch { /* session score remains */ }
  }

  function startNewGame() {
    state.health = 3;
    state.score = 0;
    state.crosshair = null;
    state.spaceHeld = false;
    state.player.x = (state.width - state.player.size) / 2;
    state.player.y = (state.height - state.player.size) / 2;
    state.player.remX = 0;
    state.player.remY = 0;
    state.joystick.pointer = null;
    state.joystick.x = 0;
    state.joystick.y = 0;
    state.skill.pointer = null;
    state.skill.name = null;
    state.skill.start = null;
    state.skill.direction = null;
    state.lastSpawn = state.time;
    state.lastRipple = state.time;
    for (const key of ["enemies", "rockets", "enemyShots", "grenades", "nukes",
      "shockwaves", "explosions", "blasts", "ripples"]) state[key].length = 0;
    setScreen("playing");
  }

  function launchRocket(target) {
    const start = playerCenter();
    let direction = normalize({ x: target.x - start.x, y: target.y - start.y });
    if (!direction.x && !direction.y) direction = { ...state.aim };
    else state.aim = { ...direction };
    state.crosshair = { x: target.x, y: target.y, expires: state.time + 750 };
    state.rockets.push({
      x: start.x, y: start.y, target: { ...target }, direction,
      trail: [], size: 10,
    });
  }

  function activateSkill(name, aimDirection = null) {
    const start = playerCenter();
    const targetEnemy = aimDirection ? null : lowestHealthEnemy();
    let target;
    if (targetEnemy) {
      target = { x: targetEnemy.x, y: targetEnemy.y };
    } else {
      let direction = aimDirection || state.aim;
      if (!direction.x && !direction.y) direction = { x: 0, y: -1 };
      direction = normalize(direction);
      state.aim = { ...direction };
      const range = name === "attack"
        ? Math.max(state.width, state.height)
        : Math.min(state.width, state.height) * 0.45;
      target = {
        x: clamp(start.x + direction.x * range, 0, state.width),
        y: clamp(start.y + direction.y * range, 0, state.height),
      };
    }
    const direction = normalize({ x: target.x - start.x, y: target.y - start.y });
    if (direction.x || direction.y) state.aim = direction;
    if (name === "attack") {
      launchRocket(target);
    } else if (name === "grenade") {
      state.grenades.push({
        x: start.x, y: start.y, start: { ...start }, target: { ...target },
        startTime: state.time, detonateAt: state.time + 750,
      });
    } else if (name === "nuke") {
      state.nukes.push({
        x: start.x, y: start.y, start: { ...start }, target: { ...target },
        startTime: state.time, detonateAt: state.time + 900, trail: [],
      });
    }
  }

  function beginControl(pointer, point) {
    const controls = controlMetrics();
    const joy = controls.joystick;
    if (!state.joystick.pointer && distance(point, joy.center) <= joy.radius * 1.5) {
      state.joystick.pointer = pointer;
      movePointer(pointer, point);
      return true;
    }
    if (!state.skill.pointer) {
      for (const name of ["attack", "grenade", "nuke"]) {
        const button = controls[name];
        if (distance(point, button.center) <= button.radius) {
          state.skill.pointer = pointer;
          state.skill.name = name;
          state.skill.start = { ...point };
          state.skill.direction = null;
          return true;
        }
      }
    }
    return false;
  }

  function movePointer(pointer, point) {
    if (pointer === state.joystick.pointer) {
      const { center, radius } = controlMetrics().joystick;
      let offset = { x: point.x - center.x, y: point.y - center.y };
      const magnitude = length(offset);
      if (magnitude > radius) offset = {
        x: offset.x * radius / magnitude, y: offset.y * radius / magnitude,
      };
      state.joystick.x = offset.x / radius;
      state.joystick.y = offset.y / radius;
    } else if (pointer === state.skill.pointer && state.skill.start) {
      const offset = { x: point.x - state.skill.start.x, y: point.y - state.skill.start.y };
      if (length(offset) >= 22) state.skill.direction = normalize(offset);
    }
  }

  function endPointer(pointer, point) {
    if (pointer === state.joystick.pointer) {
      state.joystick.pointer = null;
      state.joystick.x = 0;
      state.joystick.y = 0;
    } else if (pointer === state.skill.pointer) {
      movePointer(pointer, point);
      activateSkill(state.skill.name, state.skill.direction);
      state.skill.pointer = null;
      state.skill.name = null;
      state.skill.start = null;
      state.skill.direction = null;
    }
  }

  function makeButton(name, label, x, y, w, h, color) {
    const button = { ...rect(x - w / 2, y - h / 2, w, h), color, label };
    state.ui.set(name, button);
    const hover = inside({ x: pointerPosition.x, y: pointerPosition.y }, button);
    roundRect(button.x, button.y, button.w, button.h, 14, hover ? "#122e40" : "#0d192b");
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    roundRectPath(button.x, button.y, button.w, button.h, 14);
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 ${fontSize(18)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
    return button;
  }

  let pointerPosition = { x: -1, y: -1 };

  function roundRectPath(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function roundRect(x, y, w, h, r, color) {
    roundRectPath(x, y, w, h, r);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function fontSize(size) { return clamp(Math.round(Math.min(state.width, state.height) * size / 720), size * 0.8, size * 1.5); }

  function drawBackground() {
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, 0, state.width, state.height);
    const glow1 = ctx.createRadialGradient(state.width * 0.18, state.height * 0.22, 0, state.width * 0.18, state.height * 0.22, Math.min(state.width, state.height) * 0.42);
    glow1.addColorStop(0, "#0c1f37");
    glow1.addColorStop(1, "transparent");
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, state.width, state.height);
    const glow2 = ctx.createRadialGradient(state.width * 0.84, state.height * 0.8, 0, state.width * 0.84, state.height * 0.8, Math.min(state.width, state.height) * 0.36);
    glow2.addColorStop(0, "#180f32");
    glow2.addColorStop(1, "transparent");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, state.width, state.height);
    state.stars.forEach((star, i) => {
      const pulse = 0.55 + 0.45 * Math.sin(state.time * 0.0015 + i);
      ctx.fillStyle = `rgba(32, 100, 125, ${pulse})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, TAU);
      ctx.fill();
    });
  }

  function drawPanel(x, y, w, h, border = COLORS.blue, alpha = 0.9) {
    roundRect(x, y, w, h, 18, `rgba(10, 17, 34, ${alpha})`);
    ctx.strokeStyle = border;
    ctx.shadowColor = border;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 1.5;
    roundRectPath(x, y, w, h, 18);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawMenu() {
    state.ui.clear();
    drawBackground();
    const compact = state.width < 700;
    const panelW = Math.min(state.width - 32, compact ? 460 : 650);
    const panelH = state.screen === "settings"
      ? Math.min(state.height - 28, 330)
      : Math.min(state.height - 28, compact ? 620 : 590);
    const px = (state.width - panelW) / 2;
    const py = state.screen === "settings"
      ? Math.max(14, Math.min(state.height / 2 - panelH / 2, 20))
      : (state.height - panelH) / 2;
    drawPanel(px, py, panelW, panelH);

    if (state.screen === "home") {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 22;
      ctx.fillStyle = COLORS.text;
      ctx.font = `900 ${fontSize(compact ? 36 : 58)}px system-ui, sans-serif`;
      ctx.fillText("NEON SURVIVOR", state.width / 2, py + panelH * 0.2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = COLORS.cyan;
      ctx.font = `700 ${fontSize(16)}px system-ui, sans-serif`;
      ctx.fillText("SURVIVE THE SWARM", state.width / 2, py + panelH * 0.29);
      const bw = Math.min(panelW - 44, 360);
      const bh = Math.max(48, Math.min(64, state.height * 0.09));
      const first = py + panelH * 0.48;
      makeButton("newGame", "NEW GAME", state.width / 2, first, bw, bh, COLORS.cyan);
      makeButton("settings", "SETTINGS", state.width / 2, first + bh * 1.28, bw, bh, COLORS.purple);
      makeButton("help", "HOW TO PLAY", state.width / 2, first + bh * 2.56, bw, bh, COLORS.blue);
      label(`BEST SCORE  ${state.high}`, state.width / 2, py + panelH * 0.93, fontSize(16), COLORS.muted);
    } else if (state.screen === "settings") {
      label("SETTINGS", state.width / 2, py + 40, fontSize(26), COLORS.text, true);
      drawControls(true);
      label("Drag a control to move it", state.width / 2, py + 80, fontSize(16), COLORS.muted);
      const bw = Math.min(190, (panelW - 48) / 2);
      const bh = Math.max(40, Math.min(48, state.height * 0.066));
      const row = py + panelH - bh * 2.3;
      makeButton("sizeDown", "SIZE −", state.width / 2 - bw * 0.55, row, bw, bh, COLORS.blue);
      makeButton("sizeUp", "SIZE +", state.width / 2 + bw * 0.55, row, bw, bh, COLORS.blue);
      label(`CONTROL SIZE  ${Math.round(state.controlSize * 100)}%`, state.width / 2, row - bh * 0.75, fontSize(16), COLORS.cyan);
      makeButton("reset", "RESET", state.width / 2 - bw * 0.55, py + panelH - bh * 0.85, bw, bh, COLORS.purple);
      makeButton("settingsDone", "DONE", state.width / 2 + bw * 0.55, py + panelH - bh * 0.85, bw, bh, COLORS.green);
      if (state.settingsMessage) label(state.settingsMessage, state.width / 2, py + panelH - bh * 1.55, fontSize(14), COLORS.muted);
    } else if (state.screen === "help") {
      label("HOW TO PLAY", state.width / 2, py + 52, fontSize(28), COLORS.text, true);
      const lines = [
        ["MOVE", "WASD or the glowing joystick"],
        ["SHOT", "Tap to target the weakest enemy"],
        ["AIM", "Drag from a skill button to aim"],
        ["BOMB / NUKE", "Tap to auto-target or drag to aim"],
        ["DESKTOP", "Click fire · Right-click bomb · Space + click nuke"],
      ];
      const lineH = Math.max(45, state.height * 0.078);
      lines.forEach(([heading, detail], i) => {
        const y = py + 120 + i * lineH;
        label(heading, px + 28, y, fontSize(15), COLORS.cyan, true, "left");
        label(detail, px + 28, y + 22, fontSize(15), COLORS.text, false, "left");
      });
      makeButton("helpBack", "BACK", state.width / 2, py + panelH - 42, Math.min(300, panelW - 48), 48, COLORS.cyan);
    } else {
      const paused = state.screen === "paused";
      label(paused ? "PAUSED" : "RUN OVER", state.width / 2, py + panelH * 0.22, fontSize(48), paused ? COLORS.cyan : "#ff697d", true);
      label(`SCORE  ${state.score}`, state.width / 2, py + panelH * 0.36, fontSize(24), COLORS.text);
      label(`BEST  ${state.high}`, state.width / 2, py + panelH * 0.44, fontSize(16), COLORS.muted);
      const bw = Math.min(panelW - 48, 340);
      const bh = Math.max(46, Math.min(58, state.height * 0.08));
      const first = py + panelH * 0.57;
      let restartY = first;
      if (paused) {
        makeButton("resume", "RESUME", state.width / 2, first, bw, bh, COLORS.cyan);
        restartY += bh * 1.22;
      }
      makeButton("restart", "NEW GAME", state.width / 2, restartY, bw, bh, COLORS.green);
      makeButton("returnHome", "HOME", state.width / 2, restartY + bh * 1.22, bw, bh, COLORS.purple);
    }
  }

  function label(text, x, y, size, color, bold = false, align = "center") {
    ctx.fillStyle = color;
    ctx.font = `${bold ? 800 : 500} ${size}px system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawControls(editMode = false) {
    const metrics = controlMetrics();
    const joy = metrics.joystick;
    ctx.beginPath();
    ctx.arc(joy.center.x, joy.center.y, joy.radius, 0, TAU);
    ctx.fillStyle = "rgba(14, 31, 51, .88)";
    ctx.fill();
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    const knobX = joy.center.x + state.joystick.x * joy.radius * 0.55;
    const knobY = joy.center.y + state.joystick.y * joy.radius * 0.55;
    ctx.beginPath();
    ctx.arc(knobX, knobY, joy.radius * 0.38, 0, TAU);
    ctx.fillStyle = "rgba(33, 99, 130, .92)";
    ctx.fill();
    ctx.strokeStyle = "#87f5ff";
    ctx.stroke();

    const specs = [
      ["attack", "SHOT", COLORS.cyan],
      ["grenade", "BOMB", COLORS.blue],
      ["nuke", "NUKE", COLORS.purple],
    ];
    for (const [name, text, color] of specs) {
      const { center, radius } = metrics[name];
      const active = state.skill.name === name;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, TAU);
      ctx.fillStyle = active ? "#224f5e" : (name === "attack" ? "#183d4d" : "#152144");
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius * 0.79, 0, TAU);
      ctx.lineWidth = 1;
      ctx.stroke();
      label(text, center.x, center.y, fontSize(14), COLORS.text, true);
      if (editMode) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius + 7, 0, TAU);
        ctx.strokeStyle = "rgba(255,255,255,.55)";
        ctx.stroke();
      }
    }
    if (state.skill.direction) {
      const p = playerCenter();
      const endX = clamp(p.x + state.skill.direction.x * Math.min(state.width, state.height) * 0.35, 0, state.width);
      const endY = clamp(p.y + state.skill.direction.y * Math.min(state.width, state.height) * 0.35, 0, state.height);
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(endX, endY, 10, 0, TAU);
      ctx.stroke();
    }
  }

  function menuAction(name) {
    if (name === "newGame" || name === "restart") startNewGame();
    else if (name === "settings") {
      state.settingsMessage = "";
      setScreen("settings");
    } else if (name === "help") setScreen("help");
    else if (name === "settingsDone" || name === "helpBack") {
      saveSettings();
      setScreen("home");
    } else if (name === "sizeDown") {
      state.controlSize = Math.max(0.65, Math.round((state.controlSize - 0.1) * 100) / 100);
      saveSettings();
    } else if (name === "sizeUp") {
      state.controlSize = Math.min(1.6, Math.round((state.controlSize + 0.1) * 100) / 100);
      saveSettings();
    } else if (name === "reset") {
      state.layout = defaultLayout();
      state.controlSize = 1;
      saveSettings();
    } else if (name === "resume") setScreen("playing");
    else if (name === "returnHome") setScreen("home");
  }

  function findControl(point) {
    const metrics = controlMetrics();
    for (const name of ["nuke", "grenade", "attack", "joystick"]) {
      const control = metrics[name];
      if (distance(point, control.center) <= control.radius + 10) return name;
    }
    return null;
  }

  function beginLayoutDrag(point, pointer) {
    const name = findControl(point);
    if (!name) return false;
    const center = controlMetrics()[name].center;
    state.layoutDrag = {
      name, pointer, offset: { x: center.x - point.x, y: center.y - point.y },
    };
    return true;
  }

  function moveLayout(point, pointer) {
    const drag = state.layoutDrag;
    if (!drag || drag.pointer !== pointer) return false;
    const radius = controlMetrics()[drag.name].radius;
    const x = clamp(point.x + drag.offset.x, radius + 8, state.width - radius - 8);
    const y = clamp(point.y + drag.offset.y, radius + 8, state.height - radius - 8);
    state.layout[drag.name] = [x / state.width, y / state.height];
    return true;
  }

  function hitMenu(point, pointer) {
    for (const [name, button] of state.ui) {
      if (inside(point, button)) {
        menuAction(name);
        return true;
      }
    }
    if (state.screen === "settings") beginLayoutDrag(point, pointer);
    return false;
  }

  function hitPlaying(point) {
    const pause = state.ui.get("pause");
    if (pause && inside(point, pause)) {
      setScreen("paused");
      return true;
    }
    return false;
  }

  function pointerDown(event) {
    canvas.focus({ preventScroll: true });
    const point = pointerPosition = { x: event.offsetX, y: event.offsetY };
    if (event.button === 2 && state.screen === "playing") {
      const start = playerCenter();
      state.grenades.push({
        x: start.x, y: start.y, start: { ...start }, target: point,
        startTime: state.time, detonateAt: state.time + 750,
      });
      return;
    }
    if (state.screen === "playing") {
      if (!hitPlaying(point)) {
        const grabbed = beginControl(event.pointerId, point);
        if (!grabbed && event.pointerType === "mouse" && event.button === 0) {
          if (state.spaceHeld) {
            const start = playerCenter();
            state.nukes.push({
              x: start.x, y: start.y, start: { ...start }, target: point,
              startTime: state.time, detonateAt: state.time + 900, trail: [],
            });
          } else launchRocket(point);
        }
      }
    } else {
      hitMenu(point, event.pointerId);
    }
    try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
  }

  function pointerMove(event) {
    const point = pointerPosition = { x: event.offsetX, y: event.offsetY };
    if (state.screen === "settings" && moveLayout(point, event.pointerId)) return;
    movePointer(event.pointerId, point);
  }

  function pointerUp(event) {
    const point = pointerPosition = { x: event.offsetX, y: event.offsetY };
    if (state.screen === "settings" && state.layoutDrag?.pointer === event.pointerId) {
      moveLayout(point, event.pointerId);
      state.layoutDrag = null;
      saveSettings();
      return;
    }
    endPointer(event.pointerId, point);
  }

  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("pointerleave", (event) => {
    if (!event.buttons) pointerPosition = { x: -1, y: -1 };
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
    state.keys.add(event.code);
    if (event.code === "Space") state.spaceHeld = true;
    if (event.code === "Escape") {
      if (state.screen === "playing") setScreen("paused");
      else if (state.screen === "paused") setScreen("playing");
      else setScreen("home");
    }
    if (event.code === "KeyN" && state.screen === "gameOver") startNewGame();
  });
  window.addEventListener("keyup", (event) => {
    state.keys.delete(event.code);
    if (event.code === "Space") state.spaceHeld = false;
  });
  window.addEventListener("resize", resize);

  function updateEnemy(enemy, factor) {
    if (enemy.pullTarget && state.time < enemy.pullUntil) {
      const dx = enemy.pullTarget.x - enemy.x;
      const dy = enemy.pullTarget.y - enemy.y;
      const d = Math.hypot(dx, dy);
      if (d) {
        const step = Math.min(6 * factor, d);
        enemy.x += dx / d * step;
        enemy.y += dy / d * step;
      }
    } else {
      enemy.pullTarget = null;
      const player = playerCenter();
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const d = Math.hypot(dx, dy);
      if (d) {
        const rx = dx / d;
        const ry = dy / d;
        const tx = -ry * enemy.orbitDirection;
        const ty = rx * enemy.orbitDirection;
        const radial = clamp((d - state.orbitRadius) * 0.02, -2, 2);
        enemy.x += (rx * radial + tx * enemy.orbitSpeed * state.orbitRadius) * factor;
        enemy.y += (ry * radial + ty * enemy.orbitSpeed * state.orbitRadius) * factor;
      }
    }
    if (state.time >= enemy.nextShot) {
      const start = { x: enemy.x, y: enemy.y };
      const target = playerCenter();
      const dir = normalize({ x: target.x - start.x, y: target.y - start.y });
      if (dir.x || dir.y) state.enemyShots.push({
        x: start.x, y: start.y, direction: dir, size: 10, trail: [],
      });
      enemy.nextShot = state.time + 1800 + Math.random() * 800;
    }
  }

  function updateProjectiles(factor) {
    for (const rocket of [...state.rockets]) {
      const d = distance(rocket, rocket.target);
      const travel = Math.min(10 * factor, d);
      rocket.x += rocket.direction.x * travel;
      rocket.y += rocket.direction.y * travel;
      addTrail(rocket, 8);
      const target = state.enemies.find((enemy) =>
        Math.abs(rocket.x - enemy.x) < (enemy.size + rocket.size) / 2 &&
        Math.abs(rocket.y - enemy.y) < (enemy.size + rocket.size) / 2);
      if (target) {
        damageEnemy(target, 68);
        remove(state.rockets, rocket);
      } else if (d <= 10) remove(state.rockets, rocket);
    }

    for (const grenade of [...state.grenades]) {
      const progress = clamp((state.time - grenade.startTime) / 750, 0, 1);
      grenade.x = grenade.start.x + (grenade.target.x - grenade.start.x) * progress;
      grenade.y = grenade.start.y + (grenade.target.y - grenade.start.y) * progress;
      if (state.time >= grenade.detonateAt) {
        state.shockwaves.push({ x: grenade.target.x, y: grenade.target.y, start: state.time });
        for (const enemy of [...state.enemies]) {
          const d = distance(enemy, grenade.target);
          if (d <= 230) damageEnemy(enemy, 35);
          if (d <= 230 * 1.75 && state.enemies.includes(enemy)) {
            enemy.pullTarget = { ...grenade.target };
            enemy.pullUntil = state.time + 1300;
          }
        }
        remove(state.grenades, grenade);
      }
    }

    for (const nuke of [...state.nukes]) {
      const progress = clamp((state.time - nuke.startTime) / 900, 0, 1);
      nuke.x = nuke.start.x + (nuke.target.x - nuke.start.x) * progress;
      nuke.y = nuke.start.y + (nuke.target.y - nuke.start.y) * progress;
      addTrail(nuke, 14);
      if (state.time >= nuke.detonateAt) {
        state.blasts.push(makeBlast(nuke.target));
        for (const enemy of [...state.enemies]) {
          if (distance(enemy, nuke.target) <= 300) damageEnemy(enemy, 80);
        }
        remove(state.nukes, nuke);
      }
    }

    for (const projectile of [...state.enemyShots]) {
      projectile.x += projectile.direction.x * 3.5 * factor;
      projectile.y += projectile.direction.y * 3.5 * factor;
      addTrail(projectile, 8);
      const p = playerCenter();
      if (Math.abs(projectile.x - p.x) < (state.player.size + projectile.size) / 2 &&
          Math.abs(projectile.y - p.y) < (state.player.size + projectile.size) / 2) {
        remove(state.enemyShots, projectile);
        state.health = Math.max(0, state.health - 1);
        if (state.health === 0) {
          saveHighScore();
          setScreen("gameOver");
        }
      } else if (projectile.x < 0 || projectile.y < 0 ||
          projectile.x > state.width || projectile.y > state.height) {
        remove(state.enemyShots, projectile);
      }
    }
  }

  function addTrail(item, limit) {
    item.trail.push({ x: item.x, y: item.y });
    if (item.trail.length > limit) item.trail.shift();
  }

  function makeBlast(position) {
    const smoke = Array.from({ length: 22 }, () => {
      const angle = Math.random() * TAU;
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const offset = Math.random() * 95;
      return {
        dx: direction.x, dy: direction.y,
        ox: direction.x * offset, oy: direction.y * offset,
        radius: 18 + Math.random() * 28,
      };
    });
    return { x: position.x, y: position.y, start: state.time, smoke };
  }

  function remove(array, item) {
    const i = array.indexOf(item);
    if (i !== -1) array.splice(i, 1);
  }

  function update(factor) {
    if (state.screen !== "playing") return;
    const before = playerCenter();
    const mx = Number(state.keys.has("KeyD") || state.keys.has("ArrowRight")) -
      Number(state.keys.has("KeyA") || state.keys.has("ArrowLeft")) + state.joystick.x;
    const my = Number(state.keys.has("KeyS") || state.keys.has("ArrowDown")) -
      Number(state.keys.has("KeyW") || state.keys.has("ArrowUp")) + state.joystick.y;
    let movement = { x: mx, y: my };
    if (length(movement) > 1) movement = normalize(movement);
    const vx = movement.x * 5 * factor + state.player.remX;
    const vy = movement.y * 5 * factor + state.player.remY;
    const stepX = Math.trunc(vx);
    const stepY = Math.trunc(vy);
    state.player.remX = vx - stepX;
    state.player.remY = vy - stepY;
    state.player.x += stepX;
    state.player.y += stepY;
    const after = playerCenter();
    if ((after.x !== before.x || after.y !== before.y) && state.time - state.lastRipple >= 70) {
      state.ripples.push({ x: before.x, y: before.y, start: state.time });
      state.lastRipple = state.time;
    }

    if (state.time - state.lastSpawn >= 3000) {
      spawnEnemyWave();
      state.lastSpawn = state.time;
    }
    for (const enemy of state.enemies) updateEnemy(enemy, factor);
    updateProjectiles(factor);
    for (const wave of [...state.shockwaves]) if (state.time - wave.start >= 900) remove(state.shockwaves, wave);
    for (const blast of [...state.blasts]) if (state.time - blast.start >= 1400) remove(state.blasts, blast);
    for (const ripple of [...state.ripples]) if (state.time - ripple.start >= 520) remove(state.ripples, ripple);
    for (const explosion of [...state.explosions]) {
      const age = state.time - explosion.start;
      if (age >= 450) {
        remove(state.explosions, explosion);
        continue;
      }
      for (const particle of explosion.particles) {
        particle.x += particle.vx * factor;
        particle.y += particle.vy * factor;
        particle.vx *= 0.94 ** factor;
        particle.vy *= 0.94 ** factor;
      }
    }
  }

  function drawGame() {
    drawBackground();
    for (const blast of state.blasts) drawBlast(blast);
    for (const ripple of state.ripples) {
      const progress = (state.time - ripple.start) / 520;
      const rx = 5 + progress * 24;
      ctx.strokeStyle = `rgba(70, 190, 245, ${1 - progress})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ripple.x, ripple.y, rx, rx * 0.55, 0, 0, TAU);
      ctx.stroke();
    }

    const player = playerCenter();
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#1ecdb0";
    roundRect(state.player.x, state.player.y, state.player.size, state.player.size, 8, "#1ecdb0");
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#a0ffe6";
    ctx.lineWidth = 2;
    roundRectPath(state.player.x, state.player.y, state.player.size, state.player.size, 8);
    ctx.stroke();

    for (const enemy of state.enemies) {
      const x = enemy.x - enemy.size / 2;
      const y = enemy.y - enemy.size / 2;
      ctx.fillStyle = COLORS.red;
      ctx.shadowColor = "#ff3448";
      ctx.shadowBlur = 10;
      ctx.fillRect(x, y, enemy.size, enemy.size);
      ctx.shadowBlur = 0;
      const ratio = clamp(enemy.hp / 100, 0, 1);
      ctx.fillStyle = "rgba(55, 25, 35, .9)";
      ctx.fillRect(x, y - 8, enemy.size, 4);
      ctx.fillStyle = `rgb(${Math.round(220 * (1 - ratio) + 35)}, ${Math.round(190 * ratio + 30)}, 65)`;
      ctx.fillRect(x, y - 8, enemy.size * ratio, 4);
    }
    for (const wave of state.shockwaves) {
      for (let i = 0; i < 3; i++) {
        const age = state.time - wave.start - i * 110;
        if (age < 0 || age > 650) continue;
        const radius = 8 + age / 650 * 230 * 1.75;
        ctx.strokeStyle = `rgba(80, 175, 255, ${1 - age / 800})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, radius, 0, TAU);
        ctx.stroke();
      }
    }

    drawTrails();
    for (const rocket of state.rockets) circle(rocket.x, rocket.y, 5, COLORS.orange, "#ffd991");
    for (const projectile of state.enemyShots) circle(projectile.x, projectile.y, 5, "#ff5a4b", "#ffc0ad");
    for (const nuke of state.nukes) {
      circle(nuke.x, nuke.y, 13, "#2d91ff", "#d2f5ff");
      circle(nuke.x, nuke.y, 6, "#d2f5ff");
    }
    for (const grenade of state.grenades) {
      circle(grenade.x, grenade.y, 14, "#1469dc", "#7ddcff");
      circle(grenade.target.x, grenade.target.y, 20, "transparent", "#5abfff", 2);
      ctx.strokeStyle = "rgba(180, 230, 255, .9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(grenade.target.x - 25, grenade.target.y);
      ctx.lineTo(grenade.target.x + 25, grenade.target.y);
      ctx.moveTo(grenade.target.x, grenade.target.y - 25);
      ctx.lineTo(grenade.target.x, grenade.target.y + 25);
      ctx.stroke();
    }
    for (const explosion of state.explosions) {
      const progress = (state.time - explosion.start) / 450;
      for (const particle of explosion.particles) {
        circle(particle.x, particle.y, Math.max(1, particle.radius * (1 - progress)),
          `rgba(255, ${Math.round(190 * (1 - progress))}, ${Math.round(70 * (1 - progress))}, 1)`);
      }
    }

    const hud = { x: 12, y: 12, w: Math.min(230, state.width * 0.35), h: 62 };
    drawPanel(hud.x, hud.y, hud.w, hud.h, COLORS.blue, 0.82);
    label(`HP  ${state.health}`, hud.x + 14, hud.y + 18, fontSize(18), COLORS.green, true, "left");
    label(`SCORE  ${state.score}`, hud.x + 14, hud.y + 45, fontSize(15), COLORS.text, false, "left");
    const pause = { x: state.width - 68, y: 14, w: 54, h: 46 };
    state.ui.clear();
    state.ui.set("pause", pause);
    roundRect(pause.x, pause.y, pause.w, pause.h, 12, "#0d192b");
    ctx.strokeStyle = COLORS.cyan;
    roundRectPath(pause.x, pause.y, pause.w, pause.h, 12);
    ctx.stroke();
    label("Ⅱ", pause.x + pause.w / 2, pause.y + pause.h / 2, fontSize(20), COLORS.text, true);
    drawControls();

    if (state.crosshair && state.time < state.crosshair.expires) {
      const { x, y } = state.crosshair;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
      ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
      ctx.stroke();
    } else state.crosshair = null;
  }

  function drawTrails() {
    for (const rocket of state.rockets) drawTrail(rocket.trail, "#ffa046");
    for (const shot of state.enemyShots) drawTrail(shot.trail, "#f05a4b");
    for (const nuke of state.nukes) drawTrail(nuke.trail, "#5f9bdc");
  }

  function drawTrail(points, color) {
    points.forEach((point, index) => {
      const intensity = (index + 1) / points.length;
      circle(point.x, point.y, Math.max(1, 3 * intensity), color,
        `rgba(255,255,255,${intensity * 0.45})`, 0, intensity * 0.6);
    });
  }

  function circle(x, y, radius, fill, stroke = null, lineWidth = 1, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, radius), 0, TAU);
    if (fill && fill !== "transparent") {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawBlast(blast) {
    const age = state.time - blast.start;
    const progress = Math.min(1, age / 1400);
    for (const puff of blast.smoke) {
      const puffProgress = Math.min(1, age / 1100);
      const x = blast.x + puff.ox + puff.dx * puffProgress * 55;
      const y = blast.y + puff.oy + puff.dy * puffProgress * 55;
      const r = puff.radius * (0.7 + puffProgress * 0.8);
      const shade = Math.max(25, Math.round(78 - progress * 48));
      circle(x, y, r, `rgb(${shade}, ${shade + 5}, ${Math.min(115, shade + 24)})`);
    }
    const radius = progress * 340;
    if (radius > 0) {
      ctx.strokeStyle = "#ffb20f";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(blast.x, blast.y, radius, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "#fff1af";
      ctx.lineWidth = 2;
      ctx.stroke();
      const points = [];
      for (let i = 0; i < 48; i++) {
        const angle = TAU * i / 48;
        const jitter = Math.sin(state.time * 0.07 + i * 2.1) * 9 +
          Math.sin(state.time * 0.126 + i * 0.8) * 4;
        points.push({ x: blast.x + Math.cos(angle) * (radius + jitter), y: blast.y + Math.sin(angle) * (radius + jitter) });
      }
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.closePath();
      ctx.strokeStyle = "#ffe146";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    const flash = Math.max(0, 1 - age / 240);
    if (flash) {
      circle(blast.x, blast.y, 58 * flash, `rgba(255,185,25,${flash})`);
      circle(blast.x, blast.y, 30 * flash, `rgba(255,250,195,${flash})`);
    }
  }

  function render(now) {
    const elapsed = state.lastFrame ? Math.min(50, now - state.lastFrame) : 1000 / 60;
    state.lastFrame = now;
    state.time += elapsed;
    const factor = elapsed / (1000 / 60);
    update(factor);
    if (state.screen === "playing") drawGame();
    else drawMenu(state.time);
    requestAnimationFrame(render);
  }

  resize();
  state.lastSpawn = 0;
  state.lastFrame = performance.now();
  canvas.focus({ preventScroll: true });
  requestAnimationFrame(render);
})();
