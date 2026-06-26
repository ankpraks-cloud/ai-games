
let scene, camera, renderer;
let started = false;

let player = { pos:new THREE.Vector3(0,3.2,5), velY:0, yaw:Math.PI, pitch:0 };
let keys = {};
let blocks = new Map();
let chunks = new Map();
let zombies = [];
let villagers = [];
let chests = [];
let villageObjects = [];

let selected = 1;
let health = 10;
let hunger = 10;
let dead = false;
let inventoryOpen = false;
let craftingOpen = false;
let creativeMode = false;
let messageTimer = 0;

const CHUNK_SIZE = 12;
const RENDER_DISTANCE = 2;

// Hotbar starts full so you can build immediately.
let hotbar = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0};

// Backpack starts empty. Chests and crafting output go here.
let backpack = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0,10:0,11:0,12:0,13:0,14:0,15:0,16:0,17:0,18:0};

function getItemCount(id){ return (hotbar[id] || 0) + (backpack[id] || 0); }
function addToBackpack(id, amount){ backpack[id] = (backpack[id] || 0) + amount; }
function removeFromBackpack(id, amount){
  if((backpack[id] || 0) < amount) return false;
  backpack[id] -= amount;
  return true;
}
function canPay(cost){
  for(const id in cost){
    if((backpack[id] || 0) < cost[id]) return false;
  }
  return true;
}
function payCost(cost){
  for(const id in cost) backpack[id] -= cost[id];
}


const recipes = [
  {name:"2 Wood → 4 Sticks", cost:{4:2}, gain:{10:4}},
  {name:"2 Sticks + 3 Stone → Pickaxe", cost:{10:2,3:3}, gain:{15:1}},
  {name:"1 Stick + 2 Stone → Iron Sword", cost:{10:1,3:2}, gain:{11:1}},
  {name:"1 Stick + 2 Gold → Diamond Sword", cost:{10:1,9:2}, gain:{12:1}},
  {name:"1 Stick + 1 Gold → 4 Torches", cost:{10:1,9:1}, gain:{13:4}},
  {name:"8 Wood → Chest Item", cost:{4:8}, gain:{14:1}},
  {name:"4 Wood → 8 Brick", cost:{4:4}, gain:{8:8}},
  {name:"6 Sand + 2 Stone → 4 Gold", cost:{6:6,3:2}, gain:{9:4}},
  {name:"2 Wood + 2 Leaves → 8 Grass", cost:{4:2,5:2}, gain:{1:8}},
  {name:"4 Dirt + 2 Stone → 8 Sand", cost:{2:4,3:2}, gain:{6:8}},
  {name:"8 Stone → 12 Brick", cost:{3:8}, gain:{8:12}},
  {name:"10 Wood + 5 Gold → Treasure Bundle", cost:{4:10,9:5}, gain:{3:20,8:10,9:3}},
  {name:"10 Dirt → 10 Grass", cost:{2:10}, gain:{1:10}},
  {name:"6 Leaves + 2 Wood → Tree Kit", cost:{5:6,4:2}, gain:{5:12,4:4}},
  {name:"12 Sand → 12 Water", cost:{6:12}, gain:{7:12}},
  {name:"12 Brick + 4 Gold → Builder Kit", cost:{8:12,9:4}, gain:{16:1,1:32,4:32,8:32}},
  {name:"20 Stone + 5 Gold → Mega Pack", cost:{3:20,9:5}, gain:{17:1,3:64,8:32,9:10}},
  {name:"4 Zombie Bait → Treasure Bundle", cost:{18:4}, gain:{9:10,11:1,12:1}}
];

const names = {1:"Grass",2:"Dirt",3:"Stone",4:"Wood",5:"Leaves",6:"Sand",7:"Water",8:"Brick",9:"Gold",10:"Stick",11:"Iron Sword",12:"Diamond Sword",13:"Torch",14:"Chest",15:"Pickaxe",16:"Mega Pack",17:"Builder Kit",18:"Zombie Bait"};

function makePixelTexture(base, speckles, stripes=false, brick=false, leaves=false){
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0,0,32,32);
  function shade(hex, amt){
    let n = parseInt(hex.slice(1),16);
    let r = Math.max(0,Math.min(255,((n>>16)&255)+amt));
    let g = Math.max(0,Math.min(255,((n>>8)&255)+amt));
    let b = Math.max(0,Math.min(255,(n&255)+amt));
    return `rgb(${r},${g},${b})`;
  }
  if(stripes){
    for(let y=0;y<32;y+=6){ ctx.fillStyle = shade(base, -25); ctx.fillRect(0,y,32,2); }
    for(let x=4;x<32;x+=9){ ctx.fillStyle = shade(base, 18); ctx.fillRect(x,0,2,32); }
  }
  if(brick){
    ctx.strokeStyle = shade(base, -45); ctx.lineWidth = 2;
    for(let y=0;y<32;y+=8){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(32,y); ctx.stroke();
      for(let x=(y/8)%2?0:8;x<32;x+=16){ ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+8); ctx.stroke(); }
    }
  }
  if(leaves){
    for(let i=0;i<30;i++){
      ctx.fillStyle = shade(base, Math.random()>.5?35:-30);
      ctx.fillRect(Math.floor(Math.random()*32),Math.floor(Math.random()*32),4,4);
    }
  }
  for(let i=0;i<speckles;i++){
    ctx.fillStyle = shade(base, Math.floor(Math.random()*50)-25);
    ctx.fillRect(Math.floor(Math.random()*32), Math.floor(Math.random()*32), 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

const textures = {
  1: makePixelTexture("#4caf50", 55),
  2: makePixelTexture("#7a4b23", 65),
  3: makePixelTexture("#777777", 75),
  4: makePixelTexture("#8b5a2b", 40, true),
  5: makePixelTexture("#2e8b57", 55, false, false, true),
  6: makePixelTexture("#ddcc82", 45),
  7: makePixelTexture("#3388ff", 25),
  8: makePixelTexture("#aa4433", 30, false, true),
  9: makePixelTexture("#ffcc22", 35),
};

const materials = {};
for(let i=1;i<=9;i++){
  materials[i] = new THREE.MeshLambertMaterial({ map:textures[i], transparent:i===7, opacity:i===7?.55:1 });
}

function keyOf(x,y,z){ return `${Math.round(x)},${Math.round(y)},${Math.round(z)}`; }
function chunkKey(cx,cz){ return `${cx},${cz}`; }

function noiseHeight(x,z){
  if(Math.abs(x) <= 28 && Math.abs(z) <= 28) return 0; // village flat spawn zone
  return Math.floor(2.5*Math.sin(x*.13) + 2.0*Math.cos(z*.12) + 1.5*Math.sin((x+z)*.06));
}

function addBlock(x,y,z,id, chunk=null, village=false){
  const kk = keyOf(x,y,z);
  if(blocks.has(kk)) return;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), materials[id]);
  mesh.position.set(x,y,z);
  mesh.userData = {type:"block", id:id};
  scene.add(mesh);
  blocks.set(kk, mesh);
  if(chunk) chunk.objects.push(mesh);
  if(village) villageObjects.push(mesh);
}

function removeBlock(mesh){
  blocks.delete(keyOf(mesh.position.x, mesh.position.y, mesh.position.z));
  scene.remove(mesh);
}

function makeTree(x,z,y,chunk=null,village=false){
  addBlock(x,y,z,4,chunk,village);
  addBlock(x,y+1,z,4,chunk,village);
  addBlock(x,y+2,z,4,chunk,village);
  for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) addBlock(x+dx,y+3,z+dz,5,chunk,village);
  addBlock(x,y+4,z,5,chunk,village);
}

function randFrom(x,z){
  let n = (x*73856093 ^ z*19349663) >>> 0;
  return (n % 10000) / 10000;
}

function generateChunk(cx,cz){
  const ck = chunkKey(cx,cz);
  if(chunks.has(ck)) return;
  const chunk = {cx,cz,objects:[]};
  chunks.set(ck, chunk);
  for(let lx=0; lx<CHUNK_SIZE; lx++){
    for(let lz=0; lz<CHUNK_SIZE; lz++){
      const x = cx*CHUNK_SIZE + lx;
      const z = cz*CHUNK_SIZE + lz;
      if(Math.abs(x) <= 30 && Math.abs(z) <= 30) continue; // keep spawn village
      const y = noiseHeight(x,z);
      const sandy = y <= -1;
      const top = sandy ? 6 : 1;
      addBlock(x,y,z,top,chunk);
      addBlock(x,y-1,z,2,chunk);
      addBlock(x,y-2,z,3,chunk);
      if(y < -1) addBlock(x,0,z,7,chunk);
      if(!sandy && randFrom(x,z) < 0.025) makeTree(x,z,y+1,chunk);
    }
  }
  if(Math.abs(cx)%5===0 && Math.abs(cz)%5===0 && !(cx===0 && cz===0)){
    makeMiniVillage(cx*CHUNK_SIZE+5, cz*CHUNK_SIZE+5, chunk);
  }
}

function unloadFarChunks(){
  const pcx = Math.floor(player.pos.x / CHUNK_SIZE);
  const pcz = Math.floor(player.pos.z / CHUNK_SIZE);
  for(const [ck,chunk] of chunks.entries()){
    if(Math.abs(chunk.cx-pcx)>RENDER_DISTANCE+1 || Math.abs(chunk.cz-pcz)>RENDER_DISTANCE+1){
      for(const obj of chunk.objects){
        if(obj.userData.type === "block") blocks.delete(keyOf(obj.position.x,obj.position.y,obj.position.z));
        scene.remove(obj);
      }
      chunks.delete(ck);
    }
  }
}

function loadChunksNearPlayer(){
  const pcx = Math.floor(player.pos.x / CHUNK_SIZE);
  const pcz = Math.floor(player.pos.z / CHUNK_SIZE);
  for(let cx=pcx-RENDER_DISTANCE; cx<=pcx+RENDER_DISTANCE; cx++){
    for(let cz=pcz-RENDER_DISTANCE; cz<=pcz+RENDER_DISTANCE; cz++) generateChunk(cx,cz);
  }
  unloadFarChunks();
  document.getElementById("chunks").innerText = chunks.size;
}

function makeChest(x,y,z,chunk=null,village=false){
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,.7,1), new THREE.MeshLambertMaterial({color:0x8b5a2b}));
  mesh.position.set(x,y+.15,z);
  mesh.userData = {type:"chest", loot:{2:10,3:8,4:10,5:4,6:6,8:3,9:2,10:2}};
  scene.add(mesh);
  chests.push(mesh);
  if(chunk) chunk.objects.push(mesh);
  if(village) villageObjects.push(mesh);
}

function makeHouse(x,z,chunk=null,village=false){
  let y = noiseHeight(x,z)+1;
  for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) addBlock(x+dx,y-1,z+dz,4,chunk,village);
  for(let dx=-2;dx<=2;dx++){
    for(let dz=-2;dz<=2;dz++){
      if(Math.abs(dx)===2 || Math.abs(dz)===2){
        if(!(dx===0 && dz===-2)){
          addBlock(x+dx,y,z+dz,4,chunk,village);
          addBlock(x+dx,y+1,z+dz,4,chunk,village);
        }
      }
    }
  }
  // windows
  addBlock(x-2,y+1,z,9,chunk,village);
  addBlock(x+2,y+1,z,9,chunk,village);
  // roof
  for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++) if(Math.abs(dx)===3 || Math.abs(dz)===3) addBlock(x+dx,y+2,z+dz,8,chunk,village);
  makeChest(x+1,y,z+1,chunk,village);
}

function makeMiniVillage(x,z,chunk){
  makeHouse(x,z,chunk);
  makeHouse(x+7,z+2,chunk);
  spawnVillager(x+2,z+5,0xffa500);
}

function makeSpawnVillage(){
  // ground
  for(let x=-26;x<=26;x++){
    for(let z=-26;z<=26;z++){
      addBlock(x,0,z,1,null,true);
      addBlock(x,-1,z,2,null,true);
    }
  }
  // roads
  for(let i=-25;i<=25;i++){
    addBlock(0,1,i,6,null,true);
    addBlock(1,1,i,6,null,true);
    addBlock(-1,1,i,6,null,true);
    addBlock(i,1,0,6,null,true);
    addBlock(i,1,1,6,null,true);
    addBlock(i,1,-1,6,null,true);
  }
  // houses
  [[-15,-13],[15,-13],[-15,13],[15,13],[0,18],[-18,0],[18,0]].forEach(p=>makeHouse(p[0],p[1],null,true));
  // well
  for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) if(Math.abs(dx)===1 || Math.abs(dz)===1) addBlock(dx,2,dz,3,null,true);
  addBlock(0,2,0,7,null,true);
  // lamps
  [[-8,-8],[8,-8],[-8,8],[8,8],[0,-20],[0,20]].forEach(([x,z])=>{addBlock(x,1,z,4,null,true);addBlock(x,2,z,9,null,true);});
  // trees
  [[-24,-24],[24,-24],[-24,24],[24,24]].forEach(p=>makeTree(p[0],p[1],1,null,true));
}

function createMobModel(colorMain, type){
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(.7,1,.38), new THREE.MeshLambertMaterial({color:colorMain}));
  body.position.y = .75;
  const head = new THREE.Mesh(new THREE.BoxGeometry(.55,.55,.55), new THREE.MeshLambertMaterial({color:type==="zombie"?colorMain:0xd29b69}));
  head.position.y = 1.45;

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(.22,.75,.22), new THREE.MeshLambertMaterial({color:colorMain}));
  leftArm.position.set(-.55,.78,0);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(.22,.75,.22), new THREE.MeshLambertMaterial({color:colorMain}));
  rightArm.position.set(.55,.78,0);

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(.23,.65,.23), new THREE.MeshLambertMaterial({color:type==="zombie"?0x2d3d88:0x5a3a22}));
  leftLeg.position.set(-.18,.22,0);
  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(.23,.65,.23), new THREE.MeshLambertMaterial({color:type==="zombie"?0x2d3d88:0x5a3a22}));
  rightLeg.position.set(.18,.22,0);

  const eyeMat = new THREE.MeshLambertMaterial({color:0x000000});
  const eye1 = new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.04), eyeMat);
  eye1.position.set(-.12,1.52,-.29);
  const eye2 = new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.04), eyeMat);
  eye2.position.set(.12,1.52,-.29);

  group.add(body, head, leftArm, rightArm, leftLeg, rightLeg, eye1, eye2);
  group.userData.parts = {body,head,leftArm,rightArm,leftLeg,rightLeg};
  return group;
}

function addHealthBar(group){
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.1,.12), new THREE.MeshBasicMaterial({color:0x330000, side:THREE.DoubleSide}));
  bg.position.y = 2.05;
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.0,.08), new THREE.MeshBasicMaterial({color:0xff3333, side:THREE.DoubleSide}));
  bar.position.y = 2.06;
  group.add(bg,bar);
  group.userData.hpBar = bar;
}

function spawnZombie(x,z,color){
  const group = createMobModel(color,"zombie");
  group.position.set(x, noiseHeight(x,z)+1, z);
  group.userData.type = "zombie";
  group.userData.hp = 8;
  group.userData.maxHp = 8;
  group.userData.cooldown = 0;
  addHealthBar(group);
  scene.add(group);
  zombies.push(group);
}

function spawnVillager(x,z,color){
  const group = createMobModel(color,"villager");
  group.position.set(x, noiseHeight(x,z)+1, z);
  group.userData.type = "villager";
  group.userData.timer = 2;
  group.userData.dir = new THREE.Vector3(1,0,0);
  scene.add(group);
  villagers.push(group);
}

function raycast(){
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0,0), camera);
  const mobParts = zombies.flatMap(z=>z.children);
  const hits = ray.intersectObjects([...blocks.values(), ...chests, ...mobParts], false);
  return hits.length ? hits[0] : null;
}

function placeBlock(){
  if(dead || inventoryOpen || craftingOpen) return;
  if(!creativeMode && (hotbar[selected]||0)<=0) return;
  const hit = raycast();
  if(!hit || hit.object.userData.type !== "block") return;
  const p = hit.object.position.clone().add(hit.face.normal);
  addBlock(p.x,p.y,p.z,selected);
  if(!creativeMode) hotbar[selected]--;
  updateUI();
  updateCraftingUI();
}

function breakOrAttack(){
  if(dead){ respawn(); return; }
  if(inventoryOpen) return;
  const hit = raycast();
  if(!hit) return;

  let parent = hit.object.parent;
  while(parent && !parent.userData.type) parent = parent.parent;

  if(parent && parent.userData.type === "zombie"){
    parent.userData.hp -= 2;
    parent.userData.hpBar.scale.x = Math.max(.01, parent.userData.hp / parent.userData.maxHp);
    // knockback
    const away = parent.position.clone().sub(player.pos);
    away.y = 0;
    if(away.length()>0) parent.position.add(away.normalize().multiplyScalar(1.2));
    showMessage("Hit zombie!");
    if(parent.userData.hp <= 0){
      scene.remove(parent);
      zombies = zombies.filter(z=>z!==parent);
      showMessage("Zombie defeated!");
    }
    return;
  }

  if(hit.object.userData.type === "block"){
    const id = hit.object.userData.id;
    addToBackpack(id, 1);
    removeBlock(hit.object);
    updateUI();
  }
}

function openChest(){
  if(dead || inventoryOpen || craftingOpen) return;
  const hit = raycast();
  if(!hit || hit.object.userData.type !== "chest") return;
  for(const id in hit.object.userData.loot) addToBackpack(id, hit.object.userData.loot[id]);
  scene.remove(hit.object);
  chests = chests.filter(c=>c!==hit.object);
  showMessage("Chest loot added!");
  updateUI();
}

function showMessage(t){
  const el = document.getElementById("message");
  el.innerText = t;
  el.style.display = "block";
  messageTimer = 2;
}



function toggleCreative(){
  creativeMode = !creativeMode;
  const badge = document.getElementById("modeBadge");
  badge.style.display = "block";
  badge.innerText = creativeMode ? "CREATIVE MODE" : "SURVIVAL MODE";
  badge.style.background = creativeMode ? "rgba(40,90,180,.75)" : "rgba(0,0,0,.55)";
  showMessage(creativeMode ? "Creative mode ON: Space fly up, Shift fly down" : "Creative mode OFF");
  updateUI();
  updateCraftingUI();
}

function creativeGive(itemId, amount=64){
  if(itemId >= 1 && itemId <= 9){
    hotbar[itemId] = (hotbar[itemId] || 0) + amount;
  }
  addToBackpack(itemId, amount);
  showMessage("Added " + amount + " " + (names[itemId] || ("Item " + itemId)));
  updateUI();
  updateCraftingUI();
}

function canCraft(recipe){
  for(const id in recipe.cost){
    if((backpack[id]||0) < recipe.cost[id]) return false;
  }
  return true;
}

function craft(recipeIndex){
  const recipe = recipes[recipeIndex];
  if(!recipe) return;
  if(!canCraft(recipe)){
    showMessage("Not enough items!");
    return;
  }
  for(const id in recipe.cost) backpack[id] -= recipe.cost[id];
  for(const id in recipe.gain) addToBackpack(id, recipe.gain[id]);
  showMessage("Crafted: " + recipe.name);
  updateUI();
  updateCraftingUI();
}


function updateCraftingUI(){
  const box = document.getElementById("recipes");
  if(!box) return;
  box.innerHTML = "";

  if(creativeMode){
    const note = document.createElement("div");
    note.style.marginBottom = "10px";
    note.innerHTML = "<b>Creative Mode:</b> click any item to add 64.";
    box.appendChild(note);

    for(let i=1;i<=18;i++){
      const div = document.createElement("div");
      div.className = "creativeItem";
      div.innerHTML = `<b>${names[i] || ("Item " + i)}</b><br><span style="font-size:12px">Click to add 64. Blocks also fill hotbar.</span>`;
      div.onclick = ()=>creativeGive(i,64);
      box.appendChild(div);
    }
    return;
  }

  recipes.forEach((r,i)=>{
    const div = document.createElement("div");
    div.className = "recipe";
    div.innerHTML = `<b>${r.name}</b><br><span style="font-size:12px">${canCraft(r) ? "Ready from backpack" : "Missing backpack items"}</span>`;
    div.onclick = ()=>craft(i);
    box.appendChild(div);
  });
}


function updateUI(){
  document.getElementById("health").innerText = Math.ceil(health);
  document.getElementById("hunger").innerText = Math.ceil(hunger);

  // HOTBAR: shows starting/building blocks only.
  const hot = document.getElementById("hotbar");
  hot.innerHTML = "";
  for(let i=1;i<=9;i++){
    const div = document.createElement("div");
    div.className = "slot" + (i===selected ? " selected":"");
    div.innerHTML = `<b>${i}</b><span>${names[i]}</span><span>${hotbar[i]||0}</span>`;
    hot.appendChild(div);
  }

  // BACKPACK: starts empty and only shows backpack counts.
  const grid = document.getElementById("invgrid");
  grid.innerHTML = "";
  for(let i=1;i<=18;i++){
    const div = document.createElement("div");
    div.className = "invitem";
    div.innerText = `${names[i] || ("Item " + i)}: ${backpack[i]||0}`;
    grid.appendChild(div);
  }
}

function die(){
  dead = true;
  document.getElementById("death").style.display = "block";
  document.exitPointerLock();
}

function respawn(){
  health = 10;
  hunger = 10;
  dead = false;
  player.pos.set(0,3.2,5);
  document.getElementById("death").style.display = "none";
  updateUI();
}

function startGame(){
  document.getElementById("menu").style.display = "none";
  document.getElementById("ui").style.display = "block";
  document.getElementById("crosshair").style.display = "block";
  document.getElementById("hotbar").style.display = "flex";
  started = true;
  document.body.requestPointerLock();
}

function init(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, .1, 1000);

  renderer = new THREE.WebGLRenderer({antialias:false});
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  const sun = new THREE.DirectionalLight(0xffffff, .95);
  sun.position.set(20,40,20);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff,.45));

  makeSpawnVillage();
  loadChunksNearPlayer();

  // spawn mobs in village outskirts
  spawnZombie(-20,0,0x35aa45);
  spawnZombie(20,3,0x9944aa);
  spawnZombie(0,-22,0xaa4444);
  spawnVillager(2,2,0xffa500);
  spawnVillager(-4,5,0x00aaff);
  spawnVillager(5,-4,0xffff00);
  spawnVillager(-8,-3,0x66ff66);

  updateUI();

  document.getElementById("startBtn").onclick = startGame;

  document.body.addEventListener("click", ()=>{
    if(started && !inventoryOpen && !craftingOpen && !dead) document.body.requestPointerLock();
  });

  document.addEventListener("mousemove", e=>{
    if(document.pointerLockElement === document.body && !dead && !inventoryOpen && !craftingOpen && started){
      player.yaw -= e.movementX*.002;
      player.pitch -= e.movementY*.002;
      player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch));
    }
  });

  document.addEventListener("keydown", e=>{
    keys[e.code]=true;
    if(!started) return;
    if(e.code.startsWith("Digit")){
      const n = Number(e.code.replace("Digit",""));
      if(n>=1 && n<=9){ selected=n; updateUI(); }
    }
    if(e.code==="KeyE") placeBlock();
    if(e.code==="KeyR") breakOrAttack();
    if(e.code==="KeyC") openChest();
    if(e.code==="Tab"){
      e.preventDefault();
      inventoryOpen = !inventoryOpen;
      document.getElementById("inventory").style.display = inventoryOpen ? "block":"none";
      if(inventoryOpen) document.exitPointerLock();
    }
    if(e.code==="KeyQ"){
      craftingOpen = !craftingOpen;
      document.getElementById("crafting").style.display = craftingOpen ? "block":"none";
      updateCraftingUI();
      if(craftingOpen) document.exitPointerLock();
    }
    if(e.code==="KeyL"){
      toggleCreative();
    }
  });
  document.addEventListener("keyup", e=>keys[e.code]=false);
  addEventListener("resize", ()=>{
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
  });

  animate();
}

let chunkTimer = 0;
function animate(){
  requestAnimationFrame(animate);
  const dt = .016;

  if(messageTimer > 0){
    messageTimer -= dt;
    if(messageTimer <= 0) document.getElementById("message").style.display = "none";
  }

  if(started && !dead && !inventoryOpen && !craftingOpen){
    const forward = new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw),0,-Math.sin(player.yaw));
    const speed = keys["ShiftLeft"] ? .15 : .085;

    if(keys["KeyW"]) player.pos.add(forward.clone().multiplyScalar(-speed));
    if(keys["KeyS"]) player.pos.add(forward.clone().multiplyScalar(speed));
    if(keys["KeyA"]) player.pos.add(right.clone().multiplyScalar(-speed));
    if(keys["KeyD"]) player.pos.add(right.clone().multiplyScalar(speed));

    if(creativeMode){
      // Creative flight:
      // Space = fly up, Shift = fly down.
      if(keys["Space"]) player.pos.y += .12;
      if(keys["ShiftLeft"] || keys["ShiftRight"]) player.pos.y -= .12;
      player.velY = 0;
    } else {
      let ground = noiseHeight(Math.round(player.pos.x), Math.round(player.pos.z)) + 1.7;
      if(player.pos.y <= ground){
        player.pos.y = ground;
        player.velY = 0;
        if(keys["Space"]) player.velY = .18;
      } else {
        player.velY -= .008;
      }
      player.pos.y += player.velY;
    }

    zombies.forEach(z=>{
      let dir = player.pos.clone().sub(z.position);
      let dist = dir.length();
      if(dist < 18){
        dir.y = 0;
        z.position.add(dir.normalize().multiplyScalar(.025));
        z.lookAt(player.pos.x, z.position.y, player.pos.z);
        const walk = Math.sin(performance.now()*.008)*.55;
        z.userData.parts.leftArm.rotation.x = walk;
        z.userData.parts.rightArm.rotation.x = -walk;
        z.userData.parts.leftLeg.rotation.x = -walk;
        z.userData.parts.rightLeg.rotation.x = walk;
      }
      z.position.y = noiseHeight(Math.round(z.position.x), Math.round(z.position.z))+1;
      z.userData.cooldown -= dt;
      if(dist < 1.7 && z.userData.cooldown <= 0){
        health -= 1;
        z.userData.cooldown = 1.2;
        if(health <= 0) die();
        updateUI();
      }
      if(z.userData.hpBar) z.userData.hpBar.lookAt(camera.position);
    });

    villagers.forEach(v=>{
      v.userData.timer -= dt;
      if(v.userData.timer <= 0){
        v.userData.timer = 2 + Math.random()*3;
        v.userData.dir = new THREE.Vector3(Math.random()-.5,0,Math.random()-.5).normalize();
      }
      v.position.add(v.userData.dir.clone().multiplyScalar(.01));
      v.position.y = noiseHeight(Math.round(v.position.x), Math.round(v.position.z))+1;
    });

    chunkTimer += dt;
    if(chunkTimer > .35){
      loadChunksNearPlayer();
      chunkTimer = 0;
    }
  }

  camera.position.copy(player.pos);
  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  renderer.render(scene,camera);
}

init();
