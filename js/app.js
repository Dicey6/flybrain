(function () {
  'use strict';

  const rand = FlyBrain.mulberry32(9001);
  const N_SENS = FlyBrain.N_SENS;
  const sensorAngle = FlyBrain.sensorAngle;
  const SENS_RANGE = 5.5;
  const SENS_CONE = Math.PI / 4.2;
  const ARENA_R = 22;
  const BASE_SPEED = 0.78;
  const GAIT_FREQ = 4.5;

  const wrap = document.getElementById('canvas-wrap');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060a0d);
  scene.fog = new THREE.FogExp2(0x060a0d, 0.021);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  wrap.appendChild(renderer.domElement);

  const ambient = new THREE.HemisphereLight(0x8ba89e, 0x071013, 1.0);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffead0, 2.1);
  key.position.set(8, 16, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26; key.shadow.camera.right = 26;
  key.shadow.camera.top = 26; key.shadow.camera.bottom = -26;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rimLight = new THREE.DirectionalLight(0x72d8d1, 0.55);
  rimLight.position.set(-12, 6, -14);
  scene.add(rimLight);
  const fieldLight = new THREE.PointLight(0xf0b45c, 0.8, 26);
  fieldLight.position.set(0, 4, 0);
  scene.add(fieldLight);

  // ---------------- observation field ----------------
  const field = new THREE.Group();
  scene.add(field);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_R, 128),
    new THREE.MeshStandardMaterial({ color: 0x0b1516, roughness: 0.88, metalness: 0.08 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  field.add(ground);
  const underlay = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_R + 1.6, 128),
    new THREE.MeshStandardMaterial({ color: 0x071012, roughness: 1, metalness: 0 })
  );
  underlay.rotation.x = -Math.PI / 2; underlay.position.y = -0.035; field.add(underlay);
  const grid = new THREE.GridHelper(ARENA_R * 2, 44, 0x29403d, 0x142523);
  grid.position.y = 0.008;
  grid.material.transparent = true; grid.material.opacity = 0.23;
  field.add(grid);
  const boundary = new THREE.Mesh(
    new THREE.RingGeometry(ARENA_R - 0.08, ARENA_R + 0.015, 128),
    new THREE.MeshBasicMaterial({ color: 0xe5a44f, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
  );
  boundary.rotation.x = -Math.PI / 2; boundary.position.y = 0.025; field.add(boundary);
  [7.5, 14.5, 20.5].forEach((radius, index) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.008, radius, 128),
      new THREE.MeshBasicMaterial({ color: index === 2 ? 0x536c67 : 0x294440, side: THREE.DoubleSide, transparent: true, opacity: index === 2 ? 0.2 : 0.13 })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.018; field.add(ring);
  });
  const fieldMarkers = new THREE.Group();
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(i % 3 === 0 ? 0.55 : 0.18, 0.012, 0.025),
      new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xe5a44f : 0x4d6962, transparent: true, opacity: i % 3 === 0 ? 0.45 : 0.25 })
    );
    marker.position.set(Math.sin(a) * (ARENA_R - 0.42), 0.03, Math.cos(a) * (ARENA_R - 0.42));
    marker.rotation.y = a; fieldMarkers.add(marker);
  }
  field.add(fieldMarkers);

  function randomArenaPoint(minR) {
    let x, z, d;
    do {
      x = (rand() * 2 - 1) * ARENA_R * 0.84;
      z = (rand() * 2 - 1) * ARENA_R * 0.84;
      d = Math.hypot(x, z);
    } while (d < (minR || 0));
    return { x, z };
  }

  // ---------------- environmental structures ----------------
  const obstacles = [];
  const obstacleGroup = new THREE.Group();
  scene.add(obstacleGroup);
  function makeObstacle() {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.58, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0x1c2d2b, roughness: 0.78, metalness: 0.18 })
    );
    base.position.y = 0.06; base.castShadow = true; base.receiveShadow = true; group.add(base);
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.18, 1.15, 8),
      new THREE.MeshStandardMaterial({ color: 0x34453e, roughness: 0.64, metalness: 0.12 })
    );
    stalk.position.y = 0.62; stalk.castShadow = true; group.add(stalk);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 16, 8),
      new THREE.MeshStandardMaterial({ color: 0x9b4f3d, roughness: 0.52, metalness: 0.08 })
    );
    cap.scale.set(1, 0.5, 1); cap.position.y = 1.2; cap.castShadow = true; group.add(cap);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.47, 0.012, 5, 32),
      new THREE.MeshBasicMaterial({ color: 0xc87652, transparent: true, opacity: 0.55 })
    );
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.14; group.add(ring);
    return group;
  }
  function addObstacle(x, z) {
    const mesh = makeObstacle();
    mesh.position.set(x, 0, z); mesh.rotation.y = rand() * Math.PI * 2; obstacleGroup.add(mesh);
    obstacles.push({ x, z, r: 0.7, mesh });
  }
  function seedObstacles(n) { for (let i = 0; i < n; i++) { const p = randomArenaPoint(4); addObstacle(p.x, p.z); } }

  const food = [];
  const foodGroup = new THREE.Group();
  scene.add(foodGroup);
  function makeFoodMesh() {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16, 1),
      new THREE.MeshStandardMaterial({ color: 0xa4f17b, emissive: 0x416b2d, emissiveIntensity: 1.05, roughness: 0.28, metalness: 0.1 })
    );
    core.castShadow = true; group.add(core);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.012, 5, 24),
      new THREE.MeshBasicMaterial({ color: 0xa4f17b, transparent: true, opacity: 0.72 })
    );
    ring.rotation.x = Math.PI / 2; group.add(ring);
    return group;
  }
  function addFood(x, z) {
    const mesh = makeFoodMesh();
    mesh.position.set(x, 0.23, z); foodGroup.add(mesh);
    food.push({ x, z, r: 0.38, mesh, alive: true, phase: rand() * 8 });
  }
  function seedFood(n) { for (let i = 0; i < n; i++) { const p = randomArenaPoint(2); addFood(p.x, p.z); } }
  function respawnFood(item) {
    const p = randomArenaPoint(2);
    item.x = p.x; item.z = p.z; item.alive = true; item.mesh.position.set(p.x, 0.23, p.z); item.mesh.visible = true;
  }
  seedObstacles(8); seedFood(10);

  // ---------------- creature assembly ----------------
  function buildCreature(tintHex, eyeHex) {
    const creature = new THREE.Group();
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: tintHex, roughness: 0.32, metalness: 0.2, clearcoat: 0.35, clearcoatRoughness: 0.25 });
    const bodyDark = new THREE.MeshStandardMaterial({ color: 0x101b1a, roughness: 0.48, metalness: 0.18 });
    const jointMat = new THREE.MeshStandardMaterial({ color: 0x50635a, roughness: 0.42, metalness: 0.32 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: eyeHex, emissive: eyeHex, emissiveIntensity: 1.15, roughness: 0.22 });

    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.38, 22, 16), bodyMat);
    abdomen.scale.set(1.28, 0.57, 1.02); abdomen.position.set(0, 0.34, -0.05); abdomen.castShadow = true; creature.add(abdomen);
    const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 14), bodyMat);
    thorax.scale.set(1.08, 0.75, 1.15); thorax.position.set(0, 0.34, 0.3); thorax.castShadow = true; creature.add(thorax);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), bodyDark);
    head.scale.set(1, .82, .9); head.position.set(0, .39, .56); head.castShadow = true; creature.add(head);

    const eyes = [];
    [1, -1].forEach((side) => {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.018, .028, .18, 7), bodyDark);
      stalk.position.set(side * .12, .55, .63); stalk.rotation.x = -.38; creature.add(stalk);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.065, 12, 10), eyeMat);
      eye.position.set(side * .12, .64, .68); eye.castShadow = true; creature.add(eye); eyes.push(eye);
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.008, .012, .22, 5), jointMat);
      antenna.position.set(side * .08, .66, .7); antenna.rotation.x = side * .38; creature.add(antenna);
    });

    const wingMat = new THREE.MeshPhysicalMaterial({ color: 0xcce9e0, transparent: true, opacity: .27, transmission: .12, roughness: .12, side: THREE.DoubleSide });
    const wingGeo = new THREE.PlaneGeometry(.72, .29);
    const wingL = new THREE.Mesh(wingGeo, wingMat); const wingR = new THREE.Mesh(wingGeo, wingMat);
    wingL.position.set(.2, .55, -.04); wingR.position.set(-.2, .55, -.04); wingL.rotation.y = -.16; wingR.rotation.y = .16; creature.add(wingL, wingR);
    const wingVein = new THREE.LineBasicMaterial({ color: 0x93bdb1, transparent: true, opacity: .5 });
    [-1, 1].forEach((side) => {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * .3, .03, .02)]), wingVein);
      line.position.set(0, .55, -.045); line.rotation.y = side * .16; creature.add(line);
    });

    const hips = [
      { x: .3, z: .29 }, { x: -.3, z: .29 }, { x: .35, z: .04 },
      { x: -.35, z: .04 }, { x: .29, z: -.25 }, { x: -.29, z: -.25 }
    ];
    const legs = hips.map((def, i) => {
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(.024, .032, 1, 6), jointMat);
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(.017, .025, 1, 6), bodyDark);
      creature.add(upper, lower);
      return { def, upper, lower, group: i % 2 === 0 ? 'A' : 'B' };
    });
    scene.add(creature);
    return { group: creature, wingL, wingR, legs, eyes };
  }

  function makeAgent(id, tintHex, eyeHex, seed, startX, startZ) {
    const vis = buildCreature(tintHex, eyeHex);
    vis.group.position.set(startX, .02, startZ);
    return { id, vis, brain: new FlyBrain.Brain(seed, id), gaitPhase: rand() * 10, hipWorld: new THREE.Vector3(), footWorld: new THREE.Vector3(), footBase: new THREE.Vector3() };
  }
  const bio1 = makeAgent('BIO1', 0x493925, 0xf0b45c, 111, -4, 3);
  const bio2 = makeAgent('BIO2', 0x1d3d43, 0x73d9eb, 222, 4, -3);
  const agents = [bio1, bio2];
  function otherOf(agent) { return agent === bio1 ? bio2 : bio1; }

  // ---------------- sensing ----------------
  function computeConeSensors(sourcePos, heading, targets) {
    const out = new Float32Array(N_SENS);
    for (const target of targets) {
      const dx = target.x - sourcePos.x, dz = target.z - sourcePos.z;
      const dist = Math.hypot(dx, dz) - (target.r || 0);
      if (dist > SENS_RANGE) continue;
      const relAngle = Math.atan2(dx, dz) - heading;
      for (let i = 0; i < N_SENS; i++) {
        let diff = sensorAngle(i) - relAngle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) < SENS_CONE) out[i] = Math.max(out[i], Math.max(0, 1 - Math.max(dist, 0) / SENS_RANGE));
      }
    }
    return out;
  }
  function boundarySensor(sourcePos, heading) {
    const out = new Float32Array(N_SENS);
    const distance = ARENA_R - Math.hypot(sourcePos.x, sourcePos.z);
    if (distance >= SENS_RANGE) return out;
    const relAngle = Math.atan2(sourcePos.x, sourcePos.z) - heading;
    for (let i = 0; i < N_SENS; i++) {
      let diff = sensorAngle(i) - relAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) < SENS_CONE) out[i] = Math.max(0, 1 - Math.max(distance, 0) / SENS_RANGE) * .9;
    }
    return out;
  }

  function setLegSegment(mesh, start, end) {
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(.5);
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = Math.max(direction.length(), .05);
    mesh.position.copy(midpoint);
    mesh.scale.set(1, length, 1);
    mesh.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  }
  function setLegSpan(leg, hip, foot) {
    const knee = new THREE.Vector3().lerpVectors(hip, foot, .5);
    knee.y += .045;
    setLegSegment(leg.upper, hip, knee);
    setLegSegment(leg.lower, knee, foot);
  }
  function stepAgentMovement(agent, dt, elapsed) {
    const group = agent.vis.group, brain = agent.brain;
    group.rotation.y += brain.turnRate * dt;
    const speed = BASE_SPEED * brain.speedFactor;
    group.position.x += Math.sin(group.rotation.y) * speed * dt;
    group.position.z += Math.cos(group.rotation.y) * speed * dt;
    const distance = Math.hypot(group.position.x, group.position.z);
    if (distance > ARENA_R - .55) { const scale = (ARENA_R - .55) / distance; group.position.x *= scale; group.position.z *= scale; }
    agent.gaitPhase += dt * GAIT_FREQ * (.3 + brain.speedFactor * .9);
    group.position.y = .03 + Math.abs(Math.sin(agent.gaitPhase * 2)) * .014;
    for (const leg of agent.vis.legs) {
      const phase = agent.gaitPhase + (leg.group === 'A' ? 0 : Math.PI);
      const lift = Math.max(0, Math.sin(phase)) * .16;
      const stride = Math.cos(phase) * .18;
      agent.hipWorld.set(leg.def.x, .27, leg.def.z);
      agent.footBase.set(leg.def.x * 1.7, .02 + lift, leg.def.z + stride * .6);
      agent.footWorld.copy(agent.footBase);
      setLegSpan(leg, agent.hipWorld, agent.footWorld);
    }
    const flap = Math.sin(elapsed * 12 + (agent.id === 'BIO1' ? 0 : 1.7)) * .22 + .28;
    agent.vis.wingL.rotation.z = flap; agent.vis.wingR.rotation.z = -flap;
    agent.vis.eyes.forEach((eye, index) => { eye.scale.setScalar(1 + Math.sin(elapsed * 2.2 + index) * .05); });
  }

  function checkFoodConsumption(agent) {
    const position = agent.vis.group.position;
    for (const item of food) {
      if (!item.alive || Math.hypot(item.x - position.x, item.z - position.z) >= item.r + .3) continue;
      item.alive = false; item.mesh.visible = false; agent.brain.eat();
      setTimeout(() => respawnFood(item), 3000 + rand() * 4000);
    }
  }

  // ---------------- camera ----------------
  let followId = 'BIO1', camAngle = .6, camElev = .5, camDist = 6.2;
  let dragging = false, lastX = 0, lastY = 0, pinchStartDist = null, pinchStartCamDist = camDist;
  function followedAgent() { return followId === 'BIO1' ? bio1 : bio2; }
  function screenToDelta(dx, dy) { camAngle -= dx * .006; camElev = Math.max(.15, Math.min(1.4, camElev + dy * .006)); }
  renderer.domElement.addEventListener('pointerdown', (event) => { dragging = true; lastX = event.clientX; lastY = event.clientY; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (event) => { if (dragging) { screenToDelta(event.clientX - lastX, event.clientY - lastY); lastX = event.clientX; lastY = event.clientY; } });
  renderer.domElement.addEventListener('wheel', (event) => { camDist = Math.max(2.2, Math.min(18, camDist + event.deltaY * .004)); }, { passive: true });
  renderer.domElement.addEventListener('touchstart', (event) => {
    if (event.touches.length === 1) { dragging = true; lastX = event.touches[0].clientX; lastY = event.touches[0].clientY; }
    if (event.touches.length === 2) { dragging = false; pinchStartDist = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY); pinchStartCamDist = camDist; }
  }, { passive: true });
  renderer.domElement.addEventListener('touchmove', (event) => {
    if (event.touches.length === 1 && dragging) { screenToDelta(event.touches[0].clientX - lastX, event.touches[0].clientY - lastY); lastX = event.touches[0].clientX; lastY = event.touches[0].clientY; }
    if (event.touches.length === 2 && pinchStartDist) { const distance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY); camDist = Math.max(2.2, Math.min(18, pinchStartCamDist * pinchStartDist / Math.max(distance, 1))); }
  }, { passive: true });
  renderer.domElement.addEventListener('touchend', (event) => { if (!event.touches.length) { dragging = false; pinchStartDist = null; } }, { passive: true });
  function updateCamera() {
    const target = followedAgent().vis.group.position.clone().add(new THREE.Vector3(0, .35, 0));
    camera.position.set(target.x + Math.sin(camAngle) * camDist * Math.cos(camElev), target.y + camDist * Math.sin(camElev), target.z + Math.cos(camAngle) * camDist * Math.cos(camElev));
    camera.lookAt(target);
  }

  // ---------------- interface ----------------
  const termBody = document.getElementById('term-body');
  const JARGON = {
    wander: ['baseline spontaneous firing, no dominant drive', 'central complex heading integrator idle-drifting'],
    forage: ['chemotactic relay engaged — odor gradient ascending', 'foraging descending pathway active'],
    'avoid-obstacle': ['lateral inhibition sharpening — obstacle contour resolved', 'avoidance steering vector engaged'],
    escape: ['giant-fiber-style escape triggered — jump reflex fired', 'high-gain startle burst on descending pathway'],
    investigate: ['conspecific detected — approach vector engaged', 'social relay bias positive, orienting toward BIO'],
    'avoid-agent': ['conspecific detected — withdrawal vector engaged', 'social relay bias negative, disengaging'],
    'contest-resource': ['overlapping resource claim detected', 'competitive approach — resource contest state'],
    pause: ['locomotor pause — spontaneous state sampled', 'heading reset — circuit activity temporarily quiet']
  };
  function clockStamp() { return new Date().toISOString().substr(11, 8); }
  function pushLog(agentId, mode, extra) {
    const line = document.createElement('div'); line.className = 'line ' + (agentId === 'BIO1' ? 'b1' : 'b2');
    const phrases = JARGON[mode] || JARGON.wander;
    line.textContent = '[' + clockStamp() + '] ' + agentId + ' :: ' + phrases[Math.floor(rand() * phrases.length)] + ' ' + (extra || '');
    termBody.appendChild(line); while (termBody.children.length > 60) termBody.removeChild(termBody.firstChild); termBody.scrollTop = termBody.scrollHeight;
  }
  function sysLog(message) {
    const line = document.createElement('div'); line.className = 'line sys'; line.textContent = '[' + clockStamp() + '] SYS :: ' + message;
    termBody.appendChild(line); termBody.scrollTop = termBody.scrollHeight;
  }
  const specimenLabel = document.getElementById('specimen-label');
  const specimenMode = document.getElementById('specimen-mode');
  const specimenSwatch = document.getElementById('specimen-swatch');
  const modeCopy = { wander: 'baseline spontaneous firing', forage: 'chemotactic relay engaged', 'avoid-obstacle': 'lateral inhibition resolving', escape: 'escape pathway active', investigate: 'conspecific investigation', 'avoid-agent': 'social withdrawal', 'contest-resource': 'resource contest', pause: 'locomotor pause / reorientation' };
  function updateTelemetry(agent) {
    const brain = agent.brain;
    specimenLabel.textContent = agent.id;
    specimenMode.textContent = modeCopy[brain.mode] || brain.mode;
    specimenSwatch.style.background = agent.id === 'BIO1' ? 'var(--bio1)' : 'var(--bio2)';
    specimenSwatch.style.boxShadow = '0 0 14px ' + (agent.id === 'BIO1' ? 'var(--bio1)' : 'var(--bio2)');
    document.getElementById('telemetry-hunger').textContent = brain.hunger.toFixed(2);
    document.getElementById('telemetry-valence').textContent = (brain.socialValence >= 0 ? '+' : '') + brain.socialValence.toFixed(2);
    document.getElementById('telemetry-escapes').textContent = String(brain.escapeEvents);
  }
  const scanRenderer = initScanRenderer(document.getElementById('scan-canvas'));
  window.addEventListener('resize', () => scanRenderer.resize());
  const enterButton = document.getElementById('btn-enter');
  const bootSteps = Array.from(document.querySelectorAll('.boot-step'));
  const bootSequence = [
    { key: 'server', delay: 550 },
    { key: 'astra', delay: 1100 },
    { key: 'relay', delay: 1650 },
    { key: 'specimens', delay: 2200 }
  ];
  bootSequence.forEach((step, index) => {
    window.setTimeout(() => {
      const current = document.querySelector('[data-boot-step="' + step.key + '"]');
      if (current) {
        current.classList.remove('active');
        current.classList.add('done');
        current.querySelector('small').textContent = 'online';
      }
      const next = bootSteps[index + 1];
      if (next) {
        next.classList.add('active');
        next.querySelector('small').textContent = 'connecting';
      } else {
        enterButton.disabled = false;
        enterButton.textContent = 'Enter observatory ↗';
        enterButton.classList.add('ready');
      }
    }, step.delay);
  });
  enterButton.addEventListener('click', () => {
    simulationStarted = true;
    document.body.classList.add('entered');
    scanRenderer.resize();
    sysLog('observatory initialized — two independent circuit instances online');
  });
  function setFollow(num, button) { followId = 'BIO' + num; document.querySelectorAll('.follow-btn').forEach((item) => item.classList.remove('active')); button.classList.add('active'); }
  document.getElementById('btn-follow-1').addEventListener('click', (event) => setFollow('1', event.currentTarget));
  document.getElementById('btn-follow-2').addEventListener('click', (event) => setFollow('2', event.currentTarget));
  function wirePanelToggle(buttonId, panelId) {
    const button = document.getElementById(buttonId), panel = document.getElementById(panelId);
    button.addEventListener('click', () => { const hidden = panel.classList.toggle('hidden'); button.classList.toggle('active', !hidden); });
  }
  wirePanelToggle('btn-toggle-scan', 'scan-panel'); wirePanelToggle('btn-toggle-term', 'term-panel'); wirePanelToggle('btn-toggle-info', 'info-panel');
  document.querySelectorAll('.close-btn').forEach((button) => button.addEventListener('click', () => {
    const id = button.getAttribute('data-close'); document.getElementById(id).classList.add('hidden');
    const toggle = document.getElementById({ 'scan-panel': 'btn-toggle-scan', 'term-panel': 'btn-toggle-term', 'info-panel': 'btn-toggle-info' }[id]);
    if (toggle) toggle.classList.remove('active');
  }));
  document.getElementById('btn-obstacle').addEventListener('click', () => { const point = randomArenaPoint(2); addObstacle(point.x, point.z); });
  document.getElementById('btn-food').addEventListener('click', () => { const point = randomArenaPoint(2); addFood(point.x, point.z); });
  document.getElementById('btn-reset').addEventListener('click', () => {
    obstacles.length = 0; obstacleGroup.clear(); seedObstacles(8);
    food.length = 0; foodGroup.clear(); seedFood(10);
    bio1.vis.group.position.set(-4, .02, 3); bio1.vis.group.rotation.y = 0;
    bio2.vis.group.position.set(4, .02, -3); bio2.vis.group.rotation.y = Math.PI;
    agents.forEach((agent) => { agent.brain = new FlyBrain.Brain(agent.id === 'BIO1' ? 111 : 222, agent.id); });
    sysLog('field reset — both circuit instances reinitialized');
  });
  window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  // ---------------- main observation loop ----------------
  const clock = new THREE.Clock();
  let logTimer = 0, runtime = 0, simulationStarted = false;
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), .05);
    if (simulationStarted) {
      runtime += dt;
      for (const agent of agents) agent.brain.otherFoodDrive = otherOf(agent).brain.foodDrive;
      for (const agent of agents) {
        const position = agent.vis.group.position, heading = agent.vis.group.rotation.y, other = otherOf(agent);
        const obstacleSignals = computeConeSensors(position, heading, obstacles);
        const boundarySignals = boundarySensor(position, heading);
        for (let i = 0; i < N_SENS; i++) agent.brain.obstacleSensors[i] = Math.max(obstacleSignals[i], boundarySignals[i]);
        agent.brain.foodSensors.set(computeConeSensors(position, heading, food.filter((item) => item.alive)));
        agent.brain.otherSensors.set(computeConeSensors(position, heading, [{ x: other.vis.group.position.x, z: other.vis.group.position.z, r: .4 }]));
        const telemetry = agent.brain.step(dt);
        stepAgentMovement(agent, dt, runtime); checkFoodConsumption(agent);
        logTimer -= dt;
        if (telemetry.escape || (logTimer <= 0 && rand() < .5)) pushLog(agent.id, telemetry.mode, '[hunger ' + telemetry.hunger.toFixed(2) + ' valence ' + telemetry.socialValence.toFixed(2) + ']');
      }
      if (logTimer <= 0) logTimer = 1.4 + rand() * 1.6;
      food.forEach((item) => { if (item.alive) { item.mesh.rotation.y += dt * .8; item.mesh.position.y = .23 + Math.sin(runtime * 1.6 + item.phase) * .035; } });
      field.rotation.y = Math.sin(runtime * .025) * .002;
      fieldLight.intensity = .72 + Math.sin(runtime * .7) * .08;
    }
    updateCamera(); updateTelemetry(followedAgent()); scanRenderer.update(dt); renderer.render(scene, camera);
    if (simulationStarted) document.getElementById('runtime-time').textContent = new Date(runtime * 1000).toISOString().substr(11, 8);
  }
  animate();
})();