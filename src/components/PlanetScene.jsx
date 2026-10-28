import { useEffect, useRef } from 'react'

const ASSET_BASE_URL = 'https://api.getlayers.ai/storage/v1/object/public/public/assets/ascend-d9857ad1f2'
const PLANET_GLB = `${ASSET_BASE_URL}/planet.glb`
const PLANET_LIGHTS_GLB = `${ASSET_BASE_URL}/planet-lights.glb`
const PLANET_CLOUDS_PNG = `${ASSET_BASE_URL}/planet-clouds.png`

const CONFIG = {
  rimColor: '#c1faff', rimPower: 2.4, nightLights: 10, terrainDepth: 0.33, terrainShade: 1.3,
  oceanGlint: 0.45, oceanDeep: 0.12, oceanFlow: 3, oceanFlowSpeed: 0.8, oceanFlowScale: 2.1,
  planetRadius: 1.95, spin: 0, initRotation: -1.07,
  tilt: 0.37, autoRotate: 0,
  cloud1Height: 1.005, cloud1Opacity: 0.3, cloud1Spin: 0.06,
  cloud2Height: 1.03, cloud2Opacity: 0.18, cloud2Spin: 0.14,
  cloud3Height: 1.075, cloud3Opacity: 0.1, cloud3Spin: 0.1,
  bgColor: '#040a1e',
  atmoColor: '#9fc4ff', atmoCount: 320, atmoSize: 22, atmoSpeed: 0,
  starColor: '#cfe0ff', starCount: 1400, starSize: 1.6, starFlicker: 0,
  markerColor: '#ffd27a', markerCount: 60, markerSize: 16, markerSpeed: 0,
}

const LAYERS = { NONE: 0, TORUS_SCENE: 1, BLOOM_SCENE: 2, ENTIRE_SCENE: 3 }
const STOPS_X = [{ p: 0, v: 0 }, { p: 0.32, v: -3.1 }, { p: 0.64, v: 3.2 }, { p: 1, v: -3.1 }]
const STOPS_Y = [{ p: 0, v: -1.8 }, { p: 0.32, v: 0.55 }, { p: 0.64, v: 0.45 }, { p: 1, v: 0.15 }]
const STOPS_S = [{ p: 0, v: 0.9 }, { p: 0.32, v: 1.0 }, { p: 0.64, v: 0.92 }, { p: 1, v: 1.12 }]
const NIGHT_STOPS = [{ p: 0, v: 1 }, { p: 0.32, v: 0 }, { p: 1, v: 0 }]

const SNOISE = `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
 const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
 vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
 vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;
 vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
 vec3 x1=x0-i1+1.0*C.xxx;vec3 x2=x0-i2+2.0*C.xxx;vec3 x3=x0-1.0+3.0*C.xxx;
 i=mod(i,289.0);
 vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
 float n_=1.0/7.0;vec3 ns=n_*D.wyz-D.xzx;
 vec4 j=p-49.0*floor(p*ns.z*ns.z);
 vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
 vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
 vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
 vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
 vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
 vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
 vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
 p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
 vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
 return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`

function hexToVec3(THREE, color) {
  return new THREE.Vector3(
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
  )
}

function sample(stops, p) {
  for (let index = 0; index < stops.length - 1; index += 1) {
    const start = stops[index]
    const end = stops[index + 1]
    if (p > end.p) continue
    const t = Math.max(0, Math.min(1, (p - start.p) / (end.p - start.p)))
    const smooth = t * t * (3 - 2 * t)
    return start.v + (end.v - start.v) * smooth
  }
  return stops[stops.length - 1].v
}

const FinalPass = {
  uniforms: {
    tDiffuse: { value: null }, torusTexture: { value: null },
    bloomTexture: { value: null }, haloTexture: { value: null },
    uBg: { value: null },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform sampler2D bloomTexture; uniform sampler2D torusTexture; uniform sampler2D haloTexture;
    uniform vec3 uBg;
    varying vec2 vUv;
    void main(){vec3 halo=texture2D(haloTexture,vUv).xyz;gl_FragColor=vec4(uBg+texture2D(bloomTexture,vUv).xyz+texture2D(torusTexture,vUv).xyz+texture2D(tDiffuse,vUv).xyz+halo,1.);}`,
}

function addStars(THREE, scene, resolution) {
  const positions = new Float32Array(CONFIG.starCount * 3)
  const seeds = new Float32Array(CONFIG.starCount)
  const brightness = new Float32Array(CONFIG.starCount)
  for (let index = 0; index < CONFIG.starCount; index += 1) {
    const z = Math.random() * 2 - 1
    const angle = Math.random() * Math.PI * 2
    const radius = Math.sqrt(1 - z * z) * 90
    positions.set([radius * Math.cos(angle), radius * Math.sin(angle), z * 90], index * 3)
    seeds[index] = Math.random() * Math.PI * 2
    brightness[index] = 0.35 + Math.random() * 0.65
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1))
  geometry.setAttribute('bright', new THREE.BufferAttribute(brightness, 1))
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: CONFIG.starSize }, uFlicker: { value: CONFIG.starFlicker }, uColor: { value: hexToVec3(THREE, CONFIG.starColor) }, uRes: { value: resolution } },
    vertexShader: `attribute float seed;attribute float bright;uniform float uTime;uniform float uSize;uniform float uFlicker;uniform vec2 uRes;varying float vTw;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);float tw=0.6+0.4*sin(uTime*uFlicker+seed);vTw=bright*tw;gl_PointSize=max(uSize*uRes.y/900.0*(90.0/max(-mv.z,1.0)),1.0);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: 'uniform vec3 uColor;varying float vTw;void main(){vec2 p=gl_PointCoord-0.5;float l=length(p);if(l>0.5)discard;float core=smoothstep(0.5,0.0,l);gl_FragColor=vec4(uColor,core*vTw);}',
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  })
  const stars = new THREE.Points(geometry, material)
  stars.frustumCulled = false
  stars.layers.set(LAYERS.ENTIRE_SCENE)
  scene.add(stars)
  return material
}

function addMotes(THREE, scene, camera, resolution) {
  const positions = new Float32Array(CONFIG.atmoCount * 3)
  const sizes = new Float32Array(CONFIG.atmoCount)
  const seeds = new Float32Array(CONFIG.atmoCount)
  for (let index = 0; index < CONFIG.atmoCount; index += 1) {
    positions.set([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1], index * 3)
    sizes[index] = CONFIG.atmoSize * (0.4 + Math.random())
    seeds[index] = Math.random()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1))
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRes: { value: resolution }, uColor: { value: hexToVec3(THREE, CONFIG.atmoColor) } },
    vertexShader: `attribute float size;attribute float seed;uniform float uTime;uniform vec2 uRes;varying float vA;vec3 warp(vec3 p,float t){float c=0.9,a=1.9,b=0.02,s=0.05;p*=2.;p.x+=c*sin(s*t+a*p.y)+t*b;p.y+=c*cos(s*t+a*p.x);p.y+=c*sin(s*t+a*p.z)+t*b;p.z+=c*cos(s*t+a*p.y);p.z+=c*sin(s*t+a*p.x)+t*b;p.x+=c*cos(s*t+a*p.z);return cos(p+vec3(1,2,4));}void main(){vec3 v=position*4.0+warp(position,uTime)*1.2;vec4 mv=modelViewMatrix*vec4(v,1.0);float r=length(v);float farF=1.0-smoothstep(5.0,6.5,r);float nearF=smoothstep(0.0,0.5,-mv.z);vA=farF*nearF;gl_PointSize=size*uRes.y/900.0/-mv.z;gl_PointSize=max(gl_PointSize,1.0);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: 'uniform vec3 uColor;varying float vA;void main(){vec2 p=gl_PointCoord-0.5;float l=length(p);if(l>0.5)discard;float tex=smoothstep(0.5,0.0,l);gl_FragColor=vec4(uColor*tex,tex*vA*0.55);}',
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geometry, material)
  points.layers.set(LAYERS.ENTIRE_SCENE)
  points.frustumCulled = false
  points.layers.set(LAYERS.ENTIRE_SCENE)
  points.onBeforeRender = () => {
    material.uniforms.uTime.value = performance.now() * CONFIG.atmoSpeed * 0.008
    points.position.copy(camera.position)
  }
  scene.add(points)
  return material
}

function addPlanetShader(THREE, mesh, nightTexture, planetTime, nightAmount, nightLights, surfaceBrightness, nightSurfaceColor) {
  const source = mesh.material.clone()
  source.metalness = 0
  source.roughness = 1
  source.envMapIntensity = 0
  source.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      time: planetTime, noiseScale: { value: 30 }, speedX: { value: 1.5 }, speedY: { value: 2 }, speedZ: { value: 2.5 },
      rimColor: { value: hexToVec3(THREE, CONFIG.rimColor) }, rimPower: { value: CONFIG.rimPower },
      nightBlendTexture: { value: nightTexture }, nightLights, surfaceBrightness, nightSurfaceColor,
      nightAmount,
      terrainDepth: { value: CONFIG.terrainDepth }, terrainShade: { value: CONFIG.terrainShade },
      oceanGlint: { value: CONFIG.oceanGlint }, oceanDeep: { value: CONFIG.oceanDeep },
      oceanFlow: { value: CONFIG.oceanFlow }, oceanFlowSpeed: { value: CONFIG.oceanFlowSpeed }, oceanFlowScale: { value: CONFIG.oceanFlowScale },
    })
    shader.vertexShader = `varying vec2 vCustomUv;\n${shader.vertexShader}`.replace('void main() {', 'void main() {\n vCustomUv = uv;')
    shader.fragmentShader = `
      uniform float time;uniform float noiseScale;uniform float speedX;uniform float speedY;uniform float speedZ;
      uniform vec3 rimColor;uniform float rimPower;uniform sampler2D nightBlendTexture;uniform float nightLights;uniform float nightAmount;uniform float surfaceBrightness;uniform vec3 nightSurfaceColor;
      uniform float terrainDepth;uniform float terrainShade;uniform float oceanGlint;uniform float oceanDeep;
      uniform float oceanFlow;uniform float oceanFlowSpeed;uniform float oceanFlowScale;varying vec2 vCustomUv;
      ${SNOISE}
      ${shader.fragmentShader}`
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
      #include <dithering_fragment>
      vec3 normalizedNormal=normalize(vNormal);vec3 viewDir=normalize(vViewPosition);
      float rim=1.0-max(dot(viewDir,normalizedNormal),0.0);rim=pow(rim,rimPower);rim=pow(rim,1.5);rim*=0.7;
      vec3 currentColor=gl_FragColor.rgb;float blueDom=currentColor.b-max(currentColor.r,currentColor.g);
      float waterMask=clamp(smoothstep(-0.005,0.03,blueDom),0.0,1.0);
      float shimmer=snoise(vec3(vCustomUv.x*noiseScale+time*speedX,vCustomUv.y*noiseScale-time*speedY,time*speedZ));
      gl_FragColor.rgb+=waterMask*shimmer*0.025;
      float fT=time*oceanFlowSpeed*4.0;float fS=4.0*oceanFlowScale;
      float warp=snoise(vec3(vCustomUv.x*fS-fT*0.5,vCustomUv.y*fS+fT*0.4,fT*0.5));
      float flow=snoise(vec3(vCustomUv.x*fS*2.0+fT*0.6+warp,vCustomUv.y*fS*2.0-fT*0.5,fT*0.7));
      flow=warp*0.6+flow*0.4;gl_FragColor.rgb+=waterMask*flow*0.12*oceanFlow;
      gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(0.01,0.06,0.16),waterMask*oceanDeep);
      vec3 finalColor=mix(gl_FragColor.rgb,rimColor,rim);gl_FragColor=vec4(finalColor,1.0);
      vec3 surfPos=-vViewPosition;float terrH=dot(texture2D(map,vCustomUv).rgb,vec3(0.299,0.587,0.114));
      vec3 sigX=dFdx(surfPos),sigY=dFdy(surfPos);vec3 vR1=cross(sigY,normalizedNormal),vR2=cross(normalizedNormal,sigX);
      float fDet=dot(sigX,vR1);vec3 vGrad=sign(fDet)*(dFdx(terrH)*vR1+dFdy(terrH)*vR2);
      vec3 bumpedNormal=normalize(abs(fDet)*normalizedNormal-terrainDepth*vGrad);
      vec3 shadeNormal=mix(bumpedNormal,normalizedNormal,waterMask);
      vec3 cityLights=texture2D(nightBlendTexture,vCustomUv).rgb*gl_FragColor.rgb*nightLights;
      vec3 viewSunDir=normalize(vec3(-0.9,0.18,0.4));float ndl=dot(normalizedNormal,viewSunDir);
      float dayAmt=smoothstep(-0.05,0.35,ndl);float relief=dot(shadeNormal,viewSunDir)-ndl;
      gl_FragColor.rgb*=clamp(1.0+relief*terrainShade*dayAmt,0.55,1.6);
      float nightFactor=max(1.0-smoothstep(-0.30,0.18,ndl),nightAmount);
      float lightsFactor=max(1.0-smoothstep(-0.35,0.30,ndl),nightAmount);
      gl_FragColor.rgb=mix(gl_FragColor.rgb,nightSurfaceColor,nightFactor);
      gl_FragColor.rgb+=cityLights*lightsFactor;vec3 halfDir=normalize(viewSunDir+viewDir);
      float ripple=snoise(vec3(vCustomUv*240.0,time*4.0));float ndh=max(dot(normalizedNormal,halfDir)+ripple*0.02,0.0);
      float glint=pow(ndh,140.0);      gl_FragColor.rgb+=glint*waterMask*dayAmt*oceanGlint*vec3(1.0,0.97,0.88);gl_FragColor.rgb*=surfaceBrightness;
    `)
  }
  mesh.material = source
  return source
}

function addCloudLayers(THREE, texture, cloudGroup, cloudTime) {
  const layers = [
    { height: CONFIG.cloud1Height, opacity: CONFIG.cloud1Opacity, spin: CONFIG.cloud1Spin, ry: 0, phase: 0 },
    { height: CONFIG.cloud2Height, opacity: CONFIG.cloud2Opacity, spin: CONFIG.cloud2Spin, ry: 2.2, phase: 13 },
    { height: CONFIG.cloud3Height, opacity: CONFIG.cloud3Opacity, spin: CONFIG.cloud3Spin, ry: 4.3, phase: 27 },
  ]
  return layers.map((layer) => {
    const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = cloudTime
      shader.uniforms.noiseScale = { value: 20 }
      shader.uniforms.uSpeedX = { value: 1 }
      shader.uniforms.uSpeedY = { value: 2 }
      shader.uniforms.uSpeedZ = { value: 2 }
      shader.uniforms.uOpacity = { value: layer.opacity }
      shader.uniforms.uPhase = { value: layer.phase }
      shader.vertexShader = `varying vec2 vCloudUv;\n${shader.vertexShader}`.replace('void main() {', 'void main() {\n vCloudUv = uv;')
      shader.fragmentShader = `uniform float uTime;uniform float noiseScale;uniform float uSpeedX;uniform float uSpeedY;uniform float uSpeedZ;uniform float uOpacity;uniform float uPhase;varying vec2 vCloudUv;${SNOISE}\n${shader.fragmentShader}`
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.rgb=vec3(1.0);
        float cloudNoise=snoise(vec3(vCloudUv.x*noiseScale+uTime*uSpeedX+uPhase,vCloudUv.y*noiseScale-uTime*uSpeedY+uPhase,uTime*uSpeedZ+uPhase));
        float cloudNdv=max(dot(normalize(vNormal),normalize(vViewPosition)),0.0);
        float cloudEdge=pow(1.0-cloudNdv,3.0);float cloudMod=mix(cloudNoise,1.0,cloudEdge);
        float cloudNdl=dot(normalize(vNormal),normalize(vec3(-0.9,0.18,0.4)));
        float cloudNight=1.0-smoothstep(-0.30,0.30,cloudNdl);float cloudDay=1.0-cloudNight*0.9;
        gl_FragColor.a*=cloudMod*uOpacity*cloudDay;
      `)
    }
    const cloud = new THREE.Mesh(
      new THREE.SphereGeometry(CONFIG.planetRadius * layer.height, 64, 64),
      material,
    )
    cloud.layers.set(LAYERS.ENTIRE_SCENE)
    cloud.rotation.y = layer.ry
    cloud.renderOrder = 2
    cloud.userData.spin = layer.spin
    cloudGroup.add(cloud)
    return cloud
  })
}

function addMarkers(THREE, mesh, texture, resolution) {
  const image = texture?.image
  const positionAttribute = mesh.geometry.attributes.position
  const uvAttribute = mesh.geometry.attributes.uv
  if (!image || !positionAttribute || !uvAttribute) return null

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  try {
    context.drawImage(image, 0, 0)
  } catch (error) {
    console.error('Unable to sample the planet texture for land markers.', error)
    return null
  }

  let pixels
  try {
    pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  } catch (error) {
    console.error('Unable to read the planet texture for land markers.', error)
    return null
  }

  const index = mesh.geometry.index
  const triangleCount = index ? index.count / 3 : positionAttribute.count / 3
  const triangles = []
  let areaTotal = 0
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const ia = index ? index.getX(triangle * 3) : triangle * 3
    const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1
    const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2
    a.fromBufferAttribute(positionAttribute, ia)
    b.fromBufferAttribute(positionAttribute, ib)
    c.fromBufferAttribute(positionAttribute, ic)
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() * 0.5
    areaTotal += area
    triangles.push({ ia, ib, ic, areaTotal })
  }
  if (!areaTotal) return null

  const positions = []
  const seeds = []
  for (let attempt = 0; positions.length < CONFIG.markerCount * 3 && attempt < CONFIG.markerCount * 500; attempt += 1) {
    const target = Math.random() * areaTotal
    let low = 0
    let high = triangles.length - 1
    while (low < high) {
      const middle = (low + high) >> 1
      if (triangles[middle].areaTotal < target) low = middle + 1
      else high = middle
    }
    const { ia, ib, ic } = triangles[low]
    const root = Math.sqrt(Math.random())
    const wa = 1 - root
    const wb = root * Math.random()
    const wc = 1 - wa - wb
    const uvA = new THREE.Vector2().fromBufferAttribute(uvAttribute, ia)
    const uvB = new THREE.Vector2().fromBufferAttribute(uvAttribute, ib)
    const uvC = new THREE.Vector2().fromBufferAttribute(uvAttribute, ic)
    const uv = uvA.multiplyScalar(wa).add(uvB.multiplyScalar(wb)).add(uvC.multiplyScalar(wc))
    const px = Math.min(canvas.width - 1, Math.max(0, Math.floor(uv.x * canvas.width)))
    const py = Math.min(canvas.height - 1, Math.max(0, Math.floor((1 - uv.y) * canvas.height)))
    const pixel = (py * canvas.width + px) * 4
    const red = pixels[pixel]
    const green = pixels[pixel + 1]
    const blue = pixels[pixel + 2]
    if (blue > red + 6 && blue > green + 6) continue

    a.fromBufferAttribute(positionAttribute, ia)
    b.fromBufferAttribute(positionAttribute, ib)
    c.fromBufferAttribute(positionAttribute, ic)
    const point = a.multiplyScalar(wa).add(b.multiplyScalar(wb)).add(c.multiplyScalar(wc)).multiplyScalar(1.012)
    positions.push(point.x, point.y, point.z)
    seeds.push(Math.random())
  }
  if (!positions.length) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1))
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: hexToVec3(THREE, CONFIG.markerColor) }, uTime: { value: 0 },
      uSize: { value: CONFIG.markerSize }, uSpeed: { value: CONFIG.markerSpeed }, uRes: { value: resolution },
    },
    vertexShader: 'attribute float seed;uniform float uSize;uniform vec2 uRes;varying float vSeed;varying float vFade;void main(){vSeed=seed;vec4 mv=modelViewMatrix*vec4(position,1.0);vec3 vn=normalize(normalMatrix*normalize(position));vec3 vd=normalize(-mv.xyz);vFade=smoothstep(0.15,0.5,dot(vn,vd));gl_PointSize=max(uSize*uRes.y/900.0*(7.0/max(-mv.z,1.0)),2.0);gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'uniform vec3 uColor;uniform float uTime;uniform float uSpeed;varying float vSeed;varying float vFade;void main(){if(vFade<=0.001)discard;vec2 p=gl_PointCoord-0.5;float d=length(p)*2.0;if(d>1.0)discard;float core=smoothstep(0.30,0.0,d)*1.2;float ph=fract(uTime*uSpeed+vSeed);float ring=smoothstep(0.07,0.0,abs(d-ph))*(1.0-ph);gl_FragColor=vec4(uColor,clamp(core+ring,0.0,1.0)*vFade);}',
    transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geometry, material)
  mesh.add(points)
  return material
}

export default function PlanetScene({ canvasRef, theme, onReady, onError }) {
  const themeRef = useRef(theme)
  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let cancelled = false
    let animationFrame = 0
    let renderer
    let controls
    let composers = []
    let cleanupResources = []

    async function initialize() {
      try {
        const [threeModule, composerModule, renderModule, bloomModule, shaderModule, gammaModule, copyModule, gltfModule, dracoModule, controlsModule] = await Promise.all([
          import('https://unpkg.com/three@0.143.0/build/three.module.js'),
          import('https://unpkg.com/three@0.143.0/examples/jsm/postprocessing/EffectComposer.js'),
          import('https://unpkg.com/three@0.143.0/examples/jsm/postprocessing/RenderPass.js'),
          import('https://unpkg.com/three@0.143.0/examples/jsm/postprocessing/UnrealBloomPass.js'),
          import('https://unpkg.com/three@0.143.0/examples/jsm/postprocessing/ShaderPass.js'),
          import('https://unpkg.com/three@0.143.0/examples/jsm/shaders/GammaCorrectionShader.js'),
          import('https://unpkg.com/three@0.143.0/examples/jsm/shaders/CopyShader.js'),
          import('https://unpkg.com/three@0.143.0/examples/jsm/loaders/GLTFLoader.js'),
          import('https://unpkg.com/three@0.143.0/examples/jsm/loaders/DRACOLoader.js'),
          import('https://unpkg.com/three@0.143.0/examples/jsm/controls/OrbitControls.js'),
        ])
        if (cancelled) return
        const THREE = threeModule
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0x000000)
        const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200)
        camera.position.set(0, 0, 8)
        camera.layers.enable(LAYERS.TORUS_SCENE)
        camera.layers.enable(LAYERS.BLOOM_SCENE)
        camera.layers.enable(LAYERS.ENTIRE_SCENE)
        scene.add(camera)

        renderer = new THREE.WebGL1Renderer({ canvas, antialias: true, alpha: false })
        renderer.setPixelRatio(window.devicePixelRatio)
        renderer.outputEncoding = THREE.sRGBEncoding
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.VSMShadowMap
        renderer.setSize(window.innerWidth, window.innerHeight)
        const ambient = new THREE.AmbientLight(0xffffff, 0.5)
        ambient.layers.set(LAYERS.TORUS_SCENE)
        ambient.layers.enable(LAYERS.BLOOM_SCENE)
        ambient.layers.enable(LAYERS.ENTIRE_SCENE)
        scene.add(ambient)
        const directional = new THREE.DirectionalLight(0xffffff, 0.7)
        directional.position.set(0, 10, 2)
        directional.layers.set(LAYERS.TORUS_SCENE)
        directional.layers.enable(LAYERS.BLOOM_SCENE)
        directional.layers.enable(LAYERS.ENTIRE_SCENE)
        scene.add(directional)
        const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight)

        const makeComposer = () => {
          const composer = new composerModule.EffectComposer(renderer)
          composer.setSize(window.innerWidth, window.innerHeight)
          composer.setPixelRatio(window.devicePixelRatio)
          composers.push(composer)
          return composer
        }
        const torusComposer = makeComposer()
        torusComposer.addPass(new renderModule.RenderPass(scene, camera))
        torusComposer.addPass(new shaderModule.ShaderPass(gammaModule.GammaCorrectionShader))
        torusComposer.addPass(new bloomModule.UnrealBloomPass(resolution, 0.22, 0.2, 0.8))
        torusComposer.addPass(new shaderModule.ShaderPass(copyModule.CopyShader))
        torusComposer.renderToScreen = false

        const bloomComposer = makeComposer()
        bloomComposer.addPass(new renderModule.RenderPass(scene, camera))
        bloomComposer.addPass(new bloomModule.UnrealBloomPass(resolution, 0.2, 0.6, 0.9))
        bloomComposer.addPass(new shaderModule.ShaderPass(gammaModule.GammaCorrectionShader))
        bloomComposer.renderToScreen = false

        FinalPass.uniforms.uBg.value = hexToVec3(THREE, CONFIG.bgColor)
        const finalComposer = makeComposer()
        finalComposer.addPass(new renderModule.RenderPass(scene, camera))
        const finalPass = new shaderModule.ShaderPass(FinalPass)
        finalPass.uniforms.torusTexture.value = torusComposer.renderTarget1.texture
        finalPass.uniforms.bloomTexture.value = bloomComposer.renderTarget1.texture
        finalComposer.addPass(finalPass)

        controls = new controlsModule.OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.06
        controls.enablePan = false
        controls.enabled = false
        controls.autoRotate = true
        controls.autoRotateSpeed = CONFIG.autoRotate
        controls.minDistance = 3.5
        controls.maxDistance = 16
        controls.target.set(0, 0, 0)

        const worldGroup = new THREE.Group()
        const planetGroup = new THREE.Group()
        const cloudGroup = new THREE.Group()
        planetGroup.rotation.z = CONFIG.tilt
        cloudGroup.rotation.z = CONFIG.tilt
        cloudGroup.visible = false
        worldGroup.add(planetGroup, cloudGroup)
        worldGroup.position.set(STOPS_X[0].v, STOPS_Y[0].v, 0)
        worldGroup.scale.setScalar(STOPS_S[0].v)
        scene.add(worldGroup)
        const planetTime = { value: 0 }
        const cloudTime = { value: 0 }
        const planetBrightness = { value: 1 }
        const planetNightSurfaceColor = { value: hexToVec3(THREE, '#090d19') }
        const starMaterial = addStars(THREE, scene, resolution)
        const moteMaterial = addMotes(THREE, scene, camera, resolution)
        cleanupResources.push(starMaterial, moteMaterial)
        const backgroundColors = {
          dark: hexToVec3(THREE, CONFIG.bgColor),
          light: hexToVec3(THREE, '#040a1e'),
          darkNightSurface: hexToVec3(THREE, '#090d19'),
          lightNightSurface: hexToVec3(THREE, '#253b5a'),
          darkStars: hexToVec3(THREE, CONFIG.starColor),
          lightStars: hexToVec3(THREE, '#d6d8df'),
          darkMotes: hexToVec3(THREE, CONFIG.atmoColor),
          lightMotes: hexToVec3(THREE, '#f2c578'),
        }
        planetNightSurfaceColor.value = backgroundColors.darkNightSurface

        const draco = new dracoModule.DRACOLoader()
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/')
        const loader = new gltfModule.GLTFLoader()
        loader.setDRACOLoader(draco)
        const textureLoader = new THREE.TextureLoader()
        const [lightsAsset, cloudsTexture] = await Promise.all([
          loader.loadAsync(PLANET_LIGHTS_GLB),
          textureLoader.loadAsync(PLANET_CLOUDS_PNG),
        ])
        const lightMesh = lightsAsset.scene.getObjectByProperty('isMesh', true)
        const nightTexture = lightMesh?.material?.map
        if (!nightTexture) throw new Error('Planet city-light texture is missing.')
        cloudsTexture.wrapS = THREE.RepeatWrapping
        cloudsTexture.wrapT = THREE.RepeatWrapping
        cloudsTexture.repeat.set(5, 5)
        const planetAsset = await loader.loadAsync(PLANET_GLB)
        if (cancelled) return
        const planetMesh = planetAsset.scene.getObjectByProperty('isMesh', true)
        if (!planetMesh) throw new Error('Planet mesh is missing.')
        planetMesh.geometry.computeBoundingSphere()
        planetMesh.scale.setScalar(CONFIG.planetRadius / planetMesh.geometry.boundingSphere.radius)
        planetMesh.layers.set(LAYERS.ENTIRE_SCENE)
        const planetNight = { value: NIGHT_STOPS[0].v }
        const planetNightLights = { value: CONFIG.nightLights }
        const planetMaterial = addPlanetShader(THREE, planetMesh, nightTexture, planetTime, planetNight, planetNightLights, planetBrightness, planetNightSurfaceColor)
        planetGroup.add(planetMesh)
        const markerMaterial = addMarkers(THREE, planetMesh, planetMaterial.map, resolution)
        if (markerMaterial) cleanupResources.push(markerMaterial)
        const cloudMeshes = addCloudLayers(THREE, cloudsTexture, cloudGroup, cloudTime)
        cleanupResources.push(planetMaterial, cloudsTexture, draco, planetMesh.geometry, ...cloudMeshes.flatMap((mesh) => [mesh.geometry, mesh.material]))
        cloudGroup.visible = true

        let currentProgress = 0
        let currentX = STOPS_X[0].v
        let currentY = STOPS_Y[0].v
        let currentScale = STOPS_S[0].v
        let spinPhase = 0
        let previousTime = 0
        let hasRendered = false
        const render = (time) => {
          if (cancelled) return
          const dt = Math.min(0.05, previousTime ? (time - previousTime) / 1000 : 0)
          previousTime = time
          const scrollable = document.documentElement.scrollHeight - window.innerHeight
          const targetProgress = Math.max(0, Math.min(1, scrollable ? window.scrollY / scrollable : 0))
          currentProgress += (targetProgress - currentProgress) * Math.min(1, dt * 4.5)
          const lightTheme = themeRef.current === 'light'
          planetNight.value = lightTheme ? 0 : sample(NIGHT_STOPS, currentProgress)
          planetNightSurfaceColor.value.copy(lightTheme
            ? backgroundColors.lightNightSurface
            : backgroundColors.darkNightSurface)
          const sideScale = Math.max(0.5, Math.min(1, window.innerWidth / 1200))
          const damping = Math.min(1, dt * 3.2)
          currentX += (sample(STOPS_X, currentProgress) * sideScale - currentX) * damping
          currentY += (sample(STOPS_Y, currentProgress) - currentY) * damping
          currentScale += (sample(STOPS_S, currentProgress) - currentScale) * damping
          worldGroup.position.set(currentX, currentY, 0)
          worldGroup.scale.setScalar(currentScale)
          spinPhase += dt * CONFIG.spin
          planetGroup.rotation.y = CONFIG.initRotation + spinPhase + currentProgress * Math.PI * 1.6
          planetNightLights.value = lightTheme ? CONFIG.nightLights * 0.8 : CONFIG.nightLights * 2.3
          planetBrightness.value = lightTheme ? 1.5 : 1
          finalPass.uniforms.uBg.value.copy(lightTheme ? backgroundColors.light : backgroundColors.dark)
          starMaterial.uniforms.uColor.value.copy(lightTheme ? backgroundColors.lightStars : backgroundColors.darkStars)
          moteMaterial.uniforms.uColor.value.copy(lightTheme ? backgroundColors.lightMotes : backgroundColors.darkMotes)

          camera.layers.set(LAYERS.TORUS_SCENE)
          torusComposer.render()
          camera.layers.set(LAYERS.BLOOM_SCENE)
          bloomComposer.render()
          camera.layers.set(LAYERS.ENTIRE_SCENE)
          finalComposer.render()
          if (!hasRendered) {
            hasRendered = true
            onReady()
          }
          animationFrame = window.requestAnimationFrame(render)
        }
        animationFrame = window.requestAnimationFrame(render)

        const handleResize = () => {
          const width = window.innerWidth
          const height = window.innerHeight
          camera.aspect = width / height
          camera.updateProjectionMatrix()
          renderer.setPixelRatio(window.devicePixelRatio)
          renderer.setSize(width, height)
          composers.forEach((composer) => {
            composer.setPixelRatio(window.devicePixelRatio)
            composer.setSize(width, height)
          })
          resolution.set(width, height)
        }
        window.addEventListener('resize', handleResize)
        cleanupResources.push(() => window.removeEventListener('resize', handleResize))
      } catch (error) {
        if (!cancelled) {
          console.error('Unable to initialize the planet scene.', error)
          onError(error)
        }
      }
    }

    initialize()
    return () => {
      cancelled = true
      window.cancelAnimationFrame(animationFrame)
      controls?.dispose()
      composers.forEach((composer) => {
        composer.passes.forEach((pass) => pass.dispose?.())
        composer.renderTarget1.dispose()
        composer.renderTarget2.dispose()
      })
      cleanupResources.forEach((resource) => {
        if (typeof resource === 'function') resource()
        else resource?.dispose?.()
      })
      renderer?.dispose()
    }
  }, [canvasRef, onError, onReady])

  return <canvas className="planet-canvas" ref={canvasRef} aria-hidden="true" />
}
