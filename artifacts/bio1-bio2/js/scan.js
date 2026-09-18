// scan.js — procedural 3D connectome-style reconstruction.
// The display is intentionally labeled as generated representation, not raw EM data.
function initScanRenderer(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050b0c);
  scene.fog = new THREE.FogExp2(0x050b0c, 0.075);
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 50);
  camera.position.set(0.1, 0.2, 5.8);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  scene.add(new THREE.AmbientLight(0x1b332c, 1.25));
  const key = new THREE.PointLight(0xa4f17b, 1.45, 18);
  key.position.set(2.5, 2.2, 4);
  scene.add(key);
  const rim = new THREE.PointLight(0xf28bc8, 1.0, 16);
  rim.position.set(-3, -1.8, -3);
  scene.add(rim);

  const group = new THREE.Group();
  group.rotation.z = -0.1;
  scene.add(group);
  const rand = FlyBrain.mulberry32(20260918);
  const nodes = [];
  const segments = [];

  function addSegment(a, b, color, opacity, width) {
    const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const line = new THREE.Line(geometry, material);
    group.add(line);
    segments.push({ line, phase: rand() * Math.PI * 2, base: opacity });
  }

  function branch(origin, direction, depth, maxDepth, lobe) {
    nodes.push({ point: origin.clone(), lobe, depth });
    if (depth >= maxDepth) return;
    const children = depth < 2 ? 3 : rand() > 0.48 ? 2 : 1;
    for (let child = 0; child < children; child++) {
      const axis = new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5).normalize();
      const nextDirection = direction.clone().applyAxisAngle(axis, .4 + rand() * .65).normalize();
      const length = Math.max(.16, (1.08 - depth * .16) * (.65 + rand() * .52));
      const next = origin.clone().add(nextDirection.multiplyScalar(length));
      addSegment(origin, next, lobe === 0 ? 0xa4f17b : lobe === 1 ? 0x73d9eb : 0xf28bc8, .24 - depth * .018, 1);
      branch(next, nextDirection, depth + 1, maxDepth, lobe);
    }
  }

  // Three overlapping anatomical regions give the generated volume a layered organization.
  const lobes = [
    { center: new THREE.Vector3(-.68, .05, .12), scale: .76, color: 0x73d9eb },
    { center: new THREE.Vector3(.62, .28, .05), scale: .9, color: 0xa4f17b },
    { center: new THREE.Vector3(0, -.55, -.16), scale: .62, color: 0xf28bc8 }
  ];
  lobes.forEach((lobe, index) => {
    for (let seed = 0; seed < 4; seed++) {
      const direction = new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5).normalize();
      const start = lobe.center.clone().add(new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5).multiplyScalar(.18));
      branch(start, direction, 0, 4, index);
    }
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(lobe.scale, 22, 14),
      new THREE.MeshBasicMaterial({ color: lobe.color, transparent: true, opacity: .025, wireframe: true })
    );
    shell.position.copy(lobe.center);
    shell.scale.set(1.05, .72, .72);
    group.add(shell);
  });

  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext('2d');
  const gradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.25, 'rgba(255,255,255,.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  glowContext.fillStyle = gradient;
  glowContext.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const nodeGroups = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  nodeGroups.forEach((nodeGroup) => group.add(nodeGroup));
  nodes.forEach((node, index) => {
    const color = node.lobe === 2 || index % 7 === 0 ? 0xf28bc8 : node.lobe === 1 ? 0xa4f17b : 0x73d9eb;
    const material = new THREE.SpriteMaterial({
      map: glowTexture, color, transparent: true, opacity: .72, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    const size = .035 + rand() * (.05 + Math.max(0, 4 - node.depth) * .008);
    sprite.scale.set(size, size, size);
    sprite.position.copy(node.point);
    nodeGroups[node.lobe].add(sprite);
  });

  // A restrained axial tract makes depth readable without turning the panel into a particle cloud.
  for (let i = 0; i < 7; i++) {
    const y = -.8 + i * .26;
    addSegment(new THREE.Vector3(-1.2, y, -.45), new THREE.Vector3(1.15, y + .1, .38), 0xd7eee2, .13, 1);
  }
  const bounds = new THREE.Box3().setFromObject(group);
  group.position.sub(bounds.getCenter(new THREE.Vector3()));
  group.scale.setScalar(.72);

  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  let elapsed = 0;
  function update(dt) {
    elapsed += dt;
    group.rotation.y += dt * .14;
    group.rotation.x = Math.sin(elapsed * .17) * .07;
    group.position.y = Math.sin(elapsed * .55) * .035;
    segments.forEach((segment) => {
      segment.line.material.opacity = segment.base * (.75 + Math.sin(elapsed * 1.4 + segment.phase) * .2);
    });
    key.intensity = 1.35 + Math.sin(elapsed * 1.8) * .18;
    renderer.render(scene, camera);
  }
  resize();
  return { update, resize };
}