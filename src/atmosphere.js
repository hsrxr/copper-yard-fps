/* Sky and sparse volumetric cloud patches.
 * This file deliberately uses the host's THREE r160 instance only. */
function createAtmosphere(ctx) {
  const { THREE, camera, uniforms } = ctx;
  const group = new THREE.Group();
  group.name = 'Atmosphere';
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: uniforms.sunDir,
      uSunColor: uniforms.sunColor,
      uSkyTop: uniforms.skyTop,
      uSkyBottom: uniforms.skyBottom
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vWorld;
      uniform vec3 uSunDir, uSunColor, uSkyTop, uSkyBottom;
      void main() {
        vec3 ray = normalize(vWorld - cameraPosition);
        float height = smoothstep(-0.08, 0.82, ray.y);
        vec3 color = mix(uSkyBottom, uSkyTop, pow(height, 0.65));
        float mu = max(dot(ray, uSunDir), 0.0);
        float sunlight = smoothstep(-0.10, 0.05, uSunDir.y);
        float haze = exp(-abs(ray.y) * 10.0) * pow(mu, 5.0);
        color += uSunColor * haze * 0.18 * sunlight;
        color += uSunColor * pow(mu, 64.0) * 0.19 * sunlight;
        float disk = smoothstep(cos(0.014), cos(0.010), mu);
        color += uSunColor * disk * 2.5 * sunlight;
        color = mix(color, uSkyBottom * 0.79, smoothstep(0.08, 0.5, -ray.y));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(930, 40, 24), skyMaterial);
  sky.name = 'Procedural sunrise sky';
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  group.add(sky);

  const cloudMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.time,
      uSunDir: uniforms.sunDir,
      uSunColor: uniforms.sunColor,
      uSkyBottom: uniforms.skyBottom
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vWorld;
      uniform float uTime;
      uniform vec3 uSunDir, uSunColor, uSkyBottom;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.11, 0.37, 0.73));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                       mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                       mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) {
        float n = noise(p) * 0.58;
        p = p * 2.07 + vec3(8.1, 3.7, 5.2);
        n += noise(p) * 0.28;
        p = p * 2.03 + vec3(2.4, 7.9, 1.5);
        return n + noise(p) * 0.14;
      }
      float puff(vec3 p, vec3 center, vec3 radius) {
        return 1.0 - length((p - center) / radius);
      }
      float density(vec3 p) {
        p.x -= sin(uTime * 0.008) * 18.0;
        p.z -= uTime * 0.10;
        // Separate ellipsoid clusters leave broad areas of clean blue sky.
        float shape = puff(p, vec3(-310,203,-210), vec3(120,27,65));
        shape = max(shape, puff(p, vec3(-278,221,-210), vec3(51,34,47)));
        shape = max(shape, puff(p, vec3(-350,213,-222), vec3(58,32,45)));
        shape = max(shape, puff(p, vec3(135,217,-320), vec3(145,28,66)));
        shape = max(shape, puff(p, vec3(112,234,-325), vec3(57,36,48)));
        shape = max(shape, puff(p, vec3(190,226,-306), vec3(62,34,49)));
        shape = max(shape, puff(p, vec3(380,198,15), vec3(112,25,65)));
        shape = max(shape, puff(p, vec3(359,219,20), vec3(49,34,45)));
        shape = max(shape, puff(p, vec3(-205,218,250), vec3(137,28,70)));
        shape = max(shape, puff(p, vec3(-228,237,252), vec3(55,33,49)));
        if (shape < -0.30) return 0.0;
        float detail = fbm(p * 0.043) - 0.47;
        return smoothstep(-0.09, 0.20, shape + detail * 0.40) * 0.075;
      }
      void main() {
        vec3 ray = normalize(vWorld - cameraPosition);
        if (abs(ray.y) < 0.003) discard;
        float t0 = (170.0 - cameraPosition.y) / ray.y;
        float t1 = (274.0 - cameraPosition.y) / ray.y;
        float entry = max(min(t0, t1), 0.0);
        float leave = min(max(t0, t1), 1500.0);
        if (leave <= entry) discard;
        float stride = (leave - entry) / 7.0;
        float alpha = 0.0;
        vec3 color = vec3(0.0);
        for (int i = 0; i < 7; i++) {
          vec3 p = cameraPosition + ray * (entry + (float(i) + 0.5) * stride);
          float d = density(p);
          float sampleAlpha = 1.0 - exp(-d * min(stride, 45.0));
          float upper = smoothstep(184.0, 257.0, p.y);
          float shade = 0.72 + 0.28 * upper;
          float rim = pow(max(dot(ray, uSunDir), 0.0), 5.0);
          vec3 lit = mix(uSkyBottom * 0.83, vec3(1.0,0.97,0.91), shade);
          lit *= 0.55 + 0.45 * smoothstep(-0.10, 0.28, uSunDir.y);
          lit += uSunColor * rim * 0.18;
          color += (1.0 - alpha) * sampleAlpha * lit;
          alpha += (1.0 - alpha) * sampleAlpha;
        }
        if (alpha < 0.008) discard;
        float distanceFade = 1.0 - smoothstep(850.0, 1500.0, entry);
        gl_FragColor = vec4(color / max(alpha, 0.001), alpha * distanceFade * 0.88);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest: true
  });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(1700, 1700), cloudMaterial);
  clouds.rotation.x = -Math.PI / 2;
  clouds.position.set(0, 222, 0);
  clouds.name = 'Sparse volumetric cumulus patches';
  clouds.renderOrder = -900;
  clouds.frustumCulled = false;
  group.add(clouds);

  const nightTop = new THREE.Color('#12233e');
  const dayTop = new THREE.Color('#70b5db');
  const nightBottom = new THREE.Color('#526379');
  const dayBottom = new THREE.Color('#c7e0df');
  const peach = new THREE.Color('#f2bd99');
  const sunLow = new THREE.Color('#ffb574');
  const sunHigh = new THREE.Color('#fff2cf');
  let day = 0.315;
  function applyDay() {
    const angle = (day - 0.25) * Math.PI * 2;
    uniforms.sunDir.value.set(Math.cos(angle) * 0.80, Math.sin(angle), -0.50).normalize();
    const elevation = uniforms.sunDir.value.y;
    const light = THREE.MathUtils.smoothstep(elevation, -0.12, 0.48);
    const warm = Math.exp(-Math.abs(elevation) * 3.3) * light;
    uniforms.skyTop.value.copy(nightTop).lerp(dayTop, light);
    uniforms.skyBottom.value.copy(nightBottom).lerp(dayBottom, light).lerp(peach, warm * 0.78);
    uniforms.sunColor.value.copy(sunLow).lerp(sunHigh, THREE.MathUtils.smoothstep(elevation, 0.04, 0.8));
    uniforms.sunColor.value.multiplyScalar(THREE.MathUtils.smoothstep(elevation, -0.16, 0.12));
  }
  applyDay();
  return {
    group,
    update(dt) {
      day = (day + Math.min(Math.max(dt, 0), 0.1) / 1800) % 1;
      applyDay();
      sky.position.copy(camera.position);
    },
    setDay(value) {
      day = THREE.MathUtils.clamp(value, 0, 1);
      applyDay();
    },
    stats() { return { day, cloudSteps: 7, cloudPatches: 4 }; }
  };
}
