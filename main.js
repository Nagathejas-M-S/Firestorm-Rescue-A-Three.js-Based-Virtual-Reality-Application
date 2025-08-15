import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// --- GLOBAL VARIABLES ---
let scene, camera, renderer, houseModel, characterModel, fireExtinguisherModel, mixer;
const clock = new THREE.Clock();
const move = { forward: false, backward: false, left: false, right: false };
let isPaused = false, isGameOver = false, hasExtinguisher = false, canPickUpExtinguisher = true, isShooting = false;
let collisionObjects = [], fireEffects = [], smokeEffects = [], ashEffects = [];
let playerHealth = 100;
let actions = { walking: null, picking: null, pain: null, shooting: null };
let gameStartTime = null;
let gameTimeLimit = 180000 * 3; // 9 minutes
let timerInterval = null;
let isGameActive = false;
const HEALTH_DECREASE_AMOUNT = 5;
const HEALTH_UPDATE_COOLDOWN = 1000;
let lastHealthUpdateTime = 0;
let lastPainTime = 0;
const PAIN_COOLDOWN = 2000;
let initialMaxTotalIntensity = 0;
let isPainAnimationActive = false; // New flag for pain animation state

document.getElementById('custom-modal').style.display = 'none';

// --- LOADING MANAGER ---
const loadingManager = new THREE.LoadingManager();
loadingManager.onStart = () => {
    document.getElementById('loadingScreen').style.display = 'flex';
};
loadingManager.onLoad = () => {
    document.getElementById('loadingScreen').style.display = 'none';
    document.querySelector('.canvas_webgl').style.display = 'block';
    animate();
};
loadingManager.onError = (url) => console.error(`Error loading ${url}`);

// --- LOADERS ---
const gltfLoader = new GLTFLoader(loadingManager);
const fbxLoader = new FBXLoader(loadingManager);
const dracoLoader = new DRACOLoader(loadingManager);
dracoLoader.setDecoderPath('/node_modules/three/examples/jsm/libs/draco/');
gltfLoader.setDRACOLoader(dracoLoader);

// --- EVENT LISTENERS ---
document.getElementById('startGame').addEventListener('click', () => {
    document.getElementById('ui-screen').style.display = 'none';
    init(); 
    loadAllModels();
});
document.getElementById('instructions').addEventListener('click', instruction_a);
document.getElementById('endGame').addEventListener('click', endGame_c);
document.getElementById('pauseButton').addEventListener('click', togglePause);
document.getElementById('bagIcon').addEventListener('click', openInventory);
document.querySelector('#inventoryModal .close').addEventListener('click', closeInventory);

window.addEventListener('resize', onWindowResize);
document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);

// --- MODEL LOADING ---
function loadAllModels() {
    loadHouseModel();
    loadCharacterModel();
    loadCollisionModel();
    loadFireExtinguisherModel();
}

function loadHouseModel() {
    gltfLoader.load('/home.glb', (gltf) => {
        houseModel = gltf.scene;
        scene.add(houseModel);
    });
}

function loadFireExtinguisherModel() {
    gltfLoader.load('/fire_extinguisher.glb', (gltf) => {
        fireExtinguisherModel = gltf.scene;
        fireExtinguisherModel.scale.set(0.7, 0.7, 0.7);
        fireExtinguisherModel.position.set(15, 6, -4.3);
        scene.add(fireExtinguisherModel);
    });
}

function loadCollisionModel() {
    gltfLoader.load('/home_outline1.glb', (gltf) => {
        gltf.scene.traverse((child) => {
            if (child.isMesh) {
                collisionObjects.push(new THREE.Box3().setFromObject(child));
            }
        });
        gltf.scene.visible = false;
        scene.add(gltf.scene);
    });
}
        
function loadCharacterModel() {
    fbxLoader.load('/jatka.fbx', (fbx) => {
        characterModel = fbx;
        characterModel.position.set(4, 2, 4);
        characterModel.scale.set(0.03, 0.025, 0.03);
        characterModel.rotation.y = Math.PI; // Initial forward facing direction
        scene.add(characterModel);

        mixer = new THREE.AnimationMixer(characterModel);
        
        // Base walking/idle animation
        actions.walking = mixer.clipAction(fbx.animations[0]);
        actions.walking.play();
        actions.walking.paused = true; // Start paused for idle pose

        // Picking animation
        fbxLoader.load('/Pick_Fruit.fbx', (anim) => { 
            actions.picking = mixer.clipAction(anim.animations[0]);
            actions.picking.setLoop(THREE.LoopOnce);
            actions.picking.clampWhenFinished = true;
            
        });
        // Pain animation
        fbxLoader.load('/Pain.fbx', (anim) => { 
            actions.pain = mixer.clipAction(anim.animations[0]);
            actions.pain.setLoop(THREE.LoopOnce);
            actions.pain.clampWhenFinished = true;
        });
        // Shooting animation
        fbxLoader.load('/Shooting.fbx', (anim) => {
            actions.shooting = mixer.clipAction(anim.animations[0]);
            actions.shooting.setLoop(THREE.LoopRepeat);
        });
    });
}

// --- CORE GAME LOGIC ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101010);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.querySelector('.canvas_webgl') });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    ['pauseButton', 'bagIcon', 'fireStrengthContainer', 'timercontainer', 'HealthBarContainer'].forEach(id => {
        document.getElementById(id).style.display = 'block';
    });

    fireEffects.push(new FireEffect(scene, new THREE.Vector3(15, 1, 13)));
    fireEffects.push(new FireEffect(scene, new THREE.Vector3(15, 1, 5)));
    fireEffects.push(new FireEffect(scene, new THREE.Vector3(13, 1, 13)));
    fireEffects.push(new FireEffect(scene, new THREE.Vector3(13, 1, 5)));
    fireEffects.push(new FireEffect(scene, new THREE.Vector3(11, 1, 13)));
    fireEffects.push(new FireEffect(scene, new THREE.Vector3(11, 1, 5)));
    fireEffects.push(new FireEffect(scene, new THREE.Vector3(10, 1, 5)));
    
    initialMaxTotalIntensity = fireEffects.reduce((sum, fire) => sum + fire.maxIntensity, 0);

    const fireSound = document.getElementById('fireSound');
    if (fireSound) {
        fireSound.loop = true; // Ensure fire sound loops
        fireSound.play().catch(e => console.log("Fire audio play failed:", e));
    }
    
    startGameTimer();
    updateHealthDisplay();
}

function animate() {
    if (isGameOver) return;
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (isPaused || !characterModel) return;

    if (mixer) {
        mixer.update(delta);
    }

    fireEffects.forEach(effect => effect.update(delta));
    smokeEffects.forEach(effect => effect.update(delta));
    ashEffects.forEach(effect => effect.update(delta));
    
    handleMovement(delta);
    updateCameraPosition();
    checkGameConditions();
    updateGameTimer();
    checkSmokeFireCollisions();
    
    renderer.render(scene, camera);
}
        
function handleMovement(delta) {
    if (!characterModel) return;
    const moveSpeed = 5 * delta;
    const rotationSpeed = 3 * delta;

    const moveVector = new THREE.Vector3();
    let isMovingSideways = false; // Flag to check for sideways movement

    if (move.forward) moveVector.z += moveSpeed;
    if (move.backward) moveVector.z -= moveSpeed;
    
    // Only allow rotation if pain animation is not active
    if (!isPainAnimationActive) { 
        if (move.left) characterModel.rotation.y += rotationSpeed;
        if (move.right) characterModel.rotation.y -= rotationSpeed;
    } else {
        // If pain animation is active, allow sideways movement (strafing)
        // without changing character rotation.
        if (move.left) {
            moveVector.x -= moveSpeed; // Move left relative to character's current facing
            isMovingSideways = true;
        }
        if (move.right) {
            moveVector.x += moveSpeed; // Move right relative to character's current facing
            isMovingSideways = true;
        }
    }

    // Apply character's current quaternion to the moveVector to move relative to its facing
    if (moveVector.lengthSq() > 0) {
        moveVector.applyQuaternion(characterModel.quaternion);
        const newPosition = characterModel.position.clone().add(moveVector);
        if (!willCollide(newPosition)) {
            characterModel.position.copy(newPosition);
        }
    }

    // This part handles toggling between walking and idle, but ONLY if
    // no other special animation is currently running.
    // Adjusted to consider sideways movement for walking animation
    const isMoving = move.forward || move.backward || isMovingSideways;
    if (actions.walking && !actions.picking.isRunning() && !actions.shooting.isRunning() && !isPainAnimationActive) {
        if (isMoving && actions.walking.paused) {
            actions.walking.paused = false;
            document.getElementById('walkingSound').play();
        } else if (!isMoving && !actions.walking.paused) {
            actions.walking.paused = true;
            document.getElementById('walkingSound').pause();
        }
    }
}

function willCollide(newPosition) {
    if (!characterModel) return false;
    const characterBox = new THREE.Box3().setFromCenterAndSize(
        newPosition.clone().add(new THREE.Vector3(0, 1.5, 0)),
        new THREE.Vector3(0.8, 3, 0.8)
    );
    for (const box of collisionObjects) {
        if (characterBox.intersectsBox(box)) return true;
    }
    return false;
}

function updateCameraPosition() {
    if (!characterModel) return;
    const cameraTarget = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();

    cameraPosition.copy(characterModel.position);
    const offset = new THREE.Vector3(0, 5, -4).applyQuaternion(characterModel.quaternion);
    cameraPosition.add(offset);
    
    camera.position.lerp(cameraPosition, 0.1);
    
    cameraTarget.copy(characterModel.position).add(new THREE.Vector3(0, 1.5, 0));
    camera.lookAt(cameraTarget);
}

function checkGameConditions() {
    // Check for fire collision and play pain animation
    if (checkFireCollision()) {
        const currentTime = Date.now();
        const painSound = document.getElementById('painSound');
        
        // Only play pain sound if it's not already playing and within cooldown
        if (painSound.paused || currentTime - lastPainTime > PAIN_COOLDOWN) {
            painSound.currentTime = 0; // Rewind to start
            painSound.play().catch(e => console.log("Pain audio play failed:", e));
            painSound.volume = 1;
        }

        if (currentTime - lastPainTime > PAIN_COOLDOWN) {
            // Update health with the same cooldown as pain animation
            if (currentTime - lastHealthUpdateTime > HEALTH_UPDATE_COOLDOWN) {
                playerHealth = Math.max(0, playerHealth - HEALTH_DECREASE_AMOUNT);
                updateHealthDisplay();
                lastHealthUpdateTime = currentTime;
            }
            
            if (actions.pain && !actions.pain.isRunning()) {
                // Stop other animations
                Object.keys(actions).forEach(key => {
                    if (key !== 'pain' && actions[key]) {
                        actions[key].stop();
                    }
                });
                document.getElementById('walkingSound').pause();
                document.getElementById('shootingSound').pause();
                isShooting = false; // Also reset shooting state if player gets hurt while shooting
                
                // Play pain animation
                actions.pain.reset();
                actions.pain.play();
                isPainAnimationActive = true; // Set flag to true when pain animation starts
                // Immediately force character to face initial forward direction
                characterModel.rotation.y = Math.PI; 
                lastPainTime = currentTime;
                
                // Use mixer's 'finished' event for reliable animation completion
                const onPainFinished = (e) => {
                    if (e.action === actions.pain) {
                        isPainAnimationActive = false; // Set flag to false when pain animation finishes
                        const isMoving = move.forward || move.backward || move.left || move.right; // Check all movement keys
                        if (actions.walking) {
                            actions.walking.reset().play();
                            actions.walking.paused = !isMoving;
                            if (isMoving) {
                                document.getElementById('walkingSound').play();
                            } else {
                                // If not moving, ensure character is still facing initial forward direction
                                characterModel.rotation.y = Math.PI; 
                            }
                        }
                        // Remove the listener to prevent it from firing multiple times
                        mixer.removeEventListener('finished', onPainFinished);
                    }
                };
                mixer.addEventListener('finished', onPainFinished);
            }

            if (playerHealth <= 0) handleGameOver("You succumbed to the flames.");
        }
    }
    else {
        // If not in fire, pause pain sound
        const painSound = document.getElementById('painSound');
        if (!painSound.paused) {
            painSound.pause();
            painSound.currentTime = 0;
        }
    }

    if (canPickUpExtinguisher && isPlayerNearFireExtinguisher()) {
        // Future UI prompt can be added here
    }

    let totalIntensity = fireEffects.reduce((sum, fire) => sum + fire.currentIntensity, 0);
    let fireStrength = initialMaxTotalIntensity > 0 ? Math.round((totalIntensity / initialMaxTotalIntensity) * 100) : 0;
    updateFireStrengthDisplay(fireStrength);
    if (fireStrength <= 0 && !isGameOver) {
        endGame_d();
    }
}

function isPlayerNearFireExtinguisher() {
    if (!characterModel || !fireExtinguisherModel) return false;
    return characterModel.position.distanceTo(fireExtinguisherModel.position) < 6;
}

function checkFireCollision() {
    if (!characterModel) return false;
    for (const fire of fireEffects) {
        if (characterModel.position.distanceTo(fire.position) < 2.5) {
            return true;
        }
    }
    return false;
}

// --- EVENT HANDLERS ---
function handleKeyDown(event) {
    switch(event.key.toLowerCase()) {
        case 'w': 
            move.forward = true; 
            break;
        case 's': 
            move.backward = true; 
            break;
        case 'a': move.left = true; break;
        case 'd': move.right = true; break;
        case 'e':
            if (canPickUpExtinguisher && isPlayerNearFireExtinguisher()) {
                hasExtinguisher = true;
                canPickUpExtinguisher = false;
                fireExtinguisherModel.visible = false;
                document.getElementById('extinguisherBox').innerHTML = `<img src="/fire2.png" alt="Extinguisher" style="width: 100%; height: 100%;" />`;
                
                if (actions.picking && mixer) {
                    // Stop walking animation and sound
                    if(actions.walking) actions.walking.stop();
                    document.getElementById('walkingSound').pause();

                    // Play the picking animation once
                    actions.picking.reset().play();

                    // Use the mixer's 'finished' event to know when the animation is done
                    const onPickFinished = (e) => {
                        // Ensure this listener only reacts to the picking animation
                        if (e.action === actions.picking) {
                            // Restore the walking/idle state based on current movement keys
                            const isMoving = move.forward || move.backward || move.left || move.right; // Check all movement keys
                            if (actions.walking) {
                                actions.walking.reset().play();
                                actions.walking.paused = !isMoving;
                                if (isMoving) {
                                    document.getElementById('walkingSound').play();
                                }
                            }
                            // Clean up the event listener to prevent it from firing again
                            mixer.removeEventListener('finished', onPickFinished);
                        }
                    };
                    mixer.addEventListener('finished', onPickFinished);
                }
            }
            break;
        case 'f':
            if (hasExtinguisher && !isShooting) {
                isShooting = true;

                // Stop walking animation and start shooting animation
                if (actions.walking) actions.walking.stop();
                document.getElementById('walkingSound').pause();
                if (actions.shooting) actions.shooting.reset().play();

                const shootingSound = document.getElementById('shootingSound');
                if (shootingSound) {
                    shootingSound.currentTime = 0;
                    shootingSound.play().catch(e => console.log("Shooting audio play failed:", e));
                }

                if (characterModel) {
                    const direction = new THREE.Vector3(0, 0, 1);
                    direction.applyQuaternion(characterModel.quaternion);
                    const smokePosition = characterModel.position.clone()
                        .add(direction.multiplyScalar(2))
                        .add(new THREE.Vector3(0, 1.5, 0));
                    
                    const smokeEffect = new SmokeEffect(scene, smokePosition);
                    smokeEffects.push(smokeEffect);
                    
                    setTimeout(() => {
                        const index = smokeEffects.indexOf(smokeEffect);
                        if (index > -1) {
                            smokeEffect.dispose();
                            smokeEffects.splice(index, 1);
                        }
                    }, smokeEffect.lifespan);
                }
            }
            break;
    }
}

function handleKeyUp(event) {
     switch(event.key.toLowerCase()) {
        case 'w': 
            move.forward = false; 
            break;
        case 's': 
            move.backward = false; 
            break;
        case 'a': move.left = false; break;
        case 'd': move.right = false; break;
        case 'f':
            if (isShooting) {
                isShooting = false;

                // Stop shooting animation and sound
                if (actions.shooting) actions.shooting.stop(); // Corrected: actions.shooting.stop()
                const shootingSound = document.getElementById('shootingSound');
                if (shootingSound && !shootingSound.paused) {
                    shootingSound.pause();
                    shootingSound.currentTime = 0;
                }

                // Restore the walking/idle state based on current movement keys
                const isMoving = move.forward || move.backward || move.left || move.right; // Check all movement keys
                if (actions.walking) {
                    actions.walking.reset().play();
                    actions.walking.paused = !isMoving;
                    if (isMoving) {
                        document.getElementById('walkingSound').play();
                    }
                }
            }
            break;
    }
}
        
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- UI & GAME STATE FUNCTIONS ---
function togglePause() {
    isPaused = !isPaused;
    document.getElementById('pauseButton').textContent = isPaused ? 'Resume' : 'Pause';
}
function openInventory() { document.getElementById('inventoryModal').style.display = 'flex'; }
function closeInventory() { document.getElementById('inventoryModal').style.display = 'none'; }

function showModal(type, title, text, onConfirm) {
    const modal = document.getElementById('custom-modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-text').innerHTML = text;

    const okButton = document.getElementById('modal-ok');
    const confirmButton = document.getElementById('modal-confirm');
    const cancelButton = document.getElementById('modal-cancel');

    okButton.style.display = 'none';
    confirmButton.style.display = 'none';
    cancelButton.style.display = 'none';

    if (type === 'alert') {
        okButton.style.display = 'inline-block';
        okButton.onclick = () => modal.style.display = 'none';
    } else if (type === 'confirm') {
        confirmButton.style.display = 'inline-block';
        cancelButton.style.display = 'inline-block';
        confirmButton.onclick = () => {
            modal.style.display = 'none';
            if (onConfirm) onConfirm(true);
        };
        cancelButton.onclick = () => {
            modal.style.display = 'none';
            if (onConfirm) onConfirm(false);
        };
    }
    modal.style.display = 'flex';
}

function instruction_a() {
    const instructionsText = `
        <ul style="list-style: none; padding: 0;">
            <li style="text-align: left; margin-bottom: 10px;">- Use W, A, S, D to move.</li>
            <li style="text-align: left; margin-bottom: 10px;">- Find the fire extinguisher.</li>
            <li style="text-align: left; margin-bottom: 10px;">- Press 'E' to pick up the extinguisher.</li>
            <li style="text-align: left; margin-bottom: 10px;">- Press 'F' to use the extinguisher and put out the fires.</li>
            <li style="text-align: left;">- Save the person inside the house before the time runs out!</li>
        </ul>
    `;
    showModal('alert', 'Instructions', instructionsText);
}
function endGame_c() {
    showModal('confirm', 'End Game', 'Are you sure you want to quit the game?', (confirmed) => {
        if (confirmed) {
            handleGameOver("You quit the mission.");
        }
    });
}
function endGame_d() {
    isGameOver = true;
    document.body.innerHTML = '<div class="container"><h1>Mission Passed!</h1><p>You have successfully extinguished all fires.</p></div>';
}

function startGameTimer() {
    if (isGameActive) return;
    isGameActive = true;
    gameStartTime = Date.now();
}

function updateGameTimer() {
    if (!isGameActive) return;
    const elapsedTime = Date.now() - gameStartTime;
    const remainingTime = Math.max(0, gameTimeLimit - elapsedTime);
    const minutes = Math.floor(remainingTime / 60000);
    const seconds = Math.floor((remainingTime % 60000) / 1000);
    document.getElementById('gameTimer').innerHTML = `<i class="lol">Timer: ${minutes}:${seconds.toString().padStart(2, '0')}</i>`;

    if (remainingTime <= 0) {
        handleGameOver("Time's up!");
    }
}

function updateHealthDisplay() {
    const healthBar = document.getElementById('HealthBar');
    healthBar.style.width = playerHealth + '%';
    healthBar.textContent = `Health: ${playerHealth}%`;
    if (playerHealth < 30) healthBar.style.backgroundColor = 'red';
    else if (playerHealth < 70) healthBar.style.backgroundColor = 'orange';
    else healthBar.style.backgroundColor = 'green';
}
function updateFireStrengthDisplay(strength) {
     document.getElementById('fireStrengthBar').textContent = `Fire Strength: ${strength}%`;
}
function handleGameOver(message) {
    isGameOver = true;
    document.body.innerHTML = `<div class="container"><h1>Game Over!</h1><p>${message}</p></div>`;
}
        
// --- PARTICLE EFFECT CLASSES ---
class FireEffect {
    constructor(scene, position = new THREE.Vector3()) {
        this.scene = scene;
        this.position = position;
        this.baseParticleCount = 300;
        this.maxParticleCount = 1500;
        this.currentParticleCount = this.baseParticleCount;
        this.particleSize = 1.7;
        this.baseLifetime = 1.2;
        this.lifetimeRandomness = 0.7;
        this.baseSpeed = 2.0;
        this.speedRandomness = 0.8;
        this.growthRate = 0.06;
        this.maxIntensity = 2.5;
        this.currentIntensity = 1.0;
        this.widthGrowthMultiplier = 1.1;
        this.heightGrowthMultiplier = 0.4;
        this.growthStartTime = Date.now();
        this.particleGrowthRate = 75;
        this.lastParticleIncrease = Date.now();
        this.baseSpreadX = 0.5;
        this.baseSpreadZ = 0.2;
        this.baseHeight = 2.5;
        this.turbulenceFrequency = 1.5;
        this.turbulenceStrength = 0.3;
        this.time = 0;
        this.maxHealth = 100;
        this.currentHealth = 100;
        this.recoveryRate = 2;
        this.lastHitTime = 0;
        this.damageResistance = 0.8;
        this.isRecovering = false;
        this.recoveryDelay = 2000;
        this.healthBasedParticleCount = this.currentParticleCount;
        this.initParticles(this.maxParticleCount);
        this.initLight();
    }

    initParticles(maxCount) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(maxCount * 3);
        const sizes = new Float32Array(maxCount);
        const lives = new Float32Array(maxCount);
        const temperatures = new Float32Array(maxCount);
        this.velocities = [];
        this.lifetimes = [];
        this.active = new Array(maxCount).fill(false);
        for (let i = 0; i < this.baseParticleCount; i++) {
            this.active[i] = true;
            this.resetParticle(i, positions, sizes, lives, temperatures, true);
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('life', new THREE.BufferAttribute(lives, 1));
        geometry.setAttribute('temperature', new THREE.BufferAttribute(temperatures, 1));
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                baseColor: { value: new THREE.Color(0xFF5500) },
                intensity: { value: 1.0 }
            },
            vertexShader: `
                attribute float size;
                attribute float life;
                attribute float temperature;
                varying float vLife;
                varying float vTemperature;
                void main() {
                    vLife = life;
                    vTemperature = temperature;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 baseColor;
                uniform float intensity;
                uniform float time;
                varying float vLife;
                varying float vTemperature;
                vec3 colorTemperature(float temp) {
                    vec3 color1 = vec3(1.0, 0.2, 0.05);
                    vec3 color2 = vec3(1.0, 0.4, 0.1);
                    vec3 color3 = vec3(0.6, 0.3, 0.1);
                    if (temp > 0.66) {
                        return mix(color2, color1, (temp - 0.66) * 3.0);
                    } else if (temp > 0.33) {
                        return mix(color3, color2, (temp - 0.33) * 3.0);
                    } else {
                        return mix(vec3(0.3, 0.2, 0.1), color3, temp * 3.0);
                    }
                }
                void main() {
                    float alpha = smoothstep(0.0, 0.2, vLife);
                    alpha *= smoothstep(1.0, 0.7, vLife);
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    alpha *= smoothstep(0.5, 0.2, dist);
                    vec3 particleColor = colorTemperature(vTemperature);
                    float flicker = sin(time * 10.0 + gl_FragCoord.x * 0.1) * 0.05;
                    vec3 finalColor = particleColor * (1.2 + flicker) * intensity;
                    finalColor *= mix(1.0, 0.7, vLife);
                    gl_FragColor = vec4(finalColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        this.particles = new THREE.Points(geometry, material);
        this.particles.position.copy(this.position);
        this.scene.add(this.particles);
    }

    initLight() {
        this.light = new THREE.PointLight(0xFF5500, 1.5, 8);
        this.light.position.copy(this.position);
        this.scene.add(this.light);
        this.flickerLight = new THREE.PointLight(0xFF8866, 0.5, 4);
        this.flickerLight.position.copy(this.position);
        this.scene.add(this.flickerLight);
    }

    takeDamage(amount) {
        const actualDamage = amount * (1 - this.damageResistance);
        this.currentHealth = Math.max(0, this.currentHealth - actualDamage);
        this.lastHitTime = Date.now();
        this.isRecovering = false;
        const healthPercentage = this.currentHealth / this.maxHealth;
        this.healthBasedParticleCount = Math.floor(this.baseParticleCount * healthPercentage);
        this.currentIntensity = Math.max(0.5, this.maxIntensity * healthPercentage);
        this.particleSize *= (0.95 + (healthPercentage * 0.05));
        this.baseSpeed *= (0.95 + (healthPercentage * 0.05));
        return this.currentHealth <= 0;
    }

    recover(deltaTime) {
        const now = Date.now();
        if (!this.isRecovering && now - this.lastHitTime > this.recoveryDelay) {
            this.isRecovering = true;
        }
        if (this.isRecovering && this.currentHealth < this.maxHealth) {
            this.currentHealth = Math.min(this.maxHealth, this.currentHealth + (this.recoveryRate * deltaTime));
            const healthPercentage = this.currentHealth / this.maxHealth;
            this.healthBasedParticleCount = Math.floor(this.baseParticleCount * healthPercentage);
            this.currentIntensity = Math.max(0.5, this.maxIntensity * healthPercentage);
        }
    }
    
    resetParticle(i, positions, sizes, lives, temperatures, initial = false) {
        const offset = i * 3;
        const widthSpread = this.baseSpreadX * (1 + (this.currentIntensity - 1) * this.widthGrowthMultiplier);
        const heightSpread = this.baseHeight * (1 + (this.currentIntensity - 1) * this.heightGrowthMultiplier);
        const radius = Math.random() * widthSpread;
        const angle = Math.random() * Math.PI * 2;
        positions[offset] = Math.cos(angle) * radius;
        positions[offset + 1] = initial ? Math.random() * heightSpread * 0.2 : 0;
        positions[offset + 2] = Math.sin(angle) * radius;
        const heightRatio = positions[offset + 1] / heightSpread;
        sizes[i] = this.particleSize * (1.3 - heightRatio * 0.6) * this.currentIntensity;
        lives[i] = initial ? Math.random() : 0;
        this.lifetimes[i] = this.baseLifetime + Math.random() * this.lifetimeRandomness;
        temperatures[i] = Math.max(0.2, Math.min(1.0, 0.8 + Math.random() * 0.4 - (radius / widthSpread) * 0.3));
        const speed = this.baseSpeed + Math.random() * this.speedRandomness;
        const horizontalSpeed = speed * 0.3 * this.currentIntensity;
        this.velocities[i] = new THREE.Vector3(
            (Math.random() - 0.5) * horizontalSpeed,
            speed * (1 + (this.currentIntensity - 1) * this.heightGrowthMultiplier),
            (Math.random() - 0.5) * horizontalSpeed
        );
    }
    
    updateGrowth(deltaTime) {
        const timeSinceStart = (Date.now() - this.growthStartTime) / 1000;
        this.currentIntensity = Math.min(this.maxIntensity, 1.0 + (timeSinceStart * this.growthRate));
        const now = Date.now();
        const timeSinceLastIncrease = (now - this.lastParticleIncrease) / 1000;
        const particlesToAdd = Math.floor(timeSinceLastIncrease * this.particleGrowthRate);
        if (particlesToAdd > 0 && this.currentParticleCount < this.maxParticleCount) {
            const newParticleCount = Math.min(this.currentParticleCount + particlesToAdd, this.maxParticleCount);
            for (let i = this.currentParticleCount; i < newParticleCount; i++) {
                this.active[i] = true;
                this.resetParticle(i, this.particles.geometry.attributes.position.array, this.particles.geometry.attributes.size.array, this.particles.geometry.attributes.life.array, this.particles.geometry.attributes.temperature.array, true);
            }
            this.currentParticleCount = newParticleCount;
            this.lastParticleIncrease = now;
        }
    }
    
    update(deltaTime) {
        this.recover(deltaTime);
        this.currentParticleCount = Math.floor(this.healthBasedParticleCount * (this.currentIntensity / this.maxIntensity));
        this.time += deltaTime;
        this.updateGrowth(deltaTime);
        const positions = this.particles.geometry.attributes.position.array;
        const lives = this.particles.geometry.attributes.life.array;
        const temperatures = this.particles.geometry.attributes.temperature.array;
        for (let i = 0; i < this.currentParticleCount; i++) {
            if (!this.active[i]) continue;
            lives[i] += deltaTime / this.lifetimes[i];
            if (lives[i] >= 1.0) {
                this.resetParticle(i, positions, this.particles.geometry.attributes.size.array, lives, temperatures);
                continue;
            }
            const offset = i * 3;
            const turbulenceX = Math.sin(this.time * this.turbulenceFrequency + positions[offset + 1]) * this.turbulenceStrength;
            const turbulenceZ = Math.cos(this.time * this.turbulenceFrequency + positions[offset + 1]) * this.turbulenceStrength;
            positions[offset] += (this.velocities[i].x + turbulenceX) * deltaTime;
            positions[offset + 1] += this.velocities[i].y * deltaTime;
            positions[offset + 2] += (this.velocities[i].z + turbulenceZ) * deltaTime;
            temperatures[i] *= (1 - 0.1 * deltaTime);
        }
        this.particles.material.uniforms.time.value = this.time;
        this.particles.material.uniforms.intensity.value = this.currentIntensity;
        this.particles.geometry.attributes.position.needsUpdate = true;
        this.particles.geometry.attributes.life.needsUpdate = true;
        this.particles.geometry.attributes.temperature.needsUpdate = true;
        const flicker = Math.sin(this.time * 15) * 0.15 + Math.sin(this.time * 7.3) * 0.1;
        const baseIntensity = 1.5 + flicker;
        this.light.intensity = baseIntensity * (1 + (this.currentIntensity - 1) * 0.7);
        const flickerOffset = new THREE.Vector3(Math.sin(this.time * 8) * 0.2, Math.cos(this.time * 10) * 0.1, Math.sin(this.time * 12) * 0.2);
        this.flickerLight.position.copy(this.position).add(flickerOffset);
        this.flickerLight.intensity = 0.5 + Math.sin(this.time * 20) * 0.2;
    }
    
    setPosition(position) {
        this.position.copy(position);
        this.particles.position.copy(position);
        this.light.position.copy(position);
        this.flickerLight.position.copy(position);
    }
    
    dispose() {
        this.scene.remove(this.particles);
        this.scene.remove(this.light);
        this.scene.remove(this.flickerLight);
        this.particles.geometry.dispose();
        this.particles.material.dispose();
    }
}

class SmokeEffect { 
    constructor(scene, position) {
        this.scene = scene;
        this.position = position;
        this.lifespan = 2000;
        this.particleCount = 300;
        this.particleSize = 2.0;
        this.baseLifetime = 2.0;
        this.baseSpeed = 1.5;
        this.initParticles();
    }
    initParticles() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        const sizes = new Float32Array(this.particleCount);
        const lives = new Float32Array(this.particleCount);
        const opacities = new Float32Array(this.particleCount);
        this.velocities = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.resetParticle(i, positions, sizes, lives, opacities, true);
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('life', new THREE.BufferAttribute(lives, 1));
        geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));
        const material = new THREE.ShaderMaterial({
            uniforms: { time: { value: 0.0 } },
            vertexShader: `
                attribute float size; attribute float life; attribute float opacity;
                varying float vLife; varying float vOpacity;
                void main() {
                    vLife = life; vOpacity = opacity;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying float vLife; varying float vOpacity;
                void main() {
                    float alpha = smoothstep(0.0, 0.2, vLife) * smoothstep(1.0, 0.8, vLife) * vOpacity;
                    vec2 center = gl_PointCoord - vec2(0.5);
                    alpha *= smoothstep(0.5, 0.2, length(center));
                    gl_FragColor = vec4(vec3(0.9), alpha * 0.6);
                }
            `,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.particles = new THREE.Points(geometry, material);
        this.particles.position.copy(this.position);
        this.scene.add(this.particles);
    }
    resetParticle(i, positions, sizes, lives, opacities, initial = false) {
        const offset = i * 3;
        const radius = Math.random() * 0.3;
        const angle = Math.random() * Math.PI * 2;
        positions[offset] = Math.cos(angle) * radius;
        positions[offset + 1] = Math.random() * 0.05;
        positions[offset + 2] = Math.sin(angle) * radius;
        sizes[i] = this.particleSize * (0.5 + Math.random() * 0.5);
        lives[i] = initial ? Math.random() : 0;
        opacities[i] = 0.3 + Math.random() * 0.3;
        const speed = this.baseSpeed * (0.8 + Math.random() * 0.4);
        this.velocities[i] = new THREE.Vector3((Math.random() - 0.5) * speed, speed * 0.2, (Math.random() - 0.5) * speed);
    }
    update(deltaTime) {
        const positions = this.particles.geometry.attributes.position.array;
        const lives = this.particles.geometry.attributes.life.array;
        const opacities = this.particles.geometry.attributes.opacity.array;
        for (let i = 0; i < this.particleCount; i++) {
            lives[i] += deltaTime / this.baseLifetime;
            if (lives[i] >= 1.0) {
                this.resetParticle(i, positions, this.particles.geometry.attributes.size.array, lives, opacities);
                continue;
            }
            const offset = i * 3;
            positions[offset] += this.velocities[i].x * deltaTime;
            positions[offset + 1] += this.velocities[i].y * deltaTime;
            positions[offset + 2] += this.velocities[i].z * deltaTime;
            opacities[i] *= (1 - 0.5 * deltaTime);
        }
        this.particles.geometry.attributes.position.needsUpdate = true;
        this.particles.geometry.attributes.life.needsUpdate = true;
        this.particles.geometry.attributes.opacity.needsUpdate = true;
    }
    dispose() {
        this.scene.remove(this.particles);
        this.particles.geometry.dispose();
        this.particles.material.dispose();
    }
}

class AshEffect { 
    constructor(scene, position) {
        this.scene = scene;
        this.position = position;
        this.particleCount = 100;
        this.particleSize = 0.5;
        this.lifetime = 3.0;
        this.initParticles();
    }
    initParticles() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        const sizes = new Float32Array(this.particleCount);
        const lives = new Float32Array(this.particleCount);
        this.velocities = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.resetParticle(i, positions, sizes, lives);
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('life', new THREE.BufferAttribute(lives, 1));
        const material = new THREE.ShaderMaterial({
            uniforms: { time: { value: 0.0 } },
            vertexShader: `
                attribute float size; attribute float life; varying float vLife;
                void main() {
                    vLife = life; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying float vLife;
                void main() {
                    float alpha = smoothstep(0.0, 0.1, vLife) * smoothstep(1.0, 0.9, vLife);
                    vec2 center = gl_PointCoord - vec2(0.5);
                    alpha *= smoothstep(0.5, 0.2, length(center));
                    gl_FragColor = vec4(vec3(0.2), alpha * 0.8);
                }
            `,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.particles = new THREE.Points(geometry, material);
        this.particles.position.copy(this.position);
        this.scene.add(this.particles);
    }
    resetParticle(i, positions, sizes, lives) {
        const offset = i * 3;
        const radius = Math.random() * 2;
        const angle = Math.random() * Math.PI * 2;
        positions[offset] = Math.cos(angle) * radius;
        positions[offset + 1] = Math.random() * 0.5;
        positions[offset + 2] = Math.sin(angle) * radius;
        sizes[i] = this.particleSize * (0.5 + Math.random() * 0.5);
        lives[i] = Math.random();
        this.velocities[i] = new THREE.Vector3((Math.random() - 0.5) * 0.2, -0.2 - Math.random() * 0.2, (Math.random() - 0.5) * 0.2);
    }
    update(deltaTime) {
        const positions = this.particles.geometry.attributes.position.array;
        const lives = this.particles.geometry.attributes.life.array;
        for (let i = 0; i < this.particleCount; i++) {
            lives[i] += deltaTime / this.lifetime;
            if (lives[i] >= 1.0) {
                this.resetParticle(i, positions, this.particles.geometry.attributes.size.array, lives);
                continue;
            }
            const offset = i * 3;
            positions[offset] += this.velocities[i].x * deltaTime;
            positions[offset + 1] += this.velocities[i].y * deltaTime;
            positions[offset + 2] += this.velocities[i].z * deltaTime;
        }
        this.particles.geometry.attributes.position.needsUpdate = true;
        this.particles.geometry.attributes.life.needsUpdate = true;
    }
    dispose() {
        this.scene.remove(this.particles);
        this.particles.geometry.dispose();
        this.particles.material.dispose();
    }
}

// Function to check for collisions between smoke effects and fire effects
function checkSmokeFireCollisions() {
    for (const smokeEffect of smokeEffects) {
        const smokePosition = new THREE.Vector3();
        smokeEffect.particles.getWorldPosition(smokePosition);
        
        for (let i = fireEffects.length - 1; i >= 0; i--) {
            const fireEffect = fireEffects[i];
            const distance = smokePosition.distanceTo(fireEffect.position);
            const collisionRadius = 2 * fireEffect.currentIntensity;
            
            if (distance < collisionRadius) {
                const impactFactor = 1 - (distance / collisionRadius);
                
                fireEffect.currentIntensity *= 0.95 - (impactFactor * 0.1);
                fireEffect.baseSpeed *= 0.98;
                
                if (Math.random() < impactFactor) {
                    const ashPosition = new THREE.Vector3(
                        fireEffect.position.x + (Math.random() - 0.5) * 3,
                        fireEffect.position.y,
                        fireEffect.position.z + (Math.random() - 0.5) * 3
                    );
                    const ashEffect = new AshEffect(fireEffect.scene, ashPosition);
                    ashEffects.push(ashEffect);
                }
                
                if (fireEffect.currentIntensity < 0.3 || fireEffect.baseSpeed < 0.5) {
                    fireEffect.dispose();
                    fireEffects.splice(i, 1);
                }
            }
        }
    }
}
