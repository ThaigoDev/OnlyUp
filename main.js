import * as THREE from 'three';

// --- VARIÁVEIS GLOBAIS DE CONTROLE MOBILE ---
let isMobile = /Mobi|Android/i.test(navigator.userAgent);
let joystick;

// VARIÁVEIS DE ROTAÇÃO E CÂMERA
const PI_2 = Math.PI / 2;
const mouseSensitivity = 0.002; // Sensibilidade do mouse

// VARIÁVEIS DE CONTROLE PC/MOUSE
let isCursorLocked = false;

let camera, scene, renderer;
const objects = [];
const movingObjects = [];
let raycaster;
let scoreElement, timerElement;
let skyboxMesh;

// Variáveis globais de materiais e geometrias
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

// Variáveis de som
let audioListener, backgroundMusic, jumpSound, imminentDangerMusic, victorySound, defeatSound, audioLoader;

// --- Objeto controls ---
const controls = {
    isLocked: false,
    object: null,
    lock: function() {
        if (!isMobile) isCursorLocked = true;
        onControlsLock();
    },
    unlock: function() {
        if (!isMobile) isCursorLocked = false;
        onControlsUnlock();
    }
};

// Verificação de segurança do Three.js
if (typeof THREE === 'undefined') {
    console.error("THREE.js não carregado.");
} else {
    init();
}

function init() {
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.y = playerHeight;

    // CORREÇÃO CRÍTICA PARA 360: Ordem de rotação YXZ evita travamento nos polos
    camera.rotation.order = 'YXZ';
    controls.object = camera;

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

    // CONTROLES
    if (isMobile) {
        setupMobileControls();
    } else {
        // Usamos mousemove direto para FPS 360 sem lag
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('click', onPCControlsLock);
    }

    setupAudio();
    setupUI();

    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, playerHeight + 0.1);

    prepareAssets();
    createFloor();
    generateLevel(currentWinHeight);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setAnimationLoop(animate);
    document.body.appendChild(renderer.domElement);
    window.addEventListener('resize', onWindowResize);

    updateTimerDisplay();
    document.getElementById('blocker').classList.add('menu-active');
}

function setPlayerName() {
    const input = document.getElementById('playerNameInput');
    playerName = (input && input.value.trim() !== '') ? input.value.trim() : 'Jogador';
}

function startGameSetup() {
    if (audioListener.context.state === 'suspended') {
        audioListener.context.resume();
    }
    controls.lock();
}

// =========================================================================
// FUNÇÕES DE CONTROLE (CORREÇÃO 360 GRAUS AQUI)
// =========================================================================

function setupMobileControls() {
    joystick = nipplejs.create({
        zone: document.getElementById('joystickContainer'),
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'white',
        restOpacity: 0.5,
        lockX: false,
        lockY: false
    });

    joystick.on('move', function (evt, data) {
        moveForward = moveBackward = moveLeft = moveRight = false;
        if (data.force > 0.1) {
            const angleDeg = data.angle.degree;
            if (angleDeg > 45 && angleDeg <= 135) moveForward = true;
            else if (angleDeg > 225 && angleDeg <= 315) moveBackward = true;
            else if (angleDeg > 135 && angleDeg <= 225) moveLeft = true;
            else if (angleDeg > 315 || angleDeg <= 45) moveRight = true;
        }
    }).on('end', function () {
        moveForward = moveBackward = moveLeft = moveRight = false;
    });

    const lookContainer = document.getElementById('lookContainer');
    let lastX = 0, lastY = 0;
    const sensibility = 0.5;

    lookContainer.addEventListener('touchstart', (event) => {
        if (!gameActive) return;
        event.preventDefault();
        lastX = event.touches[0].pageX;
        lastY = event.touches[0].pageY;
    }, { passive: false });

    lookContainer.addEventListener('touchmove', (event) => {
        if (!gameActive) return;
        event.preventDefault();
        const touch = event.touches[0];
        const deltaX = touch.pageX - lastX;
        const deltaY = touch.pageY - lastY;

        // Aplicação direta na rotação para garantir 360 igual ao PC
        camera.rotation.y -= deltaX * sensibility * mouseSensitivity * 10;
        camera.rotation.x -= deltaY * sensibility * mouseSensitivity * 10;
        camera.rotation.x = Math.max( - PI_2, Math.min( PI_2, camera.rotation.x ) );

        lastX = touch.pageX;
        lastY = touch.pageY;
    }, { passive: false });
}

function onPCControlsLock() {
    if (!gameActive || isMobile) return;
    const blocker = document.getElementById('blocker');
    if (blocker.style.display !== 'none') {
        controls.lock();
    }
}

function onMouseMove(event) {
    if (!gameActive || isMobile || !isCursorLocked) return;

    // --- CORREÇÃO FPS 360 GRAUS ---
    // Aplicamos diretamente na câmera. Subtrair movementX gira o corpo (Y).
    // Subtrair movementY gira a cabeça (X).

    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    camera.rotation.y -= movementX * mouseSensitivity;
    camera.rotation.x -= movementY * mouseSensitivity;

    // Trava vertical para não dar cambalhota (padrão FPS)
    camera.rotation.x = Math.max( - PI_2, Math.min( PI_2, camera.rotation.x ) );
}

// =========================================================================
// LÓGICA DO JOGO (MANTIDA INTEGRALMENTE)
// =========================================================================

function setupAudio() {
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    audioLoader = new THREE.AudioLoader();

    backgroundMusic = new THREE.Audio(audioListener);
    audioLoader.load('/music/background.mp3', function(buffer) {
        backgroundMusic.setBuffer(buffer);
        backgroundMusic.setLoop(true);
        backgroundMusic.setVolume(0.3);
    }, undefined, (err) => console.log('Aviso: Sem música background'));

    jumpSound = new THREE.Audio(audioListener);
    audioLoader.load('/sounds/jump.mp3', function(buffer) {
        jumpSound.setBuffer(buffer);
        jumpSound.setVolume(0.5);
    }, undefined, (err) => console.log('Aviso: Sem som jump'));

    imminentDangerMusic = new THREE.Audio(audioListener);
    audioLoader.load('/sounds/tempo_esgotando.mp3', function(buffer) {
        imminentDangerMusic.setBuffer(buffer);
        imminentDangerMusic.setLoop(true);
        imminentDangerMusic.setVolume(0.4);
    }, undefined, (err) => console.log('Aviso: Sem música perigo'));

    victorySound = new THREE.Audio(audioListener);
    audioLoader.load('/sounds/vitoria.mp3', function(buffer) {
        victorySound.setBuffer(buffer);
        victorySound.setLoop(false);
        victorySound.setVolume(0.6);
    }, undefined, (err) => console.log('Aviso: Sem som de vitória'));

    defeatSound = new THREE.Audio(audioListener);
    audioLoader.load('/sounds/derrota.mp3', function(buffer) {
        defeatSound.setBuffer(buffer);
        defeatSound.setLoop(false);
        defeatSound.setVolume(0.6);
    }, undefined, (err) => console.log('Aviso: Sem som de derrota'));
}

function setupUI() {
    const scoreEl = document.getElementById('scoreValue');
    const timerEl = document.getElementById('timerValue');
    const diffEl = document.getElementById('difficultyText');
    if (scoreEl) scoreElement = scoreEl;
    if (timerEl) timerElement = timerEl;
    if (diffEl) difficultyElement = diffEl;

    document.getElementById('playButton').addEventListener('click', () => {
        setPlayerName();
        freeMode = false;
        startGameSetup();
    });
    document.getElementById('playButtonFree').addEventListener('click', () => {
        setPlayerName();
        freeMode = true;
        startGameSetup();
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

    // Tecla ESC para destravar
    document.addEventListener('keydown', (event) => {
        if (event.code === 'Escape' && controls.isLocked) {
            controls.unlock();
        }
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
}

function toggleGameHUD(show) {
    const display = show ? 'block' : 'none';
    const playerHand = document.getElementById('playerHand');
    const crosshair = document.getElementById('crosshair');
    const mobileControls = document.getElementById('mobileControls');

    if (playerHand) {
        if (isMobile) {
            playerHand.style.width = '40%';
            playerHand.style.height = '40%';
        } else {
            playerHand.style.width = '400px';
            playerHand.style.height = '400px';
        }
        playerHand.style.display = display;
    }

    if (crosshair) crosshair.style.display = (!isMobile && show) ? display : 'none';
    if (mobileControls) mobileControls.style.display = (isMobile && show) ? 'block' : 'none';
    document.body.style.cursor = (!isMobile && show) ? 'none' : 'default';
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

    toggleGameHUD(true);

    if (isPaused) {
        isPaused = false;
        resumeGame();
    } else if (!gameActive) {
        startGame();
    }
    controls.isLocked = true;
}

function onControlsUnlock() {
    document.getElementById('blocker').style.display = 'block';
    toggleGameHUD(false);

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
    controls.isLocked = false;
}

function onKeyDown(event) {
    if (isMobile) return;
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
    if (isMobile) return;
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
    if(gameActive) toggleGameHUD(true);
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
    if (victorySound && victorySound.isPlaying) victorySound.stop();
    if (defeatSound && defeatSound.isPlaying) defeatSound.stop();

    respawnPlayer();
    controls.unlock();
    toggleGameHUD(false);

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
        gameOver('O tempo acabou e você não concluiu a escalada!');
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

    if (defeatSound && defeatSound.buffer) {
        if (backgroundMusic && backgroundMusic.isPlaying) backgroundMusic.stop();
        if (imminentDangerMusic && imminentDangerMusic.isPlaying) imminentDangerMusic.stop();
        if (victorySound && victorySound.isPlaying) victorySound.stop();
        if (defeatSound.isPlaying) defeatSound.stop();
        defeatSound.play();
    }

    controls.unlock();
    toggleGameHUD(false);

    document.getElementById('gameOverMessage').textContent = message;
    document.getElementById('gameOverScore').textContent = `Pontuação Final: ${finalScore}m`;
    document.getElementById('gameOverScreen').style.display = 'flex';
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

    if (victorySound && victorySound.buffer) {
        if (backgroundMusic && backgroundMusic.isPlaying) backgroundMusic.stop();
        if (imminentDangerMusic && imminentDangerMusic.isPlaying) imminentDangerMusic.stop();
        if (victorySound.isPlaying) victorySound.stop();
        victorySound.play();
    }

    controls.unlock();
    toggleGameHUD(false);

    document.getElementById('gameOverMessage').textContent = 'VOCÊ VENCEU!';
    document.getElementById('gameOverScore').textContent = `Pontuação: ${finalScore}m | Tempo: ${formatTime(elapsedTime)}`;
    document.getElementById('gameOverScreen').style.display = 'flex';
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
        // Nota: A rotação da câmera agora é feita no onMouseMove (PC) ou touchmove (Mobile)
        // para garantir resposta 1:1 e 360 graus.

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

        // --- MOVIMENTO (TECLADO/JOYSTICK) ---
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        const ACCELERATION = 400.0 * delta;

        if (moveForward || moveBackward) {
            velocity.z += direction.z * ACCELERATION;
        }
        if (moveLeft || moveRight) {
            velocity.x += direction.x * ACCELERATION;
        }

        // ATENÇÃO: O vetor de movimento deve usar APENAS a rotação Y (Horizontal)
        // para que ao olhar para cima/baixo o jogador não ande mais devagar ou voe.
        const forwardVector = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0, 'YXZ'));
        const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, camera.rotation.y, 0, 'YXZ'));

        camera.position.addScaledVector(forwardVector, velocity.z * delta);
        camera.position.addScaledVector(rightVector, velocity.x * delta);

        camera.position.y += (velocity.y * delta);

        const currentHeight = camera.position.y;
        if (currentHeight > maxAltitudeScore && currentHeight > playerHeight) {
            maxAltitudeScore = currentHeight;
            if(scoreElement) scoreElement.textContent = Math.floor(maxAltitudeScore - playerHeight);
        }

        if (camera.position.y < -50) respawnPlayer();
        if (Math.abs(camera.position.x) > MAP_BOUNDARY || Math.abs(camera.position.z) > MAP_BOUNDARY) respawnPlayer();
        if (camera.position.y > currentWinHeight) gameWon();
    }
    prevTime = time;
    renderer.render(scene, camera);
}

function prepareAssets() {
    const textureLoader = new THREE.TextureLoader();
    const sideTexture = textureLoader.load('/img/minecraftTextureBlock.png'); sideTexture.magFilter = THREE.NearestFilter;
    const topTexture = textureLoader.load('/img/minecraftTop.png'); topTexture.magFilter = THREE.NearestFilter;
    const bottomTexture = textureLoader.load('/img/minecraftBot.png'); bottomTexture.magFilter = THREE.NearestFilter;

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

    const boxGeo = new THREE.BoxGeometry(10, 10, 10).toNonIndexed();
    const cylinderGeo = new THREE.CylinderGeometry(5, 5, 10, 16);
    const sphereGeo = new THREE.SphereGeometry(6, 16, 16);

    geometries = [boxGeo, boxGeo, boxGeo, cylinderGeo, sphereGeo];
    materialsList = [boxMaterials, boxMaterials, boxMaterials, cylinderMat, sphereMat];
}

function createFloor() {
    const textureLoader = new THREE.TextureLoader();
    const floorTexture = textureLoader.load('/img/minecraftTop.png');
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(500, 500);
    floorTexture.magFilter = THREE.NearestFilter;

    let floorGeometry = new THREE.PlaneGeometry(2000, 2000, 100, 100);
    floorGeometry.rotateX(-Math.PI / 2);
    const floorMaterial = new THREE.MeshBasicMaterial({ map: floorTexture, color: 0xffffff });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    scene.add(floor);
    objects.push(floor);
}

function generateLevel(maxHeight) {
    for (let i = objects.length - 1; i > 0; i--) {
        const obj = objects[i];
        scene.remove(obj);
        if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
        } else {
            obj.material.dispose();
        }
    }

    objects.length = 1;
    movingObjects.length = 0;
    if (winBoxMesh) scene.remove(winBoxMesh);

    const occupiedBoxes = [];
    objects[0].geometry.computeBoundingBox();
    const floorBox = new THREE.Box3().setFromObject(objects[0]);
    occupiedBoxes.push(floorBox);

    // Plataforma Inicial
    const startPositions = [
        {x: 0, y: 10, z: -15},
        {x: -10, y: 18, z: -25},
        {x: 10, y: 26, z: -25}
    ];

    startPositions.forEach(pos => {
        const mesh = new THREE.Mesh(geometries[0], materialsList[0]);
        mesh.position.set(pos.x, pos.y, pos.z);
        scene.add(mesh);
        objects.push(mesh);
        const box = new THREE.Box3().setFromObject(mesh);
        occupiedBoxes.push(box);
    });

    // Geração Procedural
    const gridSize = 12;
    for (let yLevel = 10; yLevel < maxHeight; yLevel += 8) {
        const blocksInLayer = Math.floor(Math.random() * 8) + 10;

        for (let b = 0; b < blocksInLayer; b++) {
            const shapeIndex = Math.floor(Math.random() * geometries.length);

            if (!geometries[shapeIndex].boundingBox) {
                geometries[shapeIndex].computeBoundingBox();
            }

            const mesh = new THREE.Mesh(geometries[shapeIndex], materialsList[shapeIndex]);

            let validPosition = false;
            let attempts = 0;

            while (!validPosition && attempts < 50) {
                const rX = Math.floor((Math.random() * 24 - 12)) * gridSize;
                const rZ = Math.floor((Math.random() * 24 - 12)) * gridSize;
                const rY = yLevel + Math.floor(Math.random() * 6 - 3);

                if (rY < 30 && Math.abs(rX) < 20 && Math.abs(rZ) < 20) {
                    attempts++;
                    continue;
                }

                let finalY;
                const bboxMinY = geometries[shapeIndex].boundingBox.min.y;
                const bboxMaxY = geometries[shapeIndex].boundingBox.max.y;
                const objectHeight = bboxMaxY - bboxMinY;

                finalY = rY + (objectHeight / 2) - bboxMinY;

                mesh.position.set(rX, finalY, rZ);

                const newBox = new THREE.Box3().setFromObject(mesh);
                let intersectsExisting = false;

                for (const existingBox of occupiedBoxes) {
                    if (newBox.intersectsBox(existingBox)) {
                        intersectsExisting = true;
                        break;
                    }
                }

                if (!intersectsExisting) {
                    validPosition = true;
                    scene.add(mesh);
                    objects.push(mesh);
                    occupiedBoxes.push(newBox);

                    if (rY > 150 && Math.random() < 0.2) {
                        mesh.initialX = rX;
                        movingObjects.push(mesh);
                    }
                }
                attempts++;
            }
        }
    }

    const victoryGeometry = new THREE.BoxGeometry(200, 5, 200);
    const victoryMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00, transparent: true, opacity: 0.5 });
    winBoxMesh = new THREE.Mesh(victoryGeometry, victoryMaterial);
    winBoxMesh.position.set(0, maxHeight + 2.5, 0);
    scene.add(winBoxMesh);
}
