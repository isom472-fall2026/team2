import { useEffect, useRef } from 'react'

const ASSET_BASE_URL = 'https://api.getlayers.ai/storage/v1/object/public/public/assets/ascend-d9857ad1f2'
const PLANET_CLOUDS_PNG = `${ASSET_BASE_URL}/planet-clouds.png`
// NASA's Blue Marble (day) and Black Marble (city lights) maps, which are public domain.
const EARTH_TEXTURE_BASE_URL = 'https://unpkg.com/three-globe@2.31.0/example/img'
const EARTH_DAY_JPG = `${EARTH_TEXTURE_BASE_URL}/earth-blue-marble.jpg`
const EARTH_NIGHT_JPG = `${EARTH_TEXTURE_BASE_URL}/earth-night.jpg`
const EARTH_WATER_PNG = `${EARTH_TEXTURE_BASE_URL}/earth-water.png`

const CONFIG = {
  rimColor: '#c1faff', rimPower: 2.4, nightLights: 4, terrainDepth: 0.33, terrainShade: 1.3,
  oceanGlint: 0.45, oceanDeep: 0.12, oceanFlow: 3, oceanFlowSpeed: 0.8, oceanFlowScale: 2.1,
  planetRadius: 1.95, spin: 0.06, initRotation: 2.86,
  tilt: 0.37,
  cloud1Height: 1.005, cloud1Opacity: 0.3, cloud1Spin: 0.06,
  cloud2Height: 1.03, cloud2Opacity: 0.18, cloud2Spin: 0.14,
  cloud3Height: 1.075, cloud3Opacity: 0.1, cloud3Spin: 0.1,
  bgColor: '#040a1e',
  atmoColor: '#9fc4ff', atmoCount: 320, atmoSize: 22, atmoSpeed: 0,
  starColor: '#cfe0ff', starCount: 1400, starSize: 1.6, starFlicker: 0,
}

const THEME_SWITCH_SECONDS = 1.2

const LAYERS = { ENTIRE_SCENE: 3 }
const STOPS_X = [{ p: 0, v: 3.3 }, { p: 0.32, v: -3.1 }, { p: 0.64, v: 3.2 }, { p: 1, v: -3.1 }]
const STOPS_Y = [{ p: 0, v: -0.35 }, { p: 0.32, v: 0.55 }, { p: 0.64, v: 0.45 }, { p: 1, v: 0.15 }]
const STOPS_S = [{ p: 0, v: 0.9 }, { p: 0.32, v: 1.0 }, { p: 0.64, v: 0.92 }, { p: 1, v: 1.12 }]

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
    tDiffuse: { value: null }, uBg: { value: null },
    uCenter: { value: null }, uRadius: { value: 0.3 }, uAspect: { value: 1 },
    uTime: { value: 0 }, uLight: { value: 0 }, uLightCore: { value: null }, uLightEdge: { value: null },
    uHalo: { value: null },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }',
  // Light mode keeps the Earth and replaces space with a sky-blue daylight sky whose beams
  // radiate from the globe and deepen towards the edges like a vignette. uLight sequences the
  // theme switch: the globe's halo brightens first, then the sky floods outward from it (run
  // backwards when switching to dark).
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec3 uBg; uniform vec2 uCenter; uniform float uRadius; uniform float uAspect;
    uniform float uTime; uniform float uLight; uniform vec3 uLightCore; uniform vec3 uLightEdge; uniform vec3 uHalo;
    varying vec2 vUv;
    void main(){
      vec4 frame=texture2D(tDiffuse,vUv);vec3 scene=frame.rgb;
      if(uLight<=0.0){gl_FragColor=vec4(uBg+scene,1.0);return;}
      vec2 p=(vUv-uCenter)*vec2(uAspect,1.0);
      float d=length(p)/uRadius;float a=atan(p.y,p.x);
      float beams=0.5+0.25*sin(a*6.0+uTime*0.05)+0.2*sin(a*11.0-uTime*0.07);
      beams=pow(clamp(beams,0.0,1.0),1.8);
      float reach=exp(-max(d-1.0,0.0)*0.5);
      vec3 sky=mix(uLightEdge,uLightCore,clamp(reach*(0.6+beams*0.55),0.0,1.0));
      float vignette=smoothstep(1.3,0.3,length((vUv-0.5)*vec2(uAspect,1.0)));
      sky*=mix(0.9,1.0,vignette);
      float glowIn=smoothstep(0.0,0.5,uLight);
      float rim=max(d-1.0,0.0);
      sky=mix(sky,uHalo,exp(-rim*7.0)*0.9*glowIn);
      float far=length(vec2(uAspect,1.0))/uRadius+1.0;
      float floodR=mix(1.0,far,smoothstep(0.3,1.0,uLight));
      float skyMask=1.0-smoothstep(floodR-0.8,floodR,d);
      // The scene renders over a transparent clear, so its alpha is the globe's exact
      // silhouette, clouds and antialiased edge included. A disc from the planet's radius
      // would crop it: the clouds stand above the surface, and a sphere off the view axis
      // projects wider than a circle.
      vec3 earth=scene+uHalo*pow(clamp(d,0.0,1.0),5.0)*0.45*glowIn*frame.a;
      vec3 day=sky*(1.0-frame.a)+earth;
      gl_FragColor=vec4(mix(uBg+scene,day,skyMask),1.);
    }`,
}

function addStars(THREE, scene, resolution, count) {
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const brightness = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
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

// The ocean and cloud noise never moves (it has no time input), so it is drawn once into a
// texture at startup; the shaders read it instead of evaluating simplex noise per pixel
// every frame, which was most of the globe's GPU cost.
function bakeNoise(THREE, renderer, width, height, body) {
  const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false })
  target.texture.generateMipmaps = true
  target.texture.minFilter = THREE.LinearMipmapLinearFilter
  const material = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `varying vec2 vUv;${SNOISE}\nvoid main(){ ${body} }`,
  })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  const scene = new THREE.Scene()
  scene.add(quad)
  renderer.setRenderTarget(target)
  renderer.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1))
  renderer.setRenderTarget(null)
  material.dispose()
  quad.geometry.dispose()
  return target
}

function addPlanetShader(THREE, mesh, nightTexture, waterTexture, noiseTexture, nightAmount, nightLights, surfaceBrightness, nightSurfaceColor, lightsAmount, dayMode, lowPower) {
  const source = mesh.material.clone()
  if (lowPower) source.defines = { ...source.defines, LOW_POWER: '' }
  source.metalness = 0
  source.roughness = 1
  source.envMapIntensity = 0
  source.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      noiseTexture: { value: noiseTexture },
      rimColor: { value: hexToVec3(THREE, CONFIG.rimColor) }, rimPower: { value: CONFIG.rimPower },
      nightBlendTexture: { value: nightTexture }, waterMaskTexture: { value: waterTexture }, nightLights, surfaceBrightness, nightSurfaceColor,
      nightAmount, lightsAmount, dayMode,
      terrainDepth: { value: CONFIG.terrainDepth }, terrainShade: { value: CONFIG.terrainShade },
      oceanGlint: { value: CONFIG.oceanGlint }, oceanDeep: { value: CONFIG.oceanDeep },
      oceanFlow: { value: CONFIG.oceanFlow },
    })
    shader.vertexShader = `varying vec2 vCustomUv;\n${shader.vertexShader}`.replace('void main() {', 'void main() {\n vCustomUv = uv;')
    shader.fragmentShader = `
      uniform sampler2D noiseTexture;
      uniform vec3 rimColor;uniform float rimPower;uniform sampler2D nightBlendTexture;uniform sampler2D waterMaskTexture;uniform float nightLights;uniform float nightAmount;uniform float lightsAmount;uniform float dayMode;uniform float surfaceBrightness;uniform vec3 nightSurfaceColor;
      uniform float terrainDepth;uniform float terrainShade;uniform float oceanGlint;uniform float oceanDeep;
      uniform float oceanFlow;varying vec2 vCustomUv;
      ${shader.fragmentShader}`
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
      #include <dithering_fragment>
      vec3 normalizedNormal=normalize(vNormal);vec3 viewDir=normalize(vViewPosition);
      float rim=1.0-max(dot(viewDir,normalizedNormal),0.0);rim=pow(rim,rimPower);rim=pow(rim,1.5);rim*=0.7;
      // The Blue Marble's deep oceans are too dark to tell from land by colour, so water comes
      // from its own mask (white is water).
      float waterMask=texture2D(waterMaskTexture,vCustomUv).r;
      // Baked noise: r is the ocean shimmer, g the ocean flow and b the glint ripple.
      vec3 noise=texture2D(noiseTexture,vCustomUv).rgb*2.0-1.0;
      // LOW_POWER (phones) skips the faint shimmer and the glint ripple: both are too fine to
      // see on a small screen.
      #ifndef LOW_POWER
      gl_FragColor.rgb+=waterMask*noise.r*0.025;
      #endif
      gl_FragColor.rgb+=waterMask*noise.g*0.12*oceanFlow*(1.0-0.85*dayMode);
      gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(0.01,0.06,0.16),waterMask*oceanDeep);
      vec3 finalColor=mix(gl_FragColor.rgb,rimColor,rim);gl_FragColor=vec4(finalColor,1.0);
      vec3 surfPos=-vViewPosition;float terrH=dot(texture2D(map,vCustomUv).rgb,vec3(0.299,0.587,0.114));
      vec3 sigX=dFdx(surfPos),sigY=dFdy(surfPos);vec3 vR1=cross(sigY,normalizedNormal),vR2=cross(normalizedNormal,sigX);
      float fDet=dot(sigX,vR1);vec3 vGrad=sign(fDet)*(dFdx(terrH)*vR1+dFdy(terrH)*vR2);
      vec3 bumpedNormal=normalize(abs(fDet)*normalizedNormal-terrainDepth*vGrad);
      vec3 shadeNormal=mix(bumpedNormal,normalizedNormal,waterMask);
      // The night map's lights are neutral grey (near 0.45 at full size, much less once mipmapped) and its land and sea a
      // faint blue, so blue is subtracted before the threshold. The low threshold lifts small
      // towns so every settled region glows, not only the largest cities.
      vec3 nightMap=texture2D(nightBlendTexture,vCustomUv).rgb;
      float nightLum=dot(nightMap,vec3(0.299,0.587,0.114))-max(nightMap.b-nightMap.r,0.0)*2.0;
      float cityGlow=smoothstep(0.02,0.15,nightLum);
      // A blurred sample (a lower mip level) spreads a soft glow around each lit area, so
      // cities still read at the globe's on-screen size, where each is only a few pixels.
      vec3 haloMap=texture2D(nightBlendTexture,vCustomUv,3.5).rgb;
      float haloLum=dot(haloMap,vec3(0.299,0.587,0.114))-max(haloMap.b-haloMap.r,0.0)*2.0;
      cityGlow+=smoothstep(0.01,0.07,haloLum)*0.45;
      vec3 cityLights=cityGlow*vec3(1.0,0.8,0.5)*nightLights;
      vec3 viewSunDir=normalize(mix(vec3(-0.9,0.18,0.4),vec3(-0.3,0.35,0.9),dayMode));float ndl=dot(normalizedNormal,viewSunDir);
      float dayAmt=smoothstep(-0.05,0.35,ndl);float relief=dot(shadeNormal,viewSunDir)-ndl;
      gl_FragColor.rgb*=clamp(1.0+relief*terrainShade*dayAmt,0.55,1.6);
      float nightFactor=max(1.0-smoothstep(-0.30,0.18,ndl),nightAmount)*(1.0-dayMode);
      float lightsFactor=max(1.0-smoothstep(-0.35,0.30,ndl),lightsAmount)*(1.0-dayMode);
      gl_FragColor.rgb=mix(gl_FragColor.rgb,nightSurfaceColor,nightFactor);
      // Light mode's sunny satellite look: the light swings to the front so the whole face is
      // in daylight, oceans turn a clearer blue and land colours are a little more saturated.
      float dayLum=dot(gl_FragColor.rgb,vec3(0.299,0.587,0.114));vec3 vivid=max(mix(vec3(dayLum),gl_FragColor.rgb,1.1),0.0);
      vivid=mix(vivid,vivid*0.3+vec3(0.03,0.15,0.34),waterMask);
      gl_FragColor.rgb=mix(gl_FragColor.rgb,vivid,dayMode);
      gl_FragColor.rgb+=cityLights*lightsFactor;vec3 halfDir=normalize(viewSunDir+viewDir);
      #ifdef LOW_POWER
      float ndh=max(dot(normalizedNormal,halfDir),0.0);
      #else
      float ndh=max(dot(normalizedNormal,halfDir)+noise.b*0.02,0.0);
      #endif
      float glint=pow(ndh,140.0);      gl_FragColor.rgb+=glint*waterMask*dayAmt*oceanGlint*(1.0-0.7*dayMode)*vec3(1.0,0.97,0.88);gl_FragColor.rgb*=surfaceBrightness;
      // The render target has no multisampling (on integrated GPUs it cost about half the
      // frame), so the rim is antialiased here: coverage fades out over the last pixel as the
      // surface turns edge-on. The colour is premultiplied because the final pass composites
      // the frame over the sky with its alpha.
      float edgeNdv=max(dot(normalizedNormal,viewDir),0.0);
      float edgeCoverage=clamp(edgeNdv/max(fwidth(edgeNdv),1e-4),0.0,1.0);
      gl_FragColor=vec4(gl_FragColor.rgb*edgeCoverage,edgeCoverage);
    `)
  }
  mesh.material = source
  return source
}

function addCloudLayers(THREE, texture, cloudGroup, cloudNoiseTexture, dayMode, layerCount) {
  const layers = [
    { height: CONFIG.cloud1Height, opacity: CONFIG.cloud1Opacity, spin: CONFIG.cloud1Spin, ry: 0, channel: [1, 0, 0, 0] },
    { height: CONFIG.cloud2Height, opacity: CONFIG.cloud2Opacity, spin: CONFIG.cloud2Spin, ry: 2.2, channel: [0, 1, 0, 0] },
    { height: CONFIG.cloud3Height, opacity: CONFIG.cloud3Opacity, spin: CONFIG.cloud3Spin, ry: 4.3, channel: [0, 0, 1, 0] },
  ]
  return layers.slice(0, layerCount).map((layer) => {
    const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uCloudNoise = { value: cloudNoiseTexture }
      shader.uniforms.uChannel = { value: new THREE.Vector4(...layer.channel) }
      shader.uniforms.uOpacity = { value: layer.opacity }
      shader.uniforms.uDay = dayMode
      shader.vertexShader = `varying vec2 vCloudUv;\n${shader.vertexShader}`.replace('void main() {', 'void main() {\n vCloudUv = uv;')
      shader.fragmentShader = `uniform sampler2D uCloudNoise;uniform vec4 uChannel;uniform float uOpacity;uniform float uDay;varying vec2 vCloudUv;\n${shader.fragmentShader}`
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.rgb=vec3(1.0);
        float cloudNoise=dot(texture2D(uCloudNoise,vCloudUv),uChannel)*2.0-1.0;
        float cloudNdv=max(dot(normalize(vNormal),normalize(vViewPosition)),0.0);
        float cloudEdge=pow(1.0-cloudNdv,3.0);float cloudMod=mix(cloudNoise,1.0,cloudEdge);
        float cloudNdl=dot(normalize(vNormal),normalize(vec3(-0.9,0.18,0.4)));
        float cloudNight=(1.0-smoothstep(-0.30,0.30,cloudNdl))*(1.0-uDay);float cloudDay=1.0-cloudNight*0.9;
        gl_FragColor.a*=cloudMod*uOpacity*cloudDay*clamp(cloudNdv/max(fwidth(cloudNdv),1e-4),0.0,1.0);
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
    let composer
    let cleanupResources = []

    async function initialize() {
      try {
        // index.html preloads these modules and the planet assets for the home route, so they
        // download alongside the app bundle; keep the URLs there in step with these.
        const [threeModule, composerModule, renderModule, shaderModule] = await Promise.all([
          import('https://unpkg.com/three@0.143.0/build/three.module.js'),
          import('https://unpkg.com/three@0.143.0/examples/jsm/postprocessing/EffectComposer.js'),
          import('https://unpkg.com/three@0.143.0/examples/jsm/postprocessing/RenderPass.js'),
          import('https://unpkg.com/three@0.143.0/examples/jsm/postprocessing/ShaderPass.js'),
        ])
        if (cancelled) return
        const THREE = threeModule
        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200)
        camera.position.set(0, 0, 8)
        camera.layers.set(LAYERS.ENTIRE_SCENE)
        scene.add(camera)

        // Touch devices get a lighter scene: phone GPUs drive 3x screens, so resolution, samples
        // and per-pixel noise are trimmed where the difference is not visible at that size.
        const lowPower = window.matchMedia('(pointer: coarse)').matches
        // Above 2x (1.5x on phones) the extra pixels are not visible on the planet but cost
        // every frame. renderScale lowers it further on devices that cannot keep up.
        let renderScale = 1
        const pixelRatio = () => Math.max(1, Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2) * renderScale)
        // The scene is drawn into the composer's own multisampled target and only a flat
        // full-screen pass reaches the canvas, so the canvas needs no antialiasing, depth or
        // stencil buffer of its own; each would be allocated and resolved every frame for nothing.
        renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' })
        renderer.setPixelRatio(pixelRatio())
        renderer.outputEncoding = THREE.sRGBEncoding
        // A transparent clear lets the final pass use the frame's alpha as the globe's outline.
        renderer.setClearColor(0x000000, 0)
        renderer.setSize(window.innerWidth, window.innerHeight)
        const ambient = new THREE.AmbientLight(0xffffff, 0.5)
        ambient.layers.set(LAYERS.ENTIRE_SCENE)
        scene.add(ambient)
        const directional = new THREE.DirectionalLight(0xffffff, 0.7)
        directional.position.set(0, 10, 2)
        const nightLightPosition = directional.position.clone()
        const dayLightPosition = new THREE.Vector3(-3, 4, 10)
        directional.layers.set(LAYERS.ENTIRE_SCENE)
        scene.add(directional)
        const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight)

        // No multisampling: resolving it cost about as much as drawing the whole scene. The globe
        // and clouds antialias their own rims in their shaders, and stars and motes are soft dots.
        composer = new composerModule.EffectComposer(renderer, new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight))
        composer.setPixelRatio(pixelRatio())
        composer.setSize(window.innerWidth, window.innerHeight)
        FinalPass.uniforms.uBg.value = hexToVec3(THREE, CONFIG.bgColor)
        composer.addPass(new renderModule.RenderPass(scene, camera))
        const finalPass = new shaderModule.ShaderPass(lowPower ? { ...FinalPass, defines: { LOW_POWER: '' } } : FinalPass)
        composer.addPass(finalPass)

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
        const planetBrightness = { value: 1.35 }
        const planetNightSurfaceColor = { value: hexToVec3(THREE, '#18263f') }
        const dayMode = { value: 0 }
        const starMaterial = addStars(THREE, scene, resolution, lowPower ? CONFIG.starCount / 2 : CONFIG.starCount)
        const moteMaterial = addMotes(THREE, scene, camera, resolution)
        cleanupResources.push(starMaterial, moteMaterial)
        finalPass.uniforms.uCenter.value = new THREE.Vector2(0.5, 0.5)
        finalPass.uniforms.uLightCore.value = hexToVec3(THREE, '#eef8ff')
        finalPass.uniforms.uLightEdge.value = hexToVec3(THREE, '#7cc3ee')
        finalPass.uniforms.uHalo.value = hexToVec3(THREE, '#e3f5ff')
        const projectedCenter = new THREE.Vector3()
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
        let lightAmount = themeRef.current === 'light' ? 1 : 0

        const textureLoader = new THREE.TextureLoader()
        textureLoader.setCrossOrigin('anonymous')
        const [nightTexture, waterTexture, cloudsTexture, dayTexture] = await Promise.all([
          textureLoader.loadAsync(EARTH_NIGHT_JPG),
          textureLoader.loadAsync(EARTH_WATER_PNG),
          textureLoader.loadAsync(PLANET_CLOUDS_PNG),
          textureLoader.loadAsync(EARTH_DAY_JPG),
        ])
        if (cancelled) return
        dayTexture.encoding = THREE.sRGBEncoding
        // Past 8x the extra filtering is not visible on the globe but is paid on every sample.
        const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        nightTexture.anisotropy = anisotropy
        cloudsTexture.wrapS = THREE.RepeatWrapping
        cloudsTexture.wrapT = THREE.RepeatWrapping
        cloudsTexture.repeat.set(5, 5)
        const planetMesh = new THREE.Mesh(
          new THREE.SphereGeometry(CONFIG.planetRadius, 128, 128),
          new THREE.MeshStandardMaterial({ map: dayTexture }),
        )
        planetMesh.layers.set(LAYERS.ENTIRE_SCENE)
        // The same noise the shaders used to evaluate per pixel, with time fixed at zero as it
        // always was. Sizes keep the finest pattern (the glint ripple, 240 cells across) above
        // four texels per cell.
        const planetNoise = bakeNoise(THREE, renderer, lowPower ? 1024 : 2048, lowPower ? 512 : 1024, `
          float shimmer=snoise(vec3(vUv*30.0,0.0));
          float warp=snoise(vec3(vUv*${(4 * CONFIG.oceanFlowScale).toFixed(2)},0.0));
          float flow=warp*0.6+snoise(vec3(vUv.x*${(8 * CONFIG.oceanFlowScale).toFixed(2)}+warp,vUv.y*${(8 * CONFIG.oceanFlowScale).toFixed(2)},0.0))*0.4;
          float ripple=snoise(vec3(vUv*240.0,0.0));
          gl_FragColor=vec4(clamp(vec3(shimmer,flow,ripple)*0.5+0.5,0.0,1.0),1.0);`)
        const cloudNoise = bakeNoise(THREE, renderer, 1024, 512, `
          vec3 phase=vec3(0.0,13.0,27.0);
          gl_FragColor=vec4(
            snoise(vec3(vUv*20.0+phase.x,phase.x)),
            snoise(vec3(vUv*20.0+phase.y,phase.y)),
            snoise(vec3(vUv*20.0+phase.z,phase.z)),
            0.0)*0.5+0.5;`)
        const planetNight = { value: 0 }
        const planetNightLights = { value: CONFIG.nightLights }
        const planetLightsAmount = { value: 0.15 }
        const planetMaterial = addPlanetShader(THREE, planetMesh, nightTexture, waterTexture, planetNoise.texture, planetNight, planetNightLights, planetBrightness, planetNightSurfaceColor, planetLightsAmount, dayMode, lowPower)
        if (planetMaterial.map) planetMaterial.map.anisotropy = anisotropy
        planetGroup.add(planetMesh)
        const cloudMeshes = addCloudLayers(THREE, cloudsTexture, cloudGroup, cloudNoise.texture, dayMode, lowPower ? 2 : 3)
        cleanupResources.push(planetMaterial, dayTexture, nightTexture, waterTexture, planetNoise, cloudNoise, cloudsTexture, planetMesh.geometry, ...cloudMeshes.flatMap((mesh) => [mesh.geometry, mesh.material]))
        cloudGroup.visible = true

        let currentProgress = 0
        let currentX = STOPS_X[0].v
        let currentY = STOPS_Y[0].v
        let currentScale = STOPS_S[0].v
        let spinPhase = 0
        let previousTime = 0
        let hasRendered = false
        // Reading scrollHeight every frame can force a layout; the page height only changes
        // when its content resizes, so it is measured then instead.
        let scrollable = 0
        const measureScroll = () => { scrollable = document.documentElement.scrollHeight - window.innerHeight }
        measureScroll()
        const pageObserver = new ResizeObserver(measureScroll)
        pageObserver.observe(document.body)
        cleanupResources.push(() => pageObserver.disconnect())

        // Steps the render resolution down when frames run slower than about 50 fps, so a slow
        // phone trades a little sharpness for smooth motion. It only steps down, so it cannot
        // oscillate; the first frames are skipped while shaders compile.
        let framesSeen = 0
        let sampledTime = 0
        let sampledFrames = 0
        const adaptResolution = (elapsed) => {
          framesSeen += 1
          if (framesSeen < 120 || elapsed > 0.25 || renderScale <= 0.55) return
          sampledTime += elapsed
          sampledFrames += 1
          if (sampledFrames < 90) return
          if (sampledTime / sampledFrames > 1 / 50) {
            renderScale = Math.max(0.55, renderScale - 0.15)
            renderer.setPixelRatio(pixelRatio())
            composer.setPixelRatio(pixelRatio())
          }
          sampledTime = 0
          sampledFrames = 0
        }

        const render = (time) => {
          if (cancelled) return
          const elapsed = previousTime ? (time - previousTime) / 1000 : 0
          const dt = Math.min(0.05, elapsed)
          previousTime = time
          adaptResolution(elapsed)
          const targetProgress = Math.max(0, Math.min(1, scrollable ? window.scrollY / scrollable : 0))
          // Exponential easing gives the same motion at any frame rate (60, 120, 144 Hz) and
          // through uneven frames, where a linear step per frame would speed up and slow down.
          currentProgress += (targetProgress - currentProgress) * (1 - Math.exp(-dt * 4.5))
          const sideScale = Math.max(0.5, Math.min(1, window.innerWidth / 1200))
          const damping = 1 - Math.exp(-dt * 3.2)
          currentX += (sample(STOPS_X, currentProgress) * sideScale - currentX) * damping
          currentY += (sample(STOPS_Y, currentProgress) - currentY) * damping
          currentScale += (sample(STOPS_S, currentProgress) - currentScale) * damping
          worldGroup.position.set(currentX, currentY, 0)
          worldGroup.scale.setScalar(currentScale)
          if (!reducedMotion.matches) {
            spinPhase += dt * CONFIG.spin
            cloudMeshes.forEach((cloud) => { cloud.rotation.y += dt * cloud.userData.spin * 0.25 })
          }
          planetGroup.rotation.y = CONFIG.initRotation + spinPhase + currentProgress * Math.PI * 1.6
          cloudGroup.rotation.y = planetGroup.rotation.y
          const lightTarget = themeRef.current === 'light' ? 1 : 0
          // A fixed-rate ramp on real elapsed time, not easing on the capped dt, so the
          // glow-then-flood sequence takes the same time even at low frame rates.
          lightAmount = reducedMotion.matches
            ? lightTarget
            : lightAmount + Math.sign(lightTarget - lightAmount) * Math.min(Math.abs(lightTarget - lightAmount), Math.min(elapsed, 0.25) / THEME_SWITCH_SECONDS)
          projectedCenter.copy(worldGroup.position).project(camera)
          const cameraDistance = camera.position.distanceTo(worldGroup.position)
          const planetSize = CONFIG.planetRadius * currentScale
          finalPass.uniforms.uCenter.value.set(projectedCenter.x * 0.5 + 0.5, projectedCenter.y * 0.5 + 0.5)
          finalPass.uniforms.uRadius.value = (planetSize / Math.sqrt(Math.max(cameraDistance ** 2 - planetSize ** 2, 0.01)))
            / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.5
          finalPass.uniforms.uAspect.value = camera.aspect
          finalPass.uniforms.uTime.value = time / 1000
          finalPass.uniforms.uLight.value = lightAmount
          dayMode.value = THREE.MathUtils.smoothstep(lightAmount, 0, 0.5)
          planetBrightness.value = 1.35 + dayMode.value * 0.15
          // The scene light sits above the globe for the dark look; light mode brings it to the
          // front so no edge of the globe is left in shadow.
          directional.position.lerpVectors(nightLightPosition, dayLightPosition, dayMode.value)
          directional.intensity = 0.7 + dayMode.value * 0.3
          ambient.intensity = 0.5 + dayMode.value * 0.3
          // Stars and motes are additive and would show as specks once the sky is up.
          starMaterial.visible = lightAmount < 1
          moteMaterial.visible = lightAmount < 1

          composer.render()
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
          renderer.setPixelRatio(pixelRatio())
          renderer.setSize(width, height)
          composer.setPixelRatio(pixelRatio())
          composer.setSize(width, height)
          resolution.set(width, height)
          measureScroll()
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
      if (composer) {
        composer.passes.forEach((pass) => pass.dispose?.())
        composer.renderTarget1.dispose()
        composer.renderTarget2.dispose()
      }
      cleanupResources.forEach((resource) => {
        if (typeof resource === 'function') resource()
        else resource?.dispose?.()
      })
      renderer?.dispose()
    }
  }, [canvasRef, onError, onReady])

  return <canvas className="planet-canvas" ref={canvasRef} aria-hidden="true" />
}
