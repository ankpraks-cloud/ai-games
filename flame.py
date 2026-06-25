from ursina import *
from ursina.prefabs.first_person_controller import FirstPersonController
from PIL import Image, ImageDraw
import random, math, os

app = Ursina()
window.title = "Working Mini Minecraft"
window.fps_counter.enabled = True
Texture.default_filtering = None

CHUNK_SIZE = 6
RENDER_DISTANCE = 1

selected_item = 1
health = 10
hunger = 10
dead = False
armour_on = False

blocks = {}
chunks = set()
mobs = []

os.makedirs("assets", exist_ok=True)

def make_texture(name, base):
    path = f"assets/{name}.png"
    if os.path.exists(path):
        return

    img = Image.new("RGB", (16, 16), base)
    draw = ImageDraw.Draw(img)

    for _ in range(60):
        x = random.randint(0, 15)
        y = random.randint(0, 15)
        shade = random.randint(-25, 25)
        draw.point((x, y), fill=tuple(max(0, min(255, v + shade)) for v in base))

    img.save(path)

make_texture("grass", (70, 180, 65))
make_texture("dirt", (120, 75, 35))
make_texture("stone", (125, 125, 125))
make_texture("wood", (120, 70, 30))
make_texture("leaves", (45, 145, 55))
make_texture("sand", (220, 205, 130))
make_texture("brick", (170, 75, 60))

item_names = {
    1: "Grass",
    2: "Dirt",
    3: "Stone",
    4: "Wood",
    5: "Leaves",
    6: "Sand",
    7: "Brick",
    8: "Sword",
    9: "Armour"
}

item_types = {
    1: "block",
    2: "block",
    3: "block",
    4: "block",
    5: "block",
    6: "block",
    7: "block",
    8: "sword",
    9: "armour"
}

block_textures = {
    1: "assets/grass.png",
    2: "assets/dirt.png",
    3: "assets/stone.png",
    4: "assets/wood.png",
    5: "assets/leaves.png",
    6: "assets/sand.png",
    7: "assets/brick.png"
}

inventory = {
    1: 64,
    2: 64,
    3: 40,
    4: 25,
    5: 25,
    6: 30,
    7: 20,
    8: 1,
    9: 1
}

def pos_key(pos):
    return tuple(round(v) for v in pos)

def height_at(x, z):
    return int(1.5 * math.sin(x * 0.2) + 1.5 * math.cos(z * 0.2))

class Block(Button):
    def __init__(self, position, block_type):
        super().__init__(
            parent=scene,
            position=position,
            model="cube",
            texture=block_textures[block_type],
            color=color.white,
            highlight_color=color.azure,
            scale=1,
            origin_y=0.5
        )

        self.block_type = block_type
        blocks[pos_key(position)] = self

def make_block(pos, block_type):
    if pos_key(pos) not in blocks:
        Block(pos, block_type)

def make_tree(x, z, y):
    make_block((x, y, z), 4)
    make_block((x, y + 1, z), 4)
    make_block((x, y + 2, z), 4)

    for dx, dz in [(0,0), (1,0), (-1,0), (0,1), (0,-1)]:
        make_block((x + dx, y + 3, z + dz), 5)

    make_block((x, y + 4, z), 5)

def generate_chunk(cx, cz):
    if (cx, cz) in chunks:
        return

    chunks.add((cx, cz))

    sx = cx * CHUNK_SIZE
    sz = cz * CHUNK_SIZE

    for x in range(sx, sx + CHUNK_SIZE):
        for z in range(sz, sz + CHUNK_SIZE):
            y = height_at(x, z)

            top_block = 6 if y <= -1 else 1

            make_block((x, y, z), top_block)
            make_block((x, y - 1, z), 2)
            make_block((x, y - 2, z), 3)

            if random.random() < 0.006 and top_block == 1:
                make_tree(x, z, y + 1)

def load_near_player():
    pcx = round(player.x) // CHUNK_SIZE
    pcz = round(player.z) // CHUNK_SIZE

    for cx in range(pcx - RENDER_DISTANCE, pcx + RENDER_DISTANCE + 1):
        for cz in range(pcz - RENDER_DISTANCE, pcz + RENDER_DISTANCE + 1):
            generate_chunk(cx, cz)

class Zombie(Entity):
    def __init__(self, position):
        super().__init__(position=position)
        self.health = 5
        self.speed = 1.25
        self.hit_cooldown = 0

        self.body = Entity(parent=self, model="cube", color=color.rgb(40, 120, 55), scale=(0.65, 0.9, 0.35), y=0.75, collider="box")
        self.head = Entity(parent=self, model="cube", color=color.rgb(70, 170, 85), scale=(0.55, 0.55, 0.55), y=1.45)
        self.left_arm = Entity(parent=self, model="cube", color=color.rgb(45, 130, 60), scale=(0.2, 0.75, 0.2), x=-0.48, y=0.8)
        self.right_arm = Entity(parent=self, model="cube", color=color.rgb(45, 130, 60), scale=(0.2, 0.75, 0.2), x=0.48, y=0.8)
        self.left_leg = Entity(parent=self, model="cube", color=color.rgb(35, 60, 120), scale=(0.22, 0.65, 0.22), x=-0.18, y=0.2)
        self.right_leg = Entity(parent=self, model="cube", color=color.rgb(35, 60, 120), scale=(0.22, 0.65, 0.22), x=0.18, y=0.2)

        Entity(parent=self.head, model="cube", color=color.black, scale=(0.08, 0.08, 0.03), position=(-0.13, 0.08, -0.28))
        Entity(parent=self.head, model="cube", color=color.black, scale=(0.08, 0.08, 0.03), position=(0.13, 0.08, -0.28))
        Entity(parent=self.head, model="cube", color=color.black, scale=(0.22, 0.06, 0.03), position=(0, -0.12, -0.28))

    def update(self):
        if dead:
            return

        self.hit_cooldown -= time.dt

        direction = player.position - self.position
        distance = direction.length()

        if distance < 16:
            direction.y = 0

            if direction.length() > 0:
                self.position += direction.normalized() * self.speed * time.dt
                self.look_at(Vec3(player.x, self.y, player.z))

                walk = math.sin(time.time() * 8)
                self.left_leg.rotation_x = walk * 25
                self.right_leg.rotation_x = -walk * 25
                self.left_arm.rotation_x = -walk * 20
                self.right_arm.rotation_x = walk * 20

        self.y = height_at(round(self.x), round(self.z)) + 1

        if distance < 1.5 and self.hit_cooldown <= 0:
            take_damage(0.5 if armour_on else 1)
            self.hit_cooldown = 1.2

def spawn_zombies():
    for _ in range(4):
        x = random.randint(-12, 12)
        z = random.randint(-12, 12)
        y = height_at(x, z) + 1
        mobs.append(Zombie((x, y, z)))

player = FirstPersonController()
player.position = (0, 8, 0)
player.speed = 5
player.jump_height = 1.4
player.gravity = 0.6

load_near_player()
spawn_zombies()

Sky(color=color.rgb(135, 206, 235))
sun = DirectionalLight()
sun.rotation = (45, -45, 45)
ambient = AmbientLight(color=color.rgba(160, 160, 160, 255))

Text("+", position=(0, 0), origin=(0, 0), scale=2)

help_text = Text(
    "WASD Move | Space Jump | Shift Sprint | Ctrl Sneak | R Attack/Destroy | E Place/Wear Armour | 1-9 Select",
    position=(-0.72, 0.46),
    scale=0.65,
    background=True
)

selected_text = Text("", position=(-0.1, -0.36), scale=1, background=True)
armour_text = Text("", position=(0.35, -0.36), scale=0.9, background=True)

hearts = [
    Text(parent=camera.ui, text="♥", position=(-0.42 + i * 0.04, -0.32), scale=1.8, color=color.red)
    for i in range(10)
]

foods = [
    Text(parent=camera.ui, text="●", position=(0.05 + i * 0.04, -0.32), scale=1.5, color=color.orange)
    for i in range(10)
]

death_text = Text("", origin=(0, 0), scale=3, color=color.red, background=True)

hotbar = []

for i in range(9):
    item_id = i + 1

    slot = Entity(
        parent=camera.ui,
        model="quad",
        scale=(0.07, 0.07),
        position=(-0.32 + i * 0.08, -0.44),
        color=color.rgba(40, 40, 40, 180)
    )

    if item_types[item_id] == "block":
        Entity(parent=slot, model="quad", scale=0.62, texture=block_textures[item_id])
    elif item_types[item_id] == "sword":
        Entity(parent=slot, model="cube", scale=(0.16, 0.55, 0.05), rotation_z=-35, color=color.rgb(200, 200, 200))
    elif item_types[item_id] == "armour":
        Entity(parent=slot, model="cube", scale=(0.45, 0.45, 0.05), color=color.cyan)

    count = Text(parent=slot, text=str(inventory[item_id]), position=(0.1, -0.25), scale=5)
    Text(parent=slot, text=str(item_id), position=(-0.32, 0.25), scale=7)

    hotbar.append((slot, count, item_id))

held_item = Entity(
    parent=camera.ui,
    model="cube",
    scale=(0.08, 0.3, 0.05),
    position=(0.55, -0.28),
    rotation_z=-35,
    color=color.rgb(200, 200, 200),
    enabled=False
)

chunk_timer = 0
fall_start_y = None

def take_damage(amount):
    global health, dead

    if dead:
        return

    health -= amount

    if health <= 0:
        health = 0
        dead = True
        death_text.text = "YOU DIED\nPress R to respawn"
        player.enabled = False
        mouse.locked = False

def respawn():
    global health, hunger, dead

    health = 10
    hunger = 10
    dead = False

    death_text.text = ""
    player.position = (0, 8, 0)
    player.enabled = True
    mouse.locked = True

def attack_zombie(z):
    damage_amount = 3 if selected_item == 8 else 1
    z.health -= damage_amount

    z.body.color = color.red
    z.head.color = color.red
    z.left_arm.color = color.red
    z.right_arm.color = color.red
    z.left_leg.color = color.red
    z.right_leg.color = color.red

    def restore():
        if z in mobs:
            z.body.color = color.rgb(40, 120, 55)
            z.head.color = color.rgb(70, 170, 85)
            z.left_arm.color = color.rgb(45, 130, 60)
            z.right_arm.color = color.rgb(45, 130, 60)
            z.left_leg.color = color.rgb(35, 60, 120)
            z.right_leg.color = color.rgb(35, 60, 120)

    invoke(restore, delay=0.15)

    if z.health <= 0:
        if z in mobs:
            mobs.remove(z)
        destroy(z)

def destroy_block(block):
    inventory[block.block_type] += 1
    blocks.pop(pos_key(block.position), None)
    destroy(block)

def update_ui():
    for i, h in enumerate(hearts):
        h.text = "♥" if i < math.ceil(health) else "♡"
        h.color = color.red if i < math.ceil(health) else color.gray

    for i, f in enumerate(foods):
        f.text = "●" if i < math.ceil(hunger) else "○"
        f.color = color.orange if i < math.ceil(hunger) else color.gray

    for slot, count, item_id in hotbar:
        count.text = str(inventory[item_id])

        if item_id == selected_item:
            slot.scale = (0.09, 0.09)
            slot.color = color.gold
        else:
            slot.scale = (0.07, 0.07)
            slot.color = color.rgba(40, 40, 40, 180)

    selected_text.text = item_names[selected_item]
    armour_text.text = "Armour: ON" if armour_on else "Armour: OFF"

    held_item.enabled = selected_item == 8

def input(key):
    global selected_item, armour_on

    if dead:
        if key == "r":
            respawn()
        return

    if key in ["1","2","3","4","5","6","7","8","9"]:
        selected_item = int(key)

    if key == "scroll up":
        selected_item = 1 if selected_item >= 9 else selected_item + 1

    if key == "scroll down":
        selected_item = 9 if selected_item <= 1 else selected_item - 1

    if key == "e":
        if selected_item == 9:
            armour_on = True

        elif item_types[selected_item] == "block":
            if mouse.hovered_entity and isinstance(mouse.hovered_entity, Block):
                if inventory[selected_item] > 0:
                    new_pos = mouse.hovered_entity.position + mouse.normal

                    if pos_key(new_pos) not in blocks:
                        make_block(new_pos, selected_item)
                        inventory[selected_item] -= 1

    if key == "r":
        target = mouse.hovered_entity

        if target:
            zombie = None

            if isinstance(target, Zombie):
                zombie = target
            elif hasattr(target, "parent") and isinstance(target.parent, Zombie):
                zombie = target.parent

            if zombie:
                attack_zombie(zombie)
            elif isinstance(target, Block):
                destroy_block(target)

def update():
    global chunk_timer, hunger, fall_start_y

    if dead:
        return

    chunk_timer += time.dt

    if chunk_timer > 0.8:
        load_near_player()
        chunk_timer = 0

    if held_keys["shift"] and hunger > 0:
        player.speed = 8
        hunger = max(0, hunger - time.dt * 0.03)
    elif held_keys["control"]:
        player.speed = 2
    else:
        player.speed = 5

    if not player.grounded:
        if fall_start_y is None:
            fall_start_y = player.y
    else:
        if fall_start_y is not None:
            fall_distance = fall_start_y - player.y

            if fall_distance > 8:
                take_damage(int(fall_distance - 7))

            fall_start_y = None

    if player.y < -25:
        take_damage(1)
        player.position = (0, 8, 0)

    day = time.time() * 0.04
    brightness = (math.sin(day) + 1) / 2
    ambient.color = color.rgba(
        110 + brightness * 90,
        110 + brightness * 90,
        120 + brightness * 90,
        255
    )

    update_ui()

    if held_keys["escape"]:
        application.quit()

app.run()