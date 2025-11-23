import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let camera, scene, renderer, controls;
const objects = []; // Blocos com colisão
const movingObjects = [];
let raycaster;
let scoreElement, timerElement;
let skyboxMesh;

// Variáveis globais de materiais e geometrias para reuso na geração de nível
let geometries = [];
let materialsList = [];

let currentDifficulty = 'EASY';
const difficultySettings = {
    EASY: { time: 300, height: 300, text: 'FÁCIL' },
    NORMAL: { time: 300, height: 500, text: 'NORMAL' },
    HARD: { time: 240, height: 600, text: 'DIFÍCIL' }
};
let currentWinHeight = difficultySettings[currentDifficulty].height;
let initialGameTime = difficultySettings[currentDifficulty].time;
let gameTime = initialGameTime;

let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let jumpCount = 0;
const MAX_JUMPS = 2;

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

let maxAltitudeScore = 0;
const MAP_BOUNDARY = 400;
let gameActive = false;
let isPaused = false;
let freeMode = false;
let timerInterval;
let finalScore = 0;
let playerName = 'Jogador';
let difficultyElement;
let winBoxMesh;
const playerHeight = 10.0;

let audioListener, backgroundMusic, jumpSound, imminentDangerMusic, audioLoader;

init();

function init() {
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.y = playerHeight;

    scene = new THREE.Scene();

    // --- AMBIENTE ---
    const cubeTextureLoader = new THREE.CubeTextureLoader();
    const textureCube = cubeTextureLoader.load([
        'https://threejs.org/examples/textures/cube/Bridge2/posx.jpg',
        'https://threejs.org/examples/textures/cube/Bridge2/negx.jpg',
        'https://threejs.org/examples/textures/cube/Bridge2/posy.jpg',
        'https://threejs.org/examples/textures/cube/Bridge2/negy.jpg',
        'https://threejs.org/examples/textures/cube/Bridge2/posz.jpg',
        'https://threejs.org/examples/textures/cube/Bridge2/negz.jpg'
    ]);
    const skyboxGeo = new THREE.BoxGeometry(2000, 2000, 2000);
    const skyboxMat = new THREE.MeshBasicMaterial({ envMap: textureCube, side: THREE.BackSide });
    skyboxMesh = new THREE.Mesh(skyboxGeo, skyboxMat);
    scene.add(skyboxMesh);

    scene.fog = new THREE.Fog(0xa0c4ff, 0, 950);
    const light = new THREE.HemisphereLight(0xffffff, 0x888888, 2.0);
    light.position.set(0.5, 1, 0.75);
    scene.add(light);

    controls = new PointerLockControls(camera, document.body);

    // --- ÁUDIO ---
    setupAudio();

    // --- UI ---
    setupUI();

    // --- OBJETOS 3D BASE ---
    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, playerHeight + 0.1);
    
    // Preparar Materiais e Geometrias (para usar no generateLevel)
    prepareAssets();

    // Criar o Chão
    createFloor();

    // --- GERAR NÍVEL INICIAL ---
    generateLevel(currentWinHeight);

    // Configuração Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setAnimationLoop(animate);
    document.body.appendChild(renderer.domElement);
    window.addEventListener('resize', onWindowResize);
    
    updateTimerDisplay();
    document.getElementById('blocker').classList.add('menu-active');
}

function setupAudio() {
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    audioLoader = new THREE.AudioLoader();
    
    backgroundMusic = new THREE.Audio(audioListener);
    audioLoader.load('music/background.mp3', function(buffer) {
        backgroundMusic.setBuffer(buffer);
        backgroundMusic.setLoop(true);
        backgroundMusic.setVolume(0.3);
    }, undefined, (err) => console.log('Aviso: Sem música background'));

    jumpSound = new THREE.Audio(audioListener);
    audioLoader.load('sounds/jump.mp3', function(buffer) {
        jumpSound.setBuffer(buffer);
        jumpSound.setVolume(0.5);
    }, undefined, (err) => console.log('Aviso: Sem som jump'));

    imminentDangerMusic = new THREE.Audio(audioListener);
    audioLoader.load('sounds/tempo_esgotando.mp3', function(buffer) {
        imminentDangerMusic.setBuffer(buffer);
        imminentDangerMusic.setLoop(true);
        imminentDangerMusic.setVolume(0.4);
    }, undefined, (err) => console.log('Aviso: Sem música perigo'));
}

function setupUI() {
    const scoreEl = document.getElementById('scoreValue');
    const timerEl = document.getElementById('timerValue');
    const diffEl = document.getElementById('difficultyText');
    if (scoreEl) scoreElement = scoreEl;
    if (timerEl) timerElement = timerEl;
    if (diffEl) difficultyElement = diffEl;

    document.getElementById('playButton').addEventListener('click', () => {
        setPlayerName(); freeMode = false; startGameSetup();
    });
    document.getElementById('playButtonFree').addEventListener('click', () => {
        setPlayerName(); freeMode = true; startGameSetup();
    });
    document.getElementById('rankingButton').addEventListener('click', (e) => { e.stopPropagation(); showRanking(); });
    document.getElementById('resumeButton').addEventListener('click', () => controls.lock());
    
    const goHomeBtns = document.querySelectorAll('#TelaDeInicioButton, #TelaDeInicioButtonGO');
    goHomeBtns.forEach(btn => btn.addEventListener('click', returnToMenu));

    document.getElementById('restartButton').addEventListener('click', () => {
        isPaused = false; gameActive = false; controls.lock();
    });
    document.getElementById('closeRanking').addEventListener('click', hideRanking);
    document.getElementById('resetRankingButton').addEventListener('click', (e) => {
        e.stopPropagation(); if (confirm('Apagar ranking?')) resetRanking();
    });
    document.getElementById('DificultButton').addEventListener('click', toggleDifficulty);

    // Controls Events
    controls.addEventListener('lock', onControlsLock);
    controls.addEventListener('unlock', onControlsUnlock);

    // Keyboard
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
}

function setPlayerName() {
    const input = document.getElementById('playerNameInput');
    playerName = (input && input.value.trim() !== '') ? input.value.trim() : 'Jogador';
}

function prepareAssets() {
    const textureLoader = new THREE.TextureLoader();
    const sideTexture = textureLoader.load('img/minecraftTextureBlock.png'); sideTexture.magFilter = THREE.NearestFilter;
    const topTexture = textureLoader.load('img/minecraftTop.png'); topTexture.magFilter = THREE.NearestFilter;
    const bottomTexture = textureLoader.load('img/minecraftBot.png'); bottomTexture.magFilter = THREE.NearestFilter;

    // Materiais
    const sideMat = new THREE.MeshBasicMaterial({ map: sideTexture, color: 0xbb8866 });
    const topMat = new THREE.MeshBasicMaterial({ map: topTexture, color: 0x99ff99 });
    const botMat = new THREE.MeshBasicMaterial({ map: bottomTexture, color: 0x996644 });
    const boxMaterials = [sideMat, sideMat, topMat, botMat, sideMat, sideMat];

    const cylinderMat = [
        new THREE.MeshBasicMaterial({ map: sideTexture, color: 0x8888ff }), 
        new THREE.MeshBasicMaterial({ map: topTexture, color: 0x8888ff }),  
        new THREE.MeshBasicMaterial({ map: bottomTexture, color: 0x8888ff }) 
    ];
    const sphereMat = new THREE.MeshBasicMaterial({ map: topTexture, color: 0xff8888 });

    // Geometrias
    const boxGeo = new THREE.BoxGeometry(10, 10, 10).toNonIndexed();
    const cylinderGeo = new THREE.CylinderGeometry(5, 5, 10, 16);
    const sphereGeo = new THREE.SphereGeometry(6, 16, 16);

    // Preencher arrays globais
    geometries = [boxGeo, boxGeo, boxGeo, cylinderGeo, sphereGeo]; 
    materialsList = [boxMaterials, boxMaterials, boxMaterials, cylinderMat, sphereMat];
}

function createFloor() {
    const textureLoader = new THREE.TextureLoader();
    const floorTexture = textureLoader.load('img/minecraftTop.png');
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(500, 500);
    floorTexture.magFilter = THREE.NearestFilter;

    let floorGeometry = new THREE.PlaneGeometry(2000, 2000, 100, 100);
    floorGeometry.rotateX(-Math.PI / 2);
    const floorMaterial = new THREE.MeshBasicMaterial({ map: floorTexture, color: 0xffffff });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    scene.add(floor);
    objects.push(floor); // Adiciona à colisão
}

// --- NOVA FUNÇÃO DE GERAÇÃO DE NÍVEL (CORRIGIDA: MAIOR DENSIDADE) ---
function generateLevel(maxHeight) {
    // 1. Limpar blocos antigos
    for (let i = objects.length - 1; i > 0; i--) {
        const obj = objects[i];
        scene.remove(obj);
        if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
        } else {
            obj.material.dispose();
        }
    }
    
    objects.length = 1; // Mantém só o chão
    movingObjects.length = 0;
    if (winBoxMesh) scene.remove(winBoxMesh);

    // 2. Gerar novos blocos com Grid e ALTA DENSIDADE
    const occupiedPositions = new Set(); 
    // Diminui o gridSize para 12 (blocos tem tam 10), assim ficam mais perto sem encostar
    const gridSize = 12; 

    // Loop vertical a cada 8 unidades (mais granular que 10)
    for (let yLevel = 10; yLevel < maxHeight; yLevel += 8) {
        
        // AUMENTAMOS AQUI: De 10 a 18 blocos por camada de altura
        // Isso cria uma "nuvem" densa de blocos para subir
        const blocksInLayer = Math.floor(Math.random() * 8) + 10; 

        for (let b = 0; b < blocksInLayer; b++) {
            const shapeIndex = Math.floor(Math.random() * geometries.length);
            const mesh = new THREE.Mesh(geometries[shapeIndex], materialsList[shapeIndex]);

            let validPosition = false;
            let attempts = 0;

            // Mais tentativas para encontrar vaga
            while (!validPosition && attempts < 50) {
                // Gera numa grade horizontal mais controlada (-12 a +12 na grade)
                const rX = Math.floor((Math.random() * 24 - 12)) * gridSize; 
                const rZ = Math.floor((Math.random() * 24 - 12)) * gridSize;
                
                // Pequena variação vertical para não ficar tudo alinhado perfeitamente
                const rY = yLevel + Math.floor(Math.random() * 6 - 3);

                const posKey = `${rX},${rY},${rZ}`;

                // Verifica colisão de posição E garante buraco no centro para spawn (primeiros 20m)
                if (!occupiedPositions.has(posKey)) {
                    // Regra: Não spawna em cima do player no início (0,0,0)
                    if (rY < 30 && Math.abs(rX) < 20 && Math.abs(rZ) < 20) {
                        attempts++;
                        continue; 
                    }

                    const finalY = (geometries[shapeIndex].type === 'SphereGeometry') ? rY + 6 : rY + 5;

                    mesh.position.set(rX, finalY, rZ);
                    occupiedPositions.add(posKey);
                    validPosition = true;

                    scene.add(mesh);
                    objects.push(mesh);

                    // Movimento em blocos altos
                    if (rY > 150 && Math.random() < 0.2) { // 20% de chance de movimento
                        mesh.initialX = rX;
                        movingObjects.push(mesh);
                    }
                }
                attempts++;
            }
        }
    }

    // 3. Criar Bloco de Vitória
    const victoryGeometry = new THREE.BoxGeometry(200, 5, 200);
    const victoryMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00, transparent: true, opacity: 0.5 });
    winBoxMesh = new THREE.Mesh(victoryGeometry, victoryMaterial);
    winBoxMesh.position.set(0, maxHeight + 2.5, 0);
    scene.add(winBoxMesh);
}

function startGameSetup() {
    if (audioListener.context.state === 'suspended') {
        audioListener.context.resume();
    }
    controls.lock(); 
}

function onControlsLock() {
    document.getElementById('blocker').style.display = 'none';
    document.getElementById('instructions').style.display = 'none';
    document.getElementById('pauseScreen').style.display = 'none';
    document.getElementById('gameOverScreen').style.display = 'none';
    document.getElementById('rankingOverlay').style.display = 'none';
    
    document.getElementById('scoreContainer').style.display = 'block';
    document.getElementById('timerContainer').style.display = 'block';
    document.getElementById('blocker').classList.remove('menu-active');

    if (isPaused) {
        isPaused = false;
        resumeGame();
    } else if (!gameActive) {
        startGame();
    }
}

function onControlsUnlock() {
    document.getElementById('blocker').style.display = 'block';
    if (gameActive) {
        gameActive = false;
        isPaused = true;
        clearInterval(timerInterval);
        document.getElementById('pauseScreen').style.display = 'flex';
    } else {
        isPaused = false;
        if (document.getElementById('gameOverScreen').style.display === 'none' && document.getElementById('rankingOverlay').style.display === 'none') {
            document.getElementById('instructions').style.display = 'flex';
            document.getElementById('blocker').classList.add('menu-active');
            document.getElementById('scoreContainer').style.display = 'none';
            document.getElementById('timerContainer').style.display = 'none';
        }
    }
}

function onKeyDown(event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = true; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = true; break;
        case 'ArrowDown': case 'KeyS': moveBackward = true; break;
        case 'ArrowRight': case 'KeyD': moveRight = true; break;
        case 'Space':
            if (jumpCount > 0 && gameActive) {
                velocity.y = 250;
                jumpCount--;
                if (jumpSound && jumpSound.buffer) {
                    if (jumpSound.isPlaying) jumpSound.stop();
                    jumpSound.play();
                }
            }
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = false; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = false; break;
        case 'ArrowDown': case 'KeyS': moveBackward = false; break;
        case 'ArrowRight': case 'KeyD': moveRight = false; break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function respawnPlayer() {
    controls.object.position.set(0, playerHeight, 0);
    velocity.set(0, 0, 0);
    jumpCount = 0;
}

function toggleDifficulty() {
    const difficulties = ['EASY', 'NORMAL', 'HARD'];
    const nextIndex = (difficulties.indexOf(currentDifficulty) + 1) % difficulties.length;
    currentDifficulty = difficulties[nextIndex];
    const settings = difficultySettings[currentDifficulty];
    
    currentWinHeight = settings.height;
    initialGameTime = settings.time;
    
    if (difficultyElement) difficultyElement.textContent = settings.text;
    
    generateLevel(currentWinHeight);
    
    if (!gameActive) respawnPlayer();
}

function startGame() {
    gameActive = true;
    isPaused = false;
    if (!freeMode) {
        gameTime = initialGameTime;
        timerInterval = setInterval(updateTimer, 1000);
        updateTimerDisplay();
        if (imminentDangerMusic && imminentDangerMusic.isPlaying) imminentDangerMusic.stop();
        if (backgroundMusic && !backgroundMusic.isPlaying) backgroundMusic.play();
    } else {
        if (backgroundMusic && backgroundMusic.isPlaying) backgroundMusic.stop();
        if (imminentDangerMusic && imminentDangerMusic.isPlaying) imminentDangerMusic.stop();
        timerElement.textContent = 'LIVRE';
        if (backgroundMusic && !backgroundMusic.isPlaying) backgroundMusic.play();
    }
    maxAltitudeScore = 0;
    scoreElement.textContent = '0';
    respawnPlayer();
}

function returnToMenu() {
    gameActive = false;
    isPaused = false;
    freeMode = false;
    clearInterval(timerInterval);

    if (backgroundMusic && backgroundMusic.isPlaying) backgroundMusic.stop();
    if (imminentDangerMusic && imminentDangerMusic.isPlaying) imminentDangerMusic.stop();

    respawnPlayer();
    controls.unlock();

    document.getElementById('pauseScreen').style.display = 'none';
    document.getElementById('gameOverScreen').style.display = 'none';
    document.getElementById('rankingOverlay').style.display = 'none';
    document.getElementById('blocker').style.display = 'block';
    document.getElementById('instructions').style.display = 'flex';
    
    document.getElementById('blocker').classList.add('menu-active');
    document.getElementById('scoreContainer').style.display = 'none';
    document.getElementById('timerContainer').style.display = 'none';
}

function resumeGame() {
    gameActive = true;
    isPaused = false;
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
    const DANGER_THRESHOLD = 45;
    if (gameTime <= DANGER_THRESHOLD) {
        if (backgroundMusic) backgroundMusic.stop();
        if (imminentDangerMusic && !imminentDangerMusic.isPlaying) imminentDangerMusic.play();
    } else {
        if (imminentDangerMusic) imminentDangerMusic.stop();
        if (backgroundMusic && !backgroundMusic.isPlaying) backgroundMusic.play();
    }
}

function updateTimer() {
    if (!gameActive || freeMode) { clearInterval(timerInterval); return; }
    gameTime--;
    updateTimerDisplay();
    if (gameTime <= 0) {
        gameOver('Tempo Esgotado!');
        if (backgroundMusic) backgroundMusic.stop();
        if (imminentDangerMusic) imminentDangerMusic.stop();
        return;
    }
    if (gameTime === 45) {
        if (backgroundMusic) backgroundMusic.stop();
        if (imminentDangerMusic && !imminentDangerMusic.isPlaying) imminentDangerMusic.play();
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(gameTime / 60);
    const seconds = gameTime % 60;
    if (timerElement) timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function gameOver(message) {
    gameActive = false;
    isPaused = false;
    clearInterval(timerInterval);
    finalScore = Math.floor(maxAltitudeScore - playerHeight);
    if(scoreElement) scoreElement.textContent = finalScore;
    saveScore(finalScore, null, false);
    controls.unlock();
    document.getElementById('gameOverMessage').textContent = message;
    document.getElementById('gameOverScore').textContent = `Pontuação Final: ${finalScore}m`;
    document.getElementById('gameOverScreen').style.display = 'flex';
    showRanking();
}

function gameWon() {
    gameActive = false;
    isPaused = false;
    clearInterval(timerInterval);
    maxAltitudeScore = controls.object.position.y;
    finalScore = Math.floor(maxAltitudeScore - playerHeight);
    if(scoreElement) scoreElement.textContent = finalScore;
    const elapsedTime = initialGameTime - gameTime;
    saveScore(finalScore, elapsedTime, true);
    controls.unlock();
    document.getElementById('gameOverMessage').textContent = 'VOCÊ VENCEU!';
    document.getElementById('gameOverScore').textContent = `Pontuação: ${finalScore}m | Tempo: ${formatTime(elapsedTime)}`;
    document.getElementById('gameOverScreen').style.display = 'flex';
    showRanking();
}

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function saveScore(score, time, isWin = false) {
    const ranking = JSON.parse(localStorage.getItem('OEscaladorRanking')) || [];
    ranking.push({ name: playerName, score: score, time: time });
    ranking.sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        if (a.time === null) return 1;
        if (b.time === null) return -1;
        return a.time - b.time;
    });
    localStorage.setItem('OEscaladorRanking', JSON.stringify(ranking.slice(0, 10)));
}

function showRanking() {
    const ranking = JSON.parse(localStorage.getItem('OEscaladorRanking')) || [];
    const listElement = document.getElementById('rankingList');
    listElement.innerHTML = '';
    if (ranking.length === 0) {
        listElement.innerHTML = '<li>Nenhuma pontuação registrada.</li>';
    } else {
        ranking.forEach((item) => {
            const li = document.createElement('li');
            let timeString = item.time !== null ? ` (em ${formatTime(item.time)})` : "";
            li.textContent = `${item.name}: ${item.score}m${timeString}`;
            listElement.appendChild(li);
        });
    }
    document.getElementById('rankingOverlay').style.display = 'flex';
}

function hideRanking() {
    document.getElementById('rankingOverlay').style.display = 'none';
    if (!gameActive && !isPaused) {
        document.getElementById('blocker').style.display = 'block';
        document.getElementById('instructions').style.display = 'flex';
        document.getElementById('blocker').classList.add('menu-active');
    }
}

function resetRanking() {
    localStorage.removeItem('OEscaladorRanking');
    showRanking();
}

function animate() {
    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (controls.isLocked === true && gameActive) {
        const currentTime = time * 0.001;
        for (const obj of movingObjects) {
            const oldX = obj.position.x;
            const newX = obj.initialX + (Math.sin(currentTime + obj.position.y) * 15);
            obj.position.x = newX;
            obj.deltaX = newX - oldX;
        }

        if (skyboxMesh) skyboxMesh.rotation.y += 0.005 * delta;

        raycaster.ray.origin.copy(controls.object.position);
        const intersections = raycaster.intersectObjects(objects, false);
        const onObject = intersections.length > 0;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 100.0 * delta;

        if (onObject === true) {
            const distance = intersections[0].distance;
            if (distance <= playerHeight) {
                velocity.y = Math.max(0, velocity.y);
                if (velocity.y === 0) jumpCount = MAX_JUMPS;
                const groundObject = intersections[0].object;
                const groundY = intersections[0].point.y;
                controls.object.position.y = groundY + playerHeight;
                if (groundObject.deltaX !== undefined) controls.object.position.x += groundObject.deltaX;
            }
        }

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();
        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        controls.object.position.y += (velocity.y * delta);

        const currentHeight = controls.object.position.y;
        if (currentHeight > maxAltitudeScore && currentHeight > playerHeight) {
            maxAltitudeScore = currentHeight;
            if(scoreElement) scoreElement.textContent = Math.floor(maxAltitudeScore - playerHeight);
        }

        if (controls.object.position.y < -50) respawnPlayer();
        if (Math.abs(controls.object.position.x) > MAP_BOUNDARY || Math.abs(controls.object.position.z) > MAP_BOUNDARY) respawnPlayer();
        if (controls.object.position.y > currentWinHeight) gameWon();
    }
    prevTime = time;
    renderer.render(scene, camera);
}