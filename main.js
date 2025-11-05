import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { ScoreManager } from './pontuacao.js';

let camera, scene, renderer, controls;
const objects = [];
let raycaster; // Nosso único raycaster, usado para o chão
let scoreManager;

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;

// === MUDANÇA 1: "canJump" FOI SUBSTITUÍDO POR "jumpCount" ===
// let canJump = false; // <-- REMOVIDO
let jumpCount = 0;
const MAX_JUMPS = 2; // Define o número máximo de pulos (1 = pulo normal, 2 = pulo duplo)

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const vertex = new THREE.Vector3();
const color = new THREE.Color();

// === NOVAS VARIÁVEIS GLOBAIS ===
let maxAltitudeScore = 0;
const WIN_HEIGHT = 600;

// Variáveis de Estado do Jogo e Tempo
let gameActive = false;
let gameTime = 300;
let timerInterval;
let timerElement;
let finalScore = 0;
let playerName = 'Jogador'; // Nome padrão

// === VARIÁVEIS DE ÁUDIO (ADIÇÃO 1) ===
let audioListener;
let soundLoader;
let jumpSound; // Para som1
let finalSound; // Para final
// ===================================

// === VARIÁVEL DE ALTURA DO JOGADOR ===
const playerHeight = 10.0; // Altura do "pé" do jogador em relação à câmera

init();

function init() {
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
    // A câmera (olhos) começa na altura do jogador (ex: 10)
    camera.position.y = playerHeight;

    scene = new THREE.Scene();

    scene.background = new THREE.Color(0x87CEEB); // Azul céu
    scene.fog = new THREE.Fog(0x87CEEB, 0, 750); // Névoa da mesma cor do céu

    const light = new THREE.HemisphereLight(0xeeeeff, 0x777788, 2.5);
    light.position.set(0.5, 1, 0.75);
    scene.add(light);

    controls = new PointerLockControls(camera, document.body);

    // === BUSCA DE ELEMENTOS DA UI ===
    const blocker = document.getElementById('blocker');
    const instructions = document.getElementById('instructions');
    const pauseScreen = document.getElementById('pauseScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');

    scoreManager = new ScoreManager('scoreValue');
    timerElement = document.getElementById('timerValue');

    // === LISTENERS DOS BOTÕES DA UI ===
    document.getElementById('playButton').addEventListener('click', () => {
        const nameInput = document.getElementById('playerNameInput');
        if (nameInput.value.trim() !== '') {
            playerName = nameInput.value.trim();
        } else {
            playerName = 'Jogador';
        }
        controls.lock();
    });

    document.getElementById('rankingButton').addEventListener('click', (e) => {
        e.stopPropagation();
        showRanking();
    });
    document.getElementById('resumeButton').addEventListener('click', () => {
        controls.lock();
    });
    document.getElementById('restartButton').addEventListener('click', () => {
        controls.lock();
    });
    document.getElementById('closeRanking').addEventListener('click', () => {
        hideRanking();
    });

    document.getElementById('resetRankingButton').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Tem certeza que deseja apagar todas as pontuações?')) {
            resetRanking();
        }
    });

    // === LISTENERS DO CONTROLE (LOCK/UNLOCK) ===
    controls.addEventListener('lock', function () {
        blocker.style.display = 'none';
        instructions.style.display = 'none';
        pauseScreen.style.display = 'none';
        gameOverScreen.style.display = 'none';

        if (!gameActive) {
            startGame();
        } else {
            resumeGame();
        }
    });

    controls.addEventListener('unlock', function () {
        blocker.style.display = 'block';

        if (gameActive) {
            gameActive = false;
            clearInterval(timerInterval);
            pauseScreen.style.display = 'flex';
        } else {
            if (pauseScreen.style.display === 'none' && gameOverScreen.style.display === 'none') {
                instructions.style.display = 'flex';
            }
        }
    });

    scene.add(controls.object);

    const onKeyDown = function (event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = true;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = true;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = true;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = true;
                break;
            
            // === MUDANÇA 2: LÓGICA DE PULO ===
            case 'Space':
                // Se o contador de pulos for maior que 0
                if (jumpCount > 0) {
                    // Define a velocidade vertical para 250 (ignora a velocidade atual)
                    // Isso garante que o pulo duplo tenha a mesma força
                    velocity.y = 1000;
                    // Gasta um pulo
                    jumpCount--;

                    // === ADIÇÃO 3: TOCA O SOM DE PULO ===
                    if (jumpSound.buffer) {
                        jumpSound.stop();
                        jumpSound.play(); 
                    }
                    // =====================================
                }
                break;
        }
    };

    const onKeyUp = function (event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = false;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = false;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = false;
                break;
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // === RAYCASTER DE PULO (CHÃO) ===
    // Configurado para sair dos "olhos" (câmera) para baixo
    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, playerHeight + 0.1);

    // --- TEXTURAS ---
    const textureLoader = new THREE.TextureLoader();
    const floorTexture = textureLoader.load('img/minecraftTop.png');
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(500, 500);
    const sideTexture = textureLoader.load('img/minecraftTextureBlock.png');
    const topTexture = textureLoader.load('img/minecraftTop.png');
    const bottomTexture = textureLoader.load('img/minecraftBot.png');

    // --- CHÃO ---
    let floorGeometry = new THREE.PlaneGeometry(2000, 2000, 100, 100);
    floorGeometry.rotateX(-Math.PI / 2);
    const floorMaterial = new THREE.MeshBasicMaterial({ map: floorTexture });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    scene.add(floor);
    // Adiciona o chão à lista de objetos colidíveis
    objects.push(floor); 

    // --- OBJETOS (BLOCOS) ---
    const boxGeometry = new THREE.BoxGeometry(10, 10, 10).toNonIndexed();
    const sideMaterial = new THREE.MeshBasicMaterial({ map: sideTexture });
    const topMaterial = new THREE.MeshBasicMaterial({ map: topTexture });
    const bottomMaterial = new THREE.MeshBasicMaterial({ map: bottomTexture });
    const multiMaterial = [sideMaterial, sideMaterial, topMaterial, bottomMaterial, sideMaterial, sideMaterial];

    for (let i = 0; i < 1000; i++) {
        const box = new THREE.Mesh(boxGeometry, multiMaterial);
        box.position.x = Math.floor(Math.random() * 30 - 15) * 12;
        
        // Vamos simplificar: O Y gerado é a *base* do bloco
        const baseY = Math.floor(Math.random() * 30) * 20 + 10;
        box.position.y = baseY + 5; // +5 porque a altura do bloco é 10 (centro)
        
        box.position.z = Math.floor(Math.random() * 30 - 15) * 12;
        scene.add(box);
        objects.push(box); // Adiciona o bloco à lista de colisões
    }

    // --- BLOCO DE VITÓRIA ---
    const victoryGeometry = new THREE.BoxGeometry(200, 5, 200);
    const victoryMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00, transparent: true, opacity: 0.5 });
    const victoryBox = new THREE.Mesh(victoryGeometry, victoryMaterial);
    victoryBox.position.set(0, WIN_HEIGHT + 2.5, 0);
    scene.add(victoryBox);
    // (Não precisa de colisão com o bloco de vitória, só de detectar a altura Y)

    // === CONFIGURAÇÃO DE ÁUDIO  ===
    audioListener = new THREE.AudioListener();
    camera.add(audioListener); // Adiciona o listener à câmera para que ela "ouça"
    soundLoader = new THREE.AudioLoader();

    // Carrega o som de PULO (som1)
    jumpSound = new THREE.Audio(audioListener);
    // O caminho foi corrigido para 'audio/som1.mp3'
    soundLoader.load('audio/som1.mp3', function (buffer) { 
        jumpSound.setBuffer(buffer);
        jumpSound.setLoop(false);
        jumpSound.setVolume(0.5); 
    });

    // Carrega o som de FINAL/VITÓRIA (final)
    finalSound = new THREE.Audio(audioListener);
    // O caminho foi corrigido para 'audio/final.mp3'
    soundLoader.load('audio/final.mp3', function (buffer) { 
        finalSound.setBuffer(buffer);
        finalSound.setLoop(false);
        finalSound.setVolume(0.7); 
    });
    // ===============================================================

    // --- RENDERIZADOR ---
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setAnimationLoop(animate);
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize);
    updateTimerDisplay();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// === FUNÇÕES DE ESTADO DE JOGO ===
function startGame() {
    gameActive = true;
    gameTime = 300;
    maxAltitudeScore = 0;
    scoreManager.setScore(0);
    // Posição inicial: "olhos" em Y=10
    controls.object.position.set(0, playerHeight, 0); 
    velocity.set(0, 0, 0);

    // === MUDANÇA 3: RESETAR O CONTADOR DE PULOS ===
    jumpCount = 0;

    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
    updateTimerDisplay();
}
function resumeGame() {
    gameActive = true;
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
}
function updateTimer() {
    if (!gameActive) { clearInterval(timerInterval); return; }
    gameTime--;
    updateTimerDisplay();
    if (gameTime <= 0) { gameOver('Tempo Esgotado!'); }
}
function updateTimerDisplay() {
    const minutes = Math.floor(gameTime / 60);
    const seconds = gameTime % 60;
    timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
function gameOver(message) {
    gameActive = false;
    clearInterval(timerInterval);
    finalScore = Math.floor(maxAltitudeScore - playerHeight);
    saveScore(finalScore);
    controls.unlock();
    document.getElementById('gameOverMessage').textContent = message;
    document.getElementById('gameOverScore').textContent = `Pontuação Final: ${finalScore}m`;
    document.getElementById('gameOverScreen').style.display = 'flex';
    showRanking();
}
function gameWon() {
    gameActive = false;
    clearInterval(timerInterval);
    finalScore = Math.floor(maxAltitudeScore - playerHeight);
    saveScore(finalScore, true);
    controls.unlock();
    document.getElementById('gameOverMessage').textContent = 'VOCÊ VENCEU!';
    document.getElementById('gameOverScore').textContent = `Pontuação: ${finalScore}m | Tempo Restante: ${timerElement.textContent}`;
    document.getElementById('gameOverScreen').style.display = 'flex';
    showRanking();

    // === ADIÇÃO 4: TOCA O SOM DE VITÓRIA/FINAL ===
    if (finalSound.buffer) {
        finalSound.play();
    }
    // ===========================================
}
// === FUNÇÕES DE RANKING (Sem alterações) ===
function saveScore(score, isWin = false) {
    const ranking = JSON.parse(localStorage.getItem('OEscaladorRanking')) || [];
    ranking.push({ name: playerName, score: score });
    ranking.sort((a, b) => b.score - a.score);
    const top10 = ranking.slice(0, 10);
    localStorage.setItem('OEscaladorRanking', JSON.stringify(top10));
}
function showRanking() {
    const ranking = JSON.parse(localStorage.getItem('OEscaladorRanking')) || [];
    const listElement = document.getElementById('rankingList');
    listElement.innerHTML = '';
    if (ranking.length === 0) {
        listElement.innerHTML = '<li>Nenhuma pontuação registrada.</li>';
    } else {
        ranking.forEach((item, index) => {
            const li = document.createElement('li');
            li.textContent = `${index + 1}. ${item.name}: ${item.score} metros`;
            listElement.appendChild(li);
        });
    }
    document.getElementById('rankingOverlay').style.display = 'flex';
}
function hideRanking() {
    document.getElementById('rankingOverlay').style.display = 'none';
}
function resetRanking() {
    localStorage.removeItem('OEscaladorRanking');
    showRanking();
}

// === FUNÇÃO DE ANIMAÇÃO (LÓGICA DE FÍSICA CORRIGIDA) ===
function animate() {
    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (controls.isLocked === true && gameActive) {
        
        // === 1. ATUALIZA O RAYCASTER DE CHÃO ===
        raycaster.ray.origin.copy(controls.object.position);
        
        const intersections = raycaster.intersectObjects(objects, false);
        const onObject = intersections.length > 0;

        // === 2. FÍSICA (GRAVIDADE E ATRITO) ===
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 100.0 * delta; // Gravidade

        // === 3. LÓGICA DE CHÃO E PULO ===
        if (onObject === true) {
            const distance = intersections[0].distance;
            
            // Se estamos "em cima" de algo
            if (distance <= playerHeight) {
                // Para de cair
                velocity.y = Math.max(0, velocity.y);

                // === MUDANÇA 4: RESETAR O PULO ===
                // Apenas reseta o contador de pulos se o jogador
                // estiver *parado* no chão (velocity.y === 0).
                // Isso impede que o pulo seja resetado no meio do ar.
                if (velocity.y === 0) {
                    jumpCount = MAX_JUMPS;
                }
                
                // "Gruda" o jogador no chão
                if (velocity.y === 0) {
                    const groundY = intersections[0].point.y;
                    controls.object.position.y = groundY + playerHeight;
                }
            }
        }

        // === 4. INPUT DE MOVIMENTO ===
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize(); 

        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;

        // === 5. APLICA O MOVIMENTO ===
        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        controls.object.position.y += (velocity.y * delta);

        // === 6. LÓGICA DE QUEDA (MORTE) ===
        if (controls.object.position.y < -50) {
            gameOver('Você Caiu!');
        }

        // === 7. LÓGICA DE VITÓRIA ===
        if (controls.object.position.y > WIN_HEIGHT) {
            gameWon();
        }
        
        // === 8. LÓGICA DE PONTUAÇÃO ===
        const currentHeight = controls.object.position.y;
        if (currentHeight > maxAltitudeScore && currentHeight > playerHeight) {
            maxAltitudeScore = currentHeight;
            scoreManager.setScore(Math.floor(maxAltitudeScore - playerHeight));
        }
    }

    prevTime = time;
    renderer.render(scene, camera);
}