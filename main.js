import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let camera, scene, renderer, controls;
const objects = [];
const movingObjects = []; // Array para blocos que se movem
let raycaster; // Nosso único raycaster, usado para o chão
let scoreElement; 
let skyboxMesh; // Variável global para o céu

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;

let jumpCount = 0;
const MAX_JUMPS = 2; // Define o número máximo de pulos (1 = pulo normal, 2 = pulo duplo)

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();


// === NOVAS VARIÁVEIS GLOBAIS ===
let maxAltitudeScore = 0;
const WIN_HEIGHT = 600;
const MAP_BOUNDARY = 400; // Limite da borda do mapa

// Variáveis de Estado do Jogo e Tempo
let gameActive = false;
let isPaused = false; 
const INITIAL_GAME_TIME = 300; // Tempo inicial em segundos (5 minutos)
let gameTime = INITIAL_GAME_TIME;
let timerInterval;
let timerElement;
let finalScore = 0;
let playerName = 'Jogador'; // Nome padrão

//  VARIÁVEL DE ALTURA DO JOGADOR
const playerHeight = 10.0; // Altura do "pé" do jogador em relação à câmera

// NOVAS VARIÁVEIS DE ÁUDIO 
let audioListener, backgroundMusic, jumpSound;
let audioLoader;

init();

function init() {
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.y = playerHeight;

    scene = new THREE.Scene();

    // CÉU AZUL COM NUVENS 
    const cubeTextureLoader = new THREE.CubeTextureLoader();
    // Links estáveis do three.js para um céu azul
    const textureCube = cubeTextureLoader.load([
        'https://threejs.org/examples/textures/cube/Bridge2/posx.jpg', // Direita
        'https://threejs.org/examples/textures/cube/Bridge2/negx.jpg', // Esquerda
        'https://threejs.org/examples/textures/cube/Bridge2/posy.jpg', // Cima
        'https://threejs.org/examples/textures/cube/Bridge2/negy.jpg', // Baixo
        'https://threejs.org/examples/textures/cube/Bridge2/posz.jpg', // Frente
        'https://threejs.org/examples/textures/cube/Bridge2/negz.jpg'  // Trás
    ]);
    const skyboxGeo = new THREE.BoxGeometry(2000, 2000, 2000); 
    const skyboxMat = new THREE.MeshBasicMaterial({
        envMap: textureCube, 
        side: THREE.BackSide  // Renderiza o lado *interno* do cubo
    });
    skyboxMesh = new THREE.Mesh(skyboxGeo, skyboxMat);
    scene.add(skyboxMesh);
    
    //  MUDANÇA: NÉVOA DE CÉU CLARO 
    scene.fog = new THREE.Fog(0xa0c4ff, 0,950); // Cor da névoa (azul claro)

    //  MUDANÇA: LUZ DIURNA 
    const light = new THREE.HemisphereLight(0xffffff, 0x888888, 2.0); // Luz branca de cima, cinza de baixo
    light.position.set(0.5, 1, 0.75);
    scene.add(light);

    controls = new PointerLockControls(camera, document.body);

    //  INICIALIZAÇÃO DE ÁUDIO 
    audioListener = new THREE.AudioListener();
    camera.add(audioListener); // Adiciona o "ouvido" à câmera
    backgroundMusic = new THREE.Audio(audioListener);
    jumpSound = new THREE.Audio(audioListener);
    audioLoader = new THREE.AudioLoader();
    audioLoader.load('music/background.mp3', function(buffer) {
        backgroundMusic.setBuffer(buffer);
        backgroundMusic.setLoop(true);
        backgroundMusic.setVolume(0.3);
    }, (xhr) => {}, (err) => {
        console.error('ERRO: Não foi possível carregar music/background.mp3', err);
    });
    audioLoader.load('sounds/jump.mp3', function(buffer) {
        jumpSound.setBuffer(buffer);
        jumpSound.setVolume(0.5);
        console.log("Sucesso: Som de pulo (sounds/jump.mp3) carregado.");
    }, (xhr) => {}, (err) => {
        console.error('ERRO: Não foi possível carregar sounds/jump.mp3', err);
    });
    // =============================

    //  BUSCA DE ELEMENTOS DA UI 
    const blocker = document.getElementById('blocker');
    const instructions = document.getElementById('instructions');
    const pauseScreen = document.getElementById('pauseScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');

    scoreElement = document.getElementById('scoreValue'); 
    timerElement = document.getElementById('timerValue');

    //  LISTENERS DOS BOTÕES DA UI 
    document.getElementById('playButton').addEventListener('click', () => {
        const nameInput = document.getElementById('playerNameInput');
        if (nameInput.value.trim() !== '') {
            playerName = nameInput.value.trim(); 
            console.log(playerName)
        } else {
            playerName = 'Jogador';
        }
        if (audioListener.context.state === 'suspended') {
            audioListener.context.resume();
        }
        if (backgroundMusic && !backgroundMusic.isPlaying) {
            backgroundMusic.play();
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
        isPaused = false;
        gameActive = false;
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

    //  LISTENERS DO CONTROLE (LOCK/UNLOCK)
    controls.addEventListener('lock', function () {
        blocker.style.display = 'none';
        instructions.style.display = 'none';
        pauseScreen.style.display = 'none';
        gameOverScreen.style.display = 'none';
        document.getElementById('rankingOverlay').style.display = 'none'; 

        if (isPaused) {
            isPaused = false;
            resumeGame();
        } else if (!gameActive) {
            startGame();
        }
    });

    controls.addEventListener('unlock', function () {
        blocker.style.display = 'block';

        if (gameActive) {
            gameActive = false;
            isPaused = true; 
            clearInterval(timerInterval);
            pauseScreen.style.display = 'flex';
        } else {
            isPaused = false; 
            if (gameOverScreen.style.display === 'none' && document.getElementById('rankingOverlay').style.display === 'none') {
                instructions.style.display = 'flex';
            }
        }
    });

    scene.add(controls.object);

    //  KEYDOWN / KEYUP 
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
            case 'Space':
                if (jumpCount > 0 && gameActive) { 
                    velocity.y = 250;
                    jumpCount--;
                    if (jumpSound && jumpSound.buffer) {
                        if (jumpSound.isPlaying) {
                            jumpSound.stop();
                        }
                        jumpSound.play();
                    } else {
                        console.warn("Som de pulo não tocou (buffer vazio). Verifique o caminho 'sounds/jump.mp3'");
                    }
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

    //  RAYCASTER 
    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, playerHeight + 0.1);

    //  TEXTURAS
    const textureLoader = new THREE.TextureLoader();
    
    //  TEXTURA DO CHÃO MINECRAFT 
    const floorTexture = textureLoader.load('img/minecraftTop.png'); // Sua textura original
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(500, 500);
    floorTexture.magFilter = THREE.NearestFilter; 
    
    const sideTexture = textureLoader.load('img/minecraftTextureBlock.png');
    sideTexture.magFilter = THREE.NearestFilter; 
    const topTexture = textureLoader.load('img/minecraftTop.png');
    topTexture.magFilter = THREE.NearestFilter; 
    const bottomTexture = textureLoader.load('img/minecraftBot.png');
    bottomTexture.magFilter = THREE.NearestFilter; 

    //  CHÃO MINECRAFT 
    let floorGeometry = new THREE.PlaneGeometry(2000, 2000, 100, 100);
    floorGeometry.rotateX(-Math.PI / 2);

    const floorMaterial = new THREE.MeshBasicMaterial({ map: floorTexture, color: 0xffffff }); // Cor branca (sem tintura)
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    scene.add(floor);
    objects.push(floor); 

    
    //  OBJETOS (BLOCOS, CILINDROS, ESFERAS)
    const sideMaterial = new THREE.MeshBasicMaterial({ 
        map: sideTexture, 
        color: 0xbb8866 
    });
    const topMaterial = new THREE.MeshBasicMaterial({ 
        map: topTexture, 
        color: 0x99ff99 
    });
    const bottomMaterial = new THREE.MeshBasicMaterial({ 
        map: bottomTexture, 
        color: 0x996644 
    });
    
    // Geometrias
    const boxGeometry = new THREE.BoxGeometry(10, 10, 10).toNonIndexed();
    const cylinderGeometry = new THREE.CylinderGeometry(5, 5, 10, 16); 
    const sphereGeometry = new THREE.SphereGeometry(6, 16, 16); 
    const geometries = [
        boxGeometry, boxGeometry, boxGeometry, 
        cylinderGeometry,
        sphereGeometry
    ];

    //  MUDANÇA: MATERIAIS COM TEXTURA PARA CILINDRO E ESFERA
    const boxMaterial = [sideMaterial, sideMaterial, topMaterial, bottomMaterial, sideMaterial, sideMaterial];
    
    // Material do Cilindro (textura lateral azulada, textura do topo azulada)
    const cylinderSideMaterial = new THREE.MeshBasicMaterial({ map: sideTexture, color: 0x8888ff }); // Azul
    const cylinderTopMaterial = new THREE.MeshBasicMaterial({ map: topTexture, color: 0x8888ff }); // Azul
    const cylinderMaterial = [cylinderSideMaterial, cylinderTopMaterial, cylinderTopMaterial]; // Lados, Topo, Base
    
    // Material da Esfera (textura do topo avermelhada)
    const sphereMaterial = new THREE.MeshBasicMaterial({ map: topTexture, color: 0xff8888 }); // Vermelho

    const materials = [
        boxMaterial, boxMaterial, boxMaterial,
        cylinderMaterial,
        sphereMaterial
    ];
    

    for (let i = 0; i < 1000; i++) {
        const shapeIndex = Math.floor(Math.random() * geometries.length);
        
        const mesh = new THREE.Mesh(geometries[shapeIndex], materials[shapeIndex]);
        
        mesh.position.x = Math.floor(Math.random() * 30 - 15) * 12;
        const baseY = Math.floor(Math.random() * 30) * 20 + 10;
        
        // Ajusta a altura da base. O centro do Box/Cilindro é +5, Esfera é +6
        if (geometries[shapeIndex] === sphereGeometry) {
             mesh.position.y = baseY + 6;
        } else {
             mesh.position.y = baseY + 5;
        }
        
        mesh.position.z = Math.floor(Math.random() * 30 - 15) * 12;
        scene.add(mesh);
        objects.push(mesh); 

        if (baseY > 150) {
            if (Math.random() < 0.3) { 
                mesh.initialX = mesh.position.x; 
                movingObjects.push(mesh);
            }
        }
    }

    // BLOCO DE VITÓRIA 
    const victoryGeometry = new THREE.BoxGeometry(200, 5, 200);
    const victoryMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00, transparent: true, opacity: 0.5 });
    const victoryBox = new THREE.Mesh(victoryGeometry, victoryMaterial);
    victoryBox.position.set(0, WIN_HEIGHT + 2.5, 0);
    scene.add(victoryBox);
   
    //  RENDERIZADOR
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

// FUNÇÃO DE RESPAWN
function respawnPlayer() {
    controls.object.position.set(0, playerHeight, 0); 
    velocity.set(0, 0, 0);
    jumpCount = 0; // Reseta o pulo duplo
}


// FUNÇÕES DE ESTADO DE JOGO 
function startGame() {
    gameActive = true;
    isPaused = false; 
    gameTime = INITIAL_GAME_TIME; 
    maxAltitudeScore = 0;
    scoreElement.textContent = '0'; 
    
    respawnPlayer(); 
    
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
    updateTimerDisplay();
}

function resumeGame() {
    gameActive = true;
    isPaused = false; 
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
    isPaused = false; 
    clearInterval(timerInterval);
    
    finalScore = Math.floor(maxAltitudeScore - playerHeight);
    scoreElement.textContent = finalScore; 
    
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
    scoreElement.textContent = finalScore; 
    
    const elapsedTime = INITIAL_GAME_TIME - gameTime;
    
    saveScore(finalScore, elapsedTime, true); 
    controls.unlock();
    
    document.getElementById('gameOverMessage').textContent = 'VOCÊ VENCEU!';
    document.getElementById('gameOverScore').textContent = `Pontuação: ${finalScore}m | Tempo: ${formatTime(elapsedTime)}`;
    document.getElementById('gameOverScreen').style.display = 'flex';
    showRanking(); 
}

// === FUNÇÕES DE RANKING ===
function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function saveScore(score, time, isWin = false) { 
    const ranking = JSON.parse(localStorage.getItem('OEscaladorRanking')) || [];
    
    ranking.push({ name: playerName, score: score, time: time }); 

    ranking.sort((a, b) => {
        if (a.score !== b.score) {
            return b.score - a.score; 
        }
        
        if (a.time === null) return 1; 
        if (b.time === null) return -1;
        return a.time - b.time; 
    });

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
        ranking.forEach((item) => { 
            const li = document.createElement('li');
            
            let timeString = "";
            if (item.time !== null) {
                timeString = ` (em ${formatTime(item.time)})`;
            }
            
            li.textContent = `${item.name}: ${item.score} metros${timeString}`;
            
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
    }
}
function resetRanking() {
    localStorage.removeItem('OEscaladorRanking');
    showRanking();
}

// FUNÇÃO DE ANIMAÇÃO 
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

        // ROTAÇÃO DO SKYBOX
        if (skyboxMesh) {
            skyboxMesh.rotation.y += 0.005 * delta; // Gira as nuvens lentamente
        }

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

                if (velocity.y === 0) {
                    jumpCount = MAX_JUMPS;
                }
                
                const groundObject = intersections[0].object;
                const groundY = intersections[0].point.y;
                
                controls.object.position.y = groundY + playerHeight; 

                if (groundObject.deltaX !== undefined) {
                    controls.object.position.x += groundObject.deltaX;
                }
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
            scoreElement.textContent = Math.floor(maxAltitudeScore - playerHeight);
        }

        if (controls.object.position.y < -50) {
            respawnPlayer();
        }

        if (Math.abs(controls.object.position.x) > MAP_BOUNDARY || Math.abs(controls.object.position.z) > MAP_BOUNDARY) {
            respawnPlayer();
        }

        if (controls.object.position.y > WIN_HEIGHT) {
            gameWon();
        }
    } 
    
    prevTime = time;
    renderer.render(scene, camera);
}