let scene, camera, renderer;
let blocks = new Map();
let zombies = [];
let villagers = [];
let chests = [];
let keys = {};
let selected = 1;
let health = 10;
let hunger = 10;
let dead = false;
let inventoryOpen = false;

let inventory = {
  1:64, 2:64, 3:40, 4:30, 5:25,
  6:30, 7:10, 8:20, 9:15
};

const names = {
  1:"Grass", 2:"Dirt", 3:"Stone", 4:"Wood", 5:"Leaves",
  6:"Sand", 7:"Water", 8:"Brick", 9:"Gold"
};

const colors = {
  1:0x4caf50, 2:0x7a4b23, 3:0x777777, 4:0x8b5a2b, 5:0x2e8b57,
  6:0xddcc82, 7:0x3388ff, 8:0xaa4433, 9:0xffcc22
};

let player = {
  pos:new THREE.Vector3(0,4,8),
  vel:new THREE.Vector3(),
  yaw:0,
  pitch:0,
  grounded:false
};

function keyOf(x,y,z){ return `${Math.round(x)},${Math.round(y)},${Math.round(z)}`; }

function heightAt(x,z){
  if (x >= -14 && x <= 14 && z >= -14 && z <= 14) return 0;
  return Math.floor(1.2*Math.sin(x*.2) + 1.2*Math.cos(z*.2));
}

function makeMaterial(id){
  return new THREE.MeshLambertMaterial({
    color: colors[id],
    transparent: id === 7,
    opacity: id === 7 ? 0.55 : 1
  });
}

function addBlock(x,y,z,id){
  const k = keyOf(x,y,z);
  if(blocks.has(k)) return;
  const geo = new THREE.BoxGeometry(1,1,1);
  const mesh = new THREE.Mesh(geo, makeMaterial(id));
  mesh.position.set(x,y,z);
  mesh.userData = {type:"block", id:id};
  scene.add(mesh);
  blocks.set(k, mesh);
}

function removeBlock(mesh){
  const k = keyOf(mesh.position.x, mesh.position.y, mesh.position.z);
  blocks.delete(k);
  scene.remove(mesh);
}

function makeTree(x,z,y){
  addBlock(x,y,z,4);
  addBlock(x,y+1,z,4);
  addBlock(x,y+2,z,5);
  addBlock(x+1,y+2,z,5);
  addBlock(x-1,y+2,z,5);
  addBlock(x,y+2,z+1,5);
  addBlock(x,y+2,z-1,5);
}

function makeHouse(x,z){
  for(let dx=-2;dx<=2;dx++){
    for(let dz=-2;dz<=2;dz++){
      addBlock(x+dx,0,z+dz,4);
    }
  }
  for(let dx=-2;dx<=2;dx++){
    for(let dz=-2;dz<=2;dz++){
      if(Math.abs(dx)==2 || Math.abs(dz)==2){
        if(!(dx==0 && dz==-2)){
          addBlock(x+dx,1,z+dz,4);
          addBlock(x+dx,2,z+dz,4);
        }
      }
    }
  }
  for(let dx=-3;dx<=3;dx++){
    for(let dz=-3;dz<=3;dz++){
      if(Math.abs(dx)==3 || Math.abs(dz)==3) addBlock(x+dx,3,z+dz,8);
    }
  }
  makeChest(x+1,1,z+1);
}

function makeVillage(){
  for(let x=-14;x<=14;x++){
    for(let z=-14;z<=14;z++){
      addBlock(x,0,z,1);
      addBlock(x,-1,z,2);
    }
  }
  for(let i=-14;i<=14;i++){
    addBlock(0,1,i,6);
    addBlock(i,1,0,6);
  }
  makeHouse(-8,-7);
  makeHouse(8,-7);
  makeHouse(0,8);
  makeTree(-12,-12,1);
  makeTree(12,-12,1);
  makeTree(-12,12,1);
  makeTree(12,12,1);
}

function genWorld(){
  makeVillage();
  for(let x=-25;x<=25;x++){
    for(let z=-25;z<=25;z++){
      if(x>=-16&&x<=16&&z>=-16&&z<=16) continue;
      let y = heightAt(x,z);
      addBlock(x,y,z,y<=-1?6:1);
      addBlock(x,y-1,z,2);
      if(y<-1) addBlock(x,0,z,7);
      if(Math.random()<0.015 && y>-1) makeTree(x,z,y+1);
    }
  }
}

function makeChest(x,y,z){
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,.7,1), new THREE.MeshLambertMaterial({color:0x8b5a2b}));
  mesh.position.set(x,y+.15,z);
  mesh.userData = {type:"chest", loot:{1:10,2:10,4:8,8:3,9:2}};
  scene.add(mesh);
  chests.push(mesh);
}

function spawnZombie(x,z,color){
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.7,1,.4), new THREE.MeshLambertMaterial({color:color}));
  body.position.y = .7;
  const head = new THREE.Mesh(new THREE.BoxGeometry(.55,.55,.55), new THREE.MeshLambertMaterial({color:color}));
  head.position.y = 1.45;
  group.add(body); group.add(head);
  group.position.set(x,heightAt(x,z)+1,z);
  group.userData = {type:"zombie", hp:6, cooldown:0};
  scene.add(group);
  zombies.push(group);
}

function spawnVillager(x,z,color){
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.7,1,.4), new THREE.MeshLambertMaterial({color:color}));
  body.position.y = .7;
  const head = new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5), new THREE.MeshLambertMaterial({color:0xd29b69}));
  head.position.y = 1.45;
  group.add(body); group.add(head);
  group.position.set(x,1,z);
  group.userData = {dir:new THREE.Vector3(Math.random()-.5,0,Math.random()-.5).normalize(), timer:2};
  scene.add(group);
  villagers.push(group);
}

function raycast(){
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
  const objects = [...blocks.values(), ...chests, ...zombies.flatMap(z=>z.children)];
  const hits = raycaster.intersectObjects(objects, false);
  return hits.length ? hits[0] : null;
}

function placeBlock(){
  if(inventory[selected] <= 0) return;
  const hit = raycast();
  if(!hit || !hit.object.userData.type && !hit.object.parent?.userData?.type) return;
  if(hit.object.userData.type !== "block") return;
  const p = hit.object.position.clone().add(hit.face.normal);
  addBlock(p.x,p.y,p.z,selected);
  inventory[selected]--;
  updateUI();
}

function breakOrAttack(){
  if(dead){ respawn(); return; }
  const hit = raycast();
  if(!hit) return;

  let parentType = hit.object.parent?.userData?.type;
  if(parentType === "zombie"){
    let z = hit.object.parent;
    z.userData.hp -= 2;
    if(z.userData.hp <= 0){
      scene.remove(z);
      zombies = zombies.filter(a=>a!==z);
    }
    return;
  }

  if(hit.object.userData.type === "block"){
    let id = hit.object.userData.id;
    inventory[id] = (inventory[id]||0)+1;
    removeBlock(hit.object);
    updateUI();
  }
}

function openChest(){
  const hit = raycast();
  if(!hit) return;
  if(hit.object.userData.type === "chest"){
    for(let id in hit.object.userData.loot){
      inventory[id] = (inventory[id]||0) + hit.object.userData.loot[id];
    }
    scene.remove(hit.object);
    chests = chests.filter(c=>c!==hit.object);
    updateUI();
  }
}

function updateUI(){
  document.getElementById("health").innerText = Math.ceil(health);
  document.getElementById("hunger").innerText = Math.ceil(hunger);
  const hot = document.getElementById("hotbar");
  hot.innerHTML = "";
  for(let i=1;i<=9;i++){
    let div = document.createElement("div");
    div.className = "slot" + (i===selected ? " selected":"");
    div.innerHTML = `<b>${i}</b><span>${names[i]}</span><span>${inventory[i]||0}</span>`;
    hot.appendChild(div);
  }
  const grid = document.getElementById("invgrid");
  grid.innerHTML = "";
  for(let i=1;i<=9;i++){
    let div = document.createElement("div");
    div.className = "invitem";
    div.innerText = `${names[i]}: ${inventory[i]||0}`;
    grid.appendChild(div);
  }
}

function die(){
  dead = true;
  document.getElementById("death").style.display = "block";
  document.exitPointerLock();
}

function respawn(){
  dead = false;
  health = 10; hunger = 10;
  player.pos.set(0,4,8);
  document.getElementById("death").style.display = "none";
  updateUI();
}

function init(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, .1, 1000);
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  const light = new THREE.DirectionalLight(0xffffff, .9);
  light.position.set(10,20,10);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff,.45));

  genWorld();
  spawnZombie(-18,0,0x35aa45);
  spawnZombie(18,3,0x9944aa);
  spawnVillager(2,2,0xffa500);
  spawnVillager(-4,5,0x00aaff);
  spawnVillager(5,-4,0xffff00);

  updateUI();

  document.body.addEventListener("click", ()=> {
    if(!inventoryOpen && !dead) document.body.requestPointerLock();
  });

  document.addEventListener("mousemove", e=>{
    if(document.pointerLockElement === document.body && !dead){
      player.yaw -= e.movementX * .002;
      player.pitch -= e.movementY * .002;
      player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch));
    }
  });

  document.addEventListener("keydown", e=>{
    keys[e.code] = true;
    if(e.code.startsWith("Digit")){
      let n = Number(e.code.replace("Digit",""));
      if(n>=1 && n<=9){ selected=n; updateUI(); }
    }
    if(e.code === "KeyE") placeBlock();
    if(e.code === "KeyR") breakOrAttack();
    if(e.code === "KeyC") openChest();
    if(e.code === "Tab"){
      e.preventDefault();
      inventoryOpen = !inventoryOpen;
      document.getElementById("inventory").style.display = inventoryOpen ? "block":"none";
      if(inventoryOpen) document.exitPointerLock();
    }
  });
  document.addEventListener("keyup", e=>keys[e.code]=false);
  animate();
}

function animate(){
  requestAnimationFrame(animate);
  let dt = .016;

  if(!dead && !inventoryOpen){
    let forward = new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw));
    let right = new THREE.Vector3(Math.cos(player.yaw),0,-Math.sin(player.yaw));
    let speed = keys["ShiftLeft"] ? .14 : keys["CapsLock"] ? .04 : .08;

    if(keys["KeyW"]) player.pos.add(forward.clone().multiplyScalar(speed));
    if(keys["KeyS"]) player.pos.add(forward.clone().multiplyScalar(-speed));
    if(keys["KeyA"]) player.pos.add(right.clone().multiplyScalar(-speed));
    if(keys["KeyD"]) player.pos.add(right.clone().multiplyScalar(speed));

    let ground = heightAt(Math.round(player.pos.x), Math.round(player.pos.z)) + 1.7;
    if(player.pos.y <= ground){
      player.pos.y = ground;
      player.vel.y = 0;
      if(keys["Space"]) player.vel.y = .18;
    } else {
      player.vel.y -= .008;
    }
    player.pos.y += player.vel.y;

    zombies.forEach(z=>{
      let dir = player.pos.clone().sub(z.position);
      let dist = dir.length();
      if(dist < 15){
        dir.y = 0;
        z.position.add(dir.normalize().multiplyScalar(.025));
      }
      z.position.y = heightAt(Math.round(z.position.x), Math.round(z.position.z))+1;
      z.userData.cooldown -= dt;
      if(dist < 1.7 && z.userData.cooldown <= 0){
        health -= 1;
        z.userData.cooldown = 1.2;
        if(health <= 0) die();
        updateUI();
      }
    });

    villagers.forEach(v=>{
      v.userData.timer -= dt;
      if(v.userData.timer <= 0){
        v.userData.timer = 2 + Math.random()*2;
        v.userData.dir = new THREE.Vector3(Math.random()-.5,0,Math.random()-.5).normalize();
      }
      v.position.add(v.userData.dir.clone().multiplyScalar(.01));
      v.position.y = heightAt(Math.round(v.position.x), Math.round(v.position.z))+1;
    });
  }

  camera.position.copy(player.pos);
  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  renderer.render(scene, camera);
}

init();
