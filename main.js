import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GameLoop } from './GameLoop.js';
import { audioManager } from './AudioManager.js';
import './style.css';

console.log("Main.js: Script loading...");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000510);
scene.fog = new THREE.FogExp2(0x000510, 0.005);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('game-container').appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);
const gameLoop = new GameLoop(scene, camera);

const btnMissile = document.getElementById('btn-missile');
const btnAircraft = document.getElementById('btn-aircraft');

const handleStart = (mode) => {
  console.log(`Main: Starting game in ${mode} mode`);
  // 必ずゲームを開始状態にする
  gameLoop.startGame(mode);
  // 音声システム初期化
  audioManager.init();
  // その後ポインターロックを要求
  controls.lock();
};

if (btnMissile) {
  btnMissile.addEventListener('click', (e) => {
    e.stopPropagation();
    console.log("Missile button clicked");
    handleStart('missile');
  });
}

if (btnAircraft) {
  btnAircraft.addEventListener('click', (e) => {
    e.stopPropagation();
    console.log("Aircraft button clicked");
    handleStart('aircraft');
  });
}

const pauseOverlay = document.getElementById('pause-overlay');
const btnResume = document.getElementById('btn-resume');

// 状態管理を明確化
controls.addEventListener('lock', () => {
  console.log('Main: Pointer Locked - Hiding pause overlay and resuming game');
  if (pauseOverlay) pauseOverlay.classList.add('hidden');
  audioManager.resume();

  // スタート画面が出ていない時のみ、isPlaying を true に戻す
  const messageOverlay = document.getElementById('message-overlay');
  const isStartScreenVisible = messageOverlay && !messageOverlay.classList.contains('hidden');

  if (!isStartScreenVisible) {
    gameLoop.isPlaying = true;
  }
});

controls.addEventListener('unlock', () => {
  console.log('Main: Pointer Unlocked');
  // ゲーム中に（ESC等で）アンロックされた場合のみポーズ画面を出す
  if (gameLoop.isPlaying) {
    console.log('Main: Game was playing, triggering pause');
    gameLoop.isPlaying = false;
    if (pauseOverlay) pauseOverlay.classList.remove('hidden');
  }
});

if (btnResume) {
  const resumeAction = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    console.log("Main: Resume requested - Requesting pointer lock");

    // UIを先に消して状態をセット（即時性を高める）
    if (pauseOverlay) pauseOverlay.classList.add('hidden');
    gameLoop.isPlaying = true;

    // ポインターロックの再要求
    controls.lock();
  };

  btnResume.addEventListener('click', resumeAction);

  // オーバーレイ全体をクリックしても復帰できるようにする（予備）
  if (pauseOverlay) {
    pauseOverlay.addEventListener('click', (e) => {
      // ボタン以外の場所（背景など）をクリックした場合でも復帰
      if (e.target === pauseOverlay) {
        resumeAction(e);
      }
    });
  }
}

const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(0, 50, 50);
scene.add(dirLight);

const gridHelper = new THREE.GridHelper(2000, 100, 0x004400, 0x002200);
scene.add(gridHelper);

const groundGeo = new THREE.PlaneGeometry(2000, 2000);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x050a05, roughness: 0.8 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const turretGeo = new THREE.BoxGeometry(2, 2, 2);
const turretMat = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
const turret = new THREE.Mesh(turretGeo, turretMat);
turret.position.set(0, -0.5, 0);
scene.add(turret);

// 連続射撃のステート管理
window.addEventListener('mousedown', (e) => {
  if (controls.isLocked && gameLoop.isPlaying) {
    if (gameLoop.weaponType === 'missile') {
      gameLoop.fireMissiles();
    } else {
      gameLoop.setFiring(true);
    }
  }
});

window.addEventListener('mouseup', () => {
  gameLoop.setFiring(false);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  gameLoop.update(dt);
  renderer.render(scene, camera);
}
animate();
