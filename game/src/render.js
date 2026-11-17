// The renderer: a small original WebGL engine — one shader, flat-shaded boxes
// with a sun, warm fog and a gradient sky. The city is baked once into a static
// buffer; cars, people, the player and effects are rebuilt into a dynamic buffer
// every frame. No library, no textures, no network.

import { PALETTE } from './config.js';

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uProj;
uniform mat4 uView;
varying vec3 vColor;
varying vec3 vNormal;
varying float vDepth;
void main() {
  vec4 eye = uView * vec4(aPos, 1.0);
  gl_Position = uProj * eye;
  vColor = aColor;
  vNormal = aNormal;
  vDepth = -eye.z;
}`;

const FRAG = `
precision mediump float;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vColor;
varying vec3 vNormal;
varying float vDepth;
void main() {
  float diff = max(dot(normalize(vNormal), normalize(uSunDir)), 0.0);
  vec3 col = vColor * (uAmbient + uSunColor * diff);
  float f = clamp((vDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
}`;

const SKY_VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const SKY_FRAG = `
precision mediump float;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
varying vec2 vUv;
void main() {
  float h = clamp(vUv.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(h, 0.75));
  vec2 sunPos = vec2(uSunDir.x, uSunDir.z);
  float d = distance(vUv * vec2(1.6, 1.0), sunPos * vec2(1.6, 1.0) * 0.55 + vec2(0.0, 0.25));
  col += vec3(1.0, 0.75, 0.45) * pow(max(0.0, 1.0 - d), 6.0) * 0.9;
  gl_FragColor = vec4(col, 1.0);
}`;

// Box faces: normal, and the four corners (x, y, z) in unit-cube space.
const FACES = [
  { n: [0, 1, 0], c: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, -1, 0], c: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]] },
  { n: [1, 0, 0], c: [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]] },
  { n: [-1, 0, 0], c: [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]] },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

function matPerspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function matLookAt(eye, target, up) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  ]);
}

function compile(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(shader));
  }
  return shader;
}

function program(gl, vertSrc, fragSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('program: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

const MAX_DYNAMIC_BOXES = 420;

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL is not available in this browser');
  const prog = program(gl, VERT, FRAG);
  const skyProg = program(gl, SKY_VERT, SKY_FRAG);

  const loc = {
    proj: gl.getUniformLocation(prog, 'uProj'),
    view: gl.getUniformLocation(prog, 'uView'),
    sunDir: gl.getUniformLocation(prog, 'uSunDir'),
    sunColor: gl.getUniformLocation(prog, 'uSunColor'),
    ambient: gl.getUniformLocation(prog, 'uAmbient'),
    fogColor: gl.getUniformLocation(prog, 'uFogColor'),
    fogNear: gl.getUniformLocation(prog, 'uFogNear'),
    fogFar: gl.getUniformLocation(prog, 'uFogFar'),
  };
  const skyLoc = {
    top: gl.getUniformLocation(skyProg, 'uTop'),
    horizon: gl.getUniformLocation(skyProg, 'uHorizon'),
    sunDir: gl.getUniformLocation(skyProg, 'uSunDir'),
  };
  const aPos = gl.getAttribLocation(prog, 'aPos');
  const aNormal = gl.getAttribLocation(prog, 'aNormal');
  const aColor = gl.getAttribLocation(prog, 'aColor');
  const skyPos = gl.getAttribLocation(skyProg, 'aPos');

  // Static city buffer, filled by setStatic().
  const staticBuf = gl.createBuffer();
  let staticCount = 0;
  // Dynamic buffer, rebuilt every frame.
  const dynBuf = gl.createBuffer();
  const dynPos = new Float32Array(MAX_DYNAMIC_BOXES * 24 * 3);
  const dynNor = new Float32Array(MAX_DYNAMIC_BOXES * 24 * 3);
  const dynCol = new Float32Array(MAX_DYNAMIC_BOXES * 24 * 3);
  const dynIdx = new Uint16Array(MAX_DYNAMIC_BOXES * 36);
  for (let b = 0; b < MAX_DYNAMIC_BOXES; b += 1) {
    const v = b * 24;
    const i = b * 36;
    for (let f = 0; f < 6; f += 1) {
      const o = i + f * 6;
      dynIdx[o] = v + f * 4;
      dynIdx[o + 1] = v + f * 4 + 1;
      dynIdx[o + 2] = v + f * 4 + 2;
      dynIdx[o + 3] = v + f * 4;
      dynIdx[o + 4] = v + f * 4 + 2;
      dynIdx[o + 5] = v + f * 4 + 3;
    }
  }
  const dynIdxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, dynIdxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, dynIdx, gl.STATIC_DRAW);
  const staticIdxBuf = gl.createBuffer();

  // Sky fullscreen triangle.
  const skyBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  function pushBox(pos, nor, col, count, b) {
    const c = Math.cos(b.rotY || 0);
    const s = Math.sin(b.rotY || 0);
    const hx = b.sx / 2;
    const hy = b.sy / 2;
    const hz = b.sz / 2;
    let v = count * 24;
    for (let f = 0; f < 6; f += 1) {
      const face = FACES[f];
      const rn = [
        face.n[0] * c + face.n[2] * s,
        face.n[1],
        -face.n[0] * s + face.n[2] * c,
      ];
      for (let k = 0; k < 4; k += 1) {
        const p = face.c[k];
        const lx = p[0] * hx;
        const ly = p[1] * hy;
        const lz = p[2] * hz;
        pos[v * 3] = b.cx + lx * c + lz * s;
        pos[v * 3 + 1] = b.cy + ly;
        pos[v * 3 + 2] = b.cz - lx * s + lz * c;
        nor[v * 3] = rn[0];
        nor[v * 3 + 1] = rn[1];
        nor[v * 3 + 2] = rn[2];
        col[v * 3] = b.color[0];
        col[v * 3 + 1] = b.color[1];
        col[v * 3 + 2] = b.color[2];
        v += 1;
      }
    }
    return count + 1;
  }

  function setStatic(boxes) {
    const pos = new Float32Array(boxes.length * 24 * 3);
    const nor = new Float32Array(boxes.length * 24 * 3);
    const col = new Float32Array(boxes.length * 24 * 3);
    const idx = new Uint16Array(boxes.length * 36);
    let count = 0;
    for (let i = 0; i < boxes.length; i += 1) count = pushBox(pos, nor, col, count, boxes[i]);
    for (let b = 0; b < boxes.length; b += 1) {
      const v = b * 24;
      const i = b * 36;
      for (let f = 0; f < 6; f += 1) {
        const o = i + f * 6;
        idx[o] = v + f * 4;
        idx[o + 1] = v + f * 4 + 1;
        idx[o + 2] = v + f * 4 + 2;
        idx[o + 3] = v + f * 4;
        idx[o + 4] = v + f * 4 + 2;
        idx[o + 5] = v + f * 4 + 3;
      }
    }
    staticCount = boxes.length * 36;
    gl.bindBuffer(gl.ARRAY_BUFFER, staticBuf);
    const interleaved = new Float32Array(boxes.length * 24 * 9);
    for (let v = 0; v < boxes.length * 24; v += 1) {
      for (let k = 0; k < 3; k += 1) {
        interleaved[v * 9 + k] = pos[v * 3 + k];
        interleaved[v * 9 + 3 + k] = nor[v * 3 + k];
        interleaved[v * 9 + 6 + k] = col[v * 3 + k];
      }
    }
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, staticIdxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * ratio);
    const h = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function bindAttribs(buffer, stride) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNormal);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, stride, 12);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 24);
  }

  /**
   * Draw one frame. `camera` is {eye:[x,y,z], target:[x,y,z]}; `dynamic` is the
   * list of moving boxes (cars, people, player, effects) for this frame.
   */
  function draw(camera, dynamic) {
    resize();
    gl.clearColor(0.98, 0.76, 0.55, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    // Sky gradient + sun glow.
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(skyProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.enableVertexAttribArray(skyPos);
    gl.vertexAttribPointer(skyPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(skyLoc.top, PALETTE.skyTop);
    gl.uniform3fv(skyLoc.horizon, PALETTE.skyHorizon);
    gl.uniform3fv(skyLoc.sunDir, PALETTE.sunDir);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(skyPos);
    gl.enable(gl.DEPTH_TEST);

    const proj = matPerspective(1.15, canvas.width / canvas.height, 0.1, 900);
    const view = matLookAt(camera.eye, camera.target, [0, 1, 0]);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(loc.proj, false, proj);
    gl.uniformMatrix4fv(loc.view, false, view);
    gl.uniform3fv(loc.sunDir, PALETTE.sunDir);
    gl.uniform3fv(loc.sunColor, PALETTE.sunColor);
    gl.uniform3fv(loc.ambient, PALETTE.ambient);
    gl.uniform3fv(loc.fogColor, PALETTE.fog);
    gl.uniform1f(loc.fogNear, 90);
    gl.uniform1f(loc.fogFar, 420);

    // Static city.
    if (staticCount > 0) {
      bindAttribs(staticBuf, 36);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, staticIdxBuf);
      gl.drawElements(gl.TRIANGLES, staticCount, gl.UNSIGNED_SHORT, 0);
    }

    // Dynamic boxes, rebuilt into the preallocated arrays.
    let count = 0;
    const n = Math.min(dynamic.length, MAX_DYNAMIC_BOXES);
    for (let i = 0; i < n; i += 1) count = pushBox(dynPos, dynNor, dynCol, count, dynamic[i]);
    if (count > 0) {
      const interleaved = new Float32Array(count * 24 * 9);
      for (let v = 0; v < count * 24; v += 1) {
        for (let k = 0; k < 3; k += 1) {
          interleaved[v * 9 + k] = dynPos[v * 3 + k];
          interleaved[v * 9 + 3 + k] = dynNor[v * 3 + k];
          interleaved[v * 9 + 6 + k] = dynCol[v * 3 + k];
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
      gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.DYNAMIC_DRAW);
      bindAttribs(dynBuf, 36);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, dynIdxBuf);
      gl.drawElements(gl.TRIANGLES, count * 36, gl.UNSIGNED_SHORT, 0);
    }
  }

  window.addEventListener('resize', resize);
  return { draw, setStatic };
}
