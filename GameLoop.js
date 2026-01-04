import * as THREE from 'three';
import { Projectile, Enemy, Explosion, Debris, AmbientAAFire } from './Entities.js';
import { getRandomHemispherePosition, checkCollision } from './Utils.js';
import { Radar } from './Radar.js';
import { audioManager } from './AudioManager.js';

export class GameLoop {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        this.projectiles = [];
        this.enemies = [];
        this.explosions = [];
        this.debris = [];
        this.ambientAA = [];

        this.score = 0;
        this.wave = 1;
        this.health = 100;
        this.weaponType = 'vulcan';

        // 武器ステータス
        this.isFiring = false;
        this.vulcanFireRate = 0.1; // 0.1秒間隔 (10Hz)
        this.vulcanTimer = 0;
        this.vulcanAccelTimer = 0; // 加速用タイマー

        this.missileAmmo = 10;
        this.maxMissileAmmo = 10;
        this.missileReloadTime = 5.0; // 5秒
        this.missileReloadTimer = 0;
        this.lockedTargets = []; // { enemy: Enemy, id: number }

        this.laserTarget = null;
        this.laserChargeTime = 0;
        this.laserBeam = null; // THREE.Line or Cylinder for visual
        this.laserHeat = 0;
        this.laserOverheated = false;
        this.laserCooldownTimer = 0;
        this.maxLaserHeat = 5.0;
        this.laserCooldownTime = 20.0;

        // 難易度設定
        this.spawnTimer = 0;
        this.spawnInterval = 2.0;
        this.enemiesDestroyedInWave = 0;

        // 地対空砲台（CIWS）の設定
        this.aaBatteries = [
            { pos: new THREE.Vector3(40, 0, 40), dir: new THREE.Vector3(-0.5, 1.5, -0.5).normalize(), timer: 0, firing: false, burstTimer: 0 },
            { pos: new THREE.Vector3(-40, 0, 40), dir: new THREE.Vector3(0.5, 1.5, -0.5).normalize(), timer: 0, firing: false, burstTimer: 0 },
            { pos: new THREE.Vector3(40, 0, -40), dir: new THREE.Vector3(-0.5, 1.5, 0.5).normalize(), timer: 0, firing: false, burstTimer: 0 },
            { pos: new THREE.Vector3(-40, 0, -40), dir: new THREE.Vector3(0.5, 1.5, 0.5).normalize(), timer: 0, firing: false, burstTimer: 0 }
        ];

        this.gameMode = 'missile'; // 'missile' or 'aircraft'
        this.isPlaying = false;

        // UI要素
        this.scoreEl = document.getElementById('score');
        this.waveEl = document.getElementById('wave');
        this.healthEl = document.getElementById('health');
        this.messageOverlay = document.getElementById('message-overlay');
        this.messageTitle = document.getElementById('message-title');
        this.messageSub = document.getElementById('message-sub');

        this.missileAmmoEl = document.getElementById('missile-ammo');
        this.reloadContainer = document.getElementById('reload-container');
        this.reloadProgressEl = document.getElementById('reload-progress');
        this.lockonCountEl = document.getElementById('lockon-count');
        this.laserTargetEl = document.getElementById('laser-target');

        this.radar = new Radar('radar-container', this);
        this.setupLaserEffect();
        this.bindEvents();
    }

    setupLaserEffect() {
        const material = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        this.laserBeam = new THREE.Line(geometry, material);
        this.laserBeam.visible = false;
        this.scene.add(this.laserBeam);
    }

    bindEvents() {
        window.addEventListener('keydown', (e) => {
            if (!this.isPlaying) return;
            if (e.key === '1') this.switchWeapon('vulcan');
            if (e.key === '2') this.switchWeapon('missile');
            if (e.key === '3') this.switchWeapon('laser');
        });
    }

    startGame(mode = 'missile') {
        this.gameMode = mode;
        this.score = 0;
        this.wave = 1;
        this.health = 100;
        this.spawnInterval = 2.0;
        this.enemiesDestroyedInWave = 0;
        this.missileAmmo = this.maxMissileAmmo;
        this.missileReloadTimer = 0;
        this.lockedTargets = [];
        this.clearEntities();
        this.isPlaying = true;
        this.messageOverlay.classList.add('hidden');
        this.updateUI();
    }

    gameOver() {
        this.isPlaying = false;
        this.messageTitle.innerText = "ゲームオーバー";
        this.messageSub.innerText = "クリックして再挑戦";
        this.messageOverlay.classList.remove('hidden');
    }

    clearEntities() {
        [...this.projectiles, ...this.enemies, ...this.explosions, ...this.debris, ...this.ambientAA].forEach(e => e.remove());
        this.projectiles = [];
        this.enemies = [];
        this.explosions = [];
        this.debris = [];
        this.ambientAA = [];
        this.laserBeam.visible = false;
    }

    switchWeapon(type) {
        this.weaponType = type;
        document.querySelectorAll('.weapon').forEach(el => el.classList.remove('active'));
        const el = document.getElementById(`weapon-${type}`);
        if (el) el.classList.add('active');

        // レティクルの切り替え
        document.querySelectorAll('.reticle').forEach(el => el.classList.add('hidden'));
        document.getElementById(`reticle-${type}`).classList.remove('hidden');

        // ロックオン等のリセット
        this.lockedTargets = [];
        this.laserTarget = null;
        if (this.laserBeam) this.laserBeam.visible = false;
    }

    setFiring(state) {
        this.isFiring = state;
        if (!state) {
            if (this.laserBeam) this.laserBeam.visible = false;
            this.laserTarget = null;
            this.vulcanAccelTimer = 0; // 指を離したら加速リセット
        }
    }

    update(dt) {
        if (!this.isPlaying) return;

        // ミサイル装填管理
        if (this.missileReloadTimer > 0) {
            this.missileReloadTimer -= dt;
            if (this.missileReloadTimer <= 0) {
                this.missileReloadTimer = 0;
                this.missileAmmo = this.maxMissileAmmo;
            }
        }

        // 武器ロジック
        if (this.isFiring) {
            switch (this.weaponType) {
                case 'vulcan':
                    this.vulcanTimer += dt;
                    this.vulcanAccelTimer += dt;
                    // 加速ロジック: 4秒かけて 0.1s(10Hz) -> 0.02s(50Hz) まで加速
                    const dynamicRate = Math.max(0.02, 0.1 - (this.vulcanAccelTimer * 0.02));
                    if (this.vulcanTimer >= dynamicRate) {
                        this.vulcanTimer = 0;
                        this.fireVulcan();
                    }
                    break;
                case 'missile':
                    // ミサイルはクリックした瞬間に一括発射
                    break;
                case 'laser':
                    if (!this.laserOverheated) {
                        this.updateLaser(dt);
                        this.laserHeat = Math.min(this.maxLaserHeat, this.laserHeat + dt);
                        if (this.laserHeat >= this.maxLaserHeat) {
                            console.log("Laser OVERHEAT!");
                            this.laserOverheated = true;
                            this.laserCooldownTimer = this.laserCooldownTime;
                            if (this.laserBeam) this.laserBeam.visible = false;
                        }
                    } else {
                        if (this.laserBeam) this.laserBeam.visible = false;
                    }
                    break;
            }
        } else {
            // 発射していない時の冷却
            if (this.laserHeat > 0 && !this.laserOverheated) {
                this.laserHeat = Math.max(0, this.laserHeat - dt * 2.0);
            }
        }

        // オーバーヒート強制冷却
        if (this.laserOverheated) {
            this.laserCooldownTimer -= dt;
            if (this.laserCooldownTimer <= 0) {
                console.log("Laser cooldown complete!");
                this.laserOverheated = false;
                this.laserHeat = 0;
                this.laserCooldownTimer = 0;
            }
        }

        // 演出：地対空射撃 (CIWS)
        this.aaBatteries.forEach(battery => {
            battery.timer -= dt;
            if (battery.firing) {
                battery.burstTimer -= dt;
                if (battery.timer <= 0) {
                    this.ambientAA.push(new AmbientAAFire(this.scene, battery.pos, battery.dir));
                    battery.timer = 0.05; // 0.05秒間隔の超高速連射
                }
                if (battery.burstTimer <= 0) {
                    battery.firing = false;
                    battery.timer = 2.0 + Math.random() * 3.0; // 次のバーストまでの待機
                }
            } else {
                if (battery.timer <= 0) {
                    battery.firing = true;
                    battery.burstTimer = 1.0 + Math.random() * 2.0; // 1-2秒間の連射
                }
            }
        });

        this.ambientAA.forEach(aa => aa.update(dt));
        for (let i = this.ambientAA.length - 1; i >= 0; i--) {
            if (this.ambientAA[i].isDead) this.ambientAA.splice(i, 1);
        }

        // ミサイルのロックオン走査 (常時)
        if (this.weaponType === 'missile' && this.missileAmmo > 0 && this.missileReloadTimer === 0) {
            this.scanMissileTargets();
        }

        // 敵のスポーン
        this.spawnTimer += dt;
        if (this.spawnTimer > this.spawnInterval) {
            this.spawnTimer = 0;
            this.spawnEnemy();
        }

        // 更新
        this.projectiles.forEach(p => p.update(dt));
        this.enemies.forEach(e => e.update(dt, this.camera));
        this.explosions.forEach(e => e.update(dt));
        this.debris.forEach(d => d.update(dt));

        // 判定
        this.handleCollisions();

        this.radar.update();
        this.updateUI();
    }

    fireVulcan() {
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        this.fire(this.camera.position, direction);
    }

    scanMissileTargets() {
        // カメラの正面方向に対する角度（視野内）でロックオン
        const maxAngle = 0.35; // レティクルの大きさに合わせる (拡大)
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);

        // 一旦すべてのロックを解除
        this.enemies.forEach(enemy => enemy.setLocked(false));

        const newLocked = [];
        this.enemies.forEach(enemy => {
            const toEnemy = enemy.mesh.position.clone().sub(this.camera.position).normalize();
            const angle = direction.angleTo(toEnemy);

            if (angle < maxAngle && newLocked.length < this.missileAmmo) {
                newLocked.push(enemy);
                enemy.setLocked(true); // マーカーを表示
            }
        });
        this.lockedTargets = newLocked;
    }

    fireMissiles() {
        if (this.weaponType !== 'missile' || this.missileAmmo <= 0 || this.missileReloadTimer > 0) return;
        if (this.lockedTargets.length === 0) {
            // ロックオンなしでも正面に1発撃つ
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            this.fire(this.camera.position, direction);
            this.missileAmmo--;
        } else {
            // ロックオンターゲットに発射
            this.lockedTargets.forEach(target => {
                const direction = target.mesh.position.clone().sub(this.camera.position).normalize();
                this.fire(this.camera.position, direction, target);
                this.missileAmmo--;
            });
        }

        if (this.missileAmmo <= 0) {
            this.missileAmmo = 0;
            this.missileReloadTimer = this.missileReloadTime;
        }
    }

    updateLaser(dt) {
        // レテイクル内 (広域: 0.2) のすべての敵を即座に破棄
        const maxAngle = 0.2;
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);

        let hitAny = false;
        this.enemies.forEach(enemy => {
            const toEnemy = enemy.mesh.position.clone().sub(this.camera.position).normalize();
            const angle = direction.angleTo(toEnemy);
            if (angle < maxAngle) {
                this.createExplosion(enemy.mesh.position, enemy.color);
                enemy.remove();
                this.score += (enemy.type === 'bomber' ? 500 : 50);
                this.enemiesDestroyedInWave++;
                hitAny = true;
            }
        });

        if (hitAny) {
            this.checkWaveProgress();
        }

        // ビジュアル演出
        const isCurrentlyFiring = this.isFiring && !this.laserOverheated;
        this.laserBeam.visible = isCurrentlyFiring;
        if (isCurrentlyFiring) {
            const targetPos = this.camera.position.clone().add(direction.clone().multiplyScalar(100));
            this.laserBeam.geometry.setFromPoints([
                this.camera.position.clone().add(new THREE.Vector3(0, -0.5, 0)),
                targetPos
            ]);
        }
    }

    handleCollisions() {
        // 弾 vs 敵
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            let hit = false;
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                if (checkCollision(p, e)) {
                    hit = true;
                    e.health--;
                    if (e.health <= 0) {
                        this.createExplosion(e.mesh.position, e.color);
                        e.remove();
                        this.enemies.splice(j, 1);
                        this.score += (e.type === 'bomber' ? 500 : 100);
                        this.enemiesDestroyedInWave++;
                        this.checkWaveProgress();
                    } else {
                        this.createExplosion(p.mesh.position);
                    }
                    break;
                }
            }
            if (hit) {
                p.remove();
                this.projectiles.splice(i, 1);
            } else if (p.isDead) {
                p.remove();
                this.projectiles.splice(i, 1);
            }
        }

        // 敵の直撃
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (e.impact) {
                this.createExplosion(e.mesh.position, e.color);
                this.takeDamage(10);
                this.enemies.splice(i, 1);
            } else if (e.isDead) {
                this.enemies.splice(i, 1);
            }
        }

        for (let i = this.explosions.length - 1; i >= 0; i--) {
            if (this.explosions[i].isDead) {
                this.explosions.splice(i, 1);
            }
        }

        for (let i = this.debris.length - 1; i >= 0; i--) {
            if (this.debris[i].isDead) {
                this.debris.splice(i, 1);
            }
        }
    }

    fire(origin, direction, target = null) {
        if (!this.isPlaying) return;

        let speed = 100;
        if (this.weaponType === 'laser') return; // レーザーは別処理
        if (this.weaponType === 'missile') speed = 60;

        // ウェーブ強化（バルカンのみに適用するように変更）
        let shotCount = 1;
        if (this.weaponType === 'vulcan') {
            if (this.wave >= 3) shotCount = 2;
            if (this.wave >= 6) shotCount = 3;
        }

        for (let i = 0; i < shotCount; i++) {
            const offsetDist = (i - (shotCount - 1) / 2) * 1.5;
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize();
            const spreadOrigin = origin.clone().addScaledVector(right, offsetDist);

            const finalDir = direction.clone();
            const proj = new Projectile(this.scene, spreadOrigin, finalDir, speed, this.weaponType, target);
            this.projectiles.push(proj);
        }
        audioManager.playFire(this.weaponType);
    }

    spawnEnemy() {
        let type = 'missile';
        const pos = getRandomHemispherePosition(120);
        let target = new THREE.Vector3(0, 5, 0); // 地面すれすれではなく少し浮かせる
        let moveMode = 'direct';
        let patternParams = {};

        if (this.gameMode === 'missile') {
            const missileChance = Math.min(0.8, 0.3 + (this.wave * 0.05));
            type = Math.random() < missileChance ? 'missile' : 'drone';
        } else {
            // 航空機モード: 動作パターンを多様化
            const randType = Math.random();
            if (randType < 0.6) type = 'fighter';
            else if (randType < 0.9) type = 'helicopter';
            else type = 'bomber';

            const randMode = Math.random();
            if (randMode < 0.3) {
                moveMode = 'crossing';
                target = pos.clone().multiplyScalar(-1.2);
                target.y = Math.max(15, pos.y + (Math.random() - 0.5) * 30);
                patternParams = { direction: Math.random() < 0.5 ? 1 : -1 };
            } else if (randMode < 0.6) {
                moveMode = 'flyby';
                const flybyPoint = new THREE.Vector3(
                    (Math.random() - 0.5) * 50,
                    25 + Math.random() * 20,
                    (Math.random() - 0.5) * 50
                );
                const dir = flybyPoint.clone().sub(pos).normalize();
                target = pos.clone().add(dir.multiplyScalar(300));
                target.y = Math.max(20, target.y);
            } else if (randMode < 0.8) {
                moveMode = 'orbit';
                target = getRandomHemispherePosition(80); // 旋回中心
                target.y = Math.max(30, target.y);
                patternParams = {
                    radius: 25 + Math.random() * 30,
                    direction: Math.random() < 0.5 ? 1 : -1
                };
            } else {
                moveMode = 'orbit';
                target = new THREE.Vector3(0, 45 + Math.random() * 30, 0);
                patternParams = {
                    radius: 35 + Math.random() * 40,
                    direction: Math.random() < 0.5 ? 1 : -1
                };
            }
        }

        const enemy = new Enemy(this.scene, pos, target, type, moveMode, patternParams);
        this.enemies.push(enemy);
    }

    createExplosion(pos, color = null) {
        this.explosions.push(new Explosion(this.scene, pos));

        // 派手な部品（デブリ）を生成
        const debrisCount = 10 + Math.floor(Math.random() * 10);
        const debrisColor = color || new THREE.Color(0xffaa00);
        for (let i = 0; i < debrisCount; i++) {
            this.debris.push(new Debris(this.scene, pos, debrisColor));
        }

        // 音を鳴らす
        audioManager.playExplosion();
    }

    checkWaveProgress() {
        if (this.enemiesDestroyedInWave >= this.wave * 5) {
            this.wave++;
            this.enemiesDestroyedInWave = 0;
            this.spawnInterval = Math.max(0.4, this.spawnInterval * 0.85);
            this.health = Math.min(100, this.health + 10);
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.gameOver();
        }
    }

    updateUI() {
        if (this.scoreEl) this.scoreEl.innerText = this.score;
        if (this.waveEl) this.waveEl.innerText = this.wave;
        if (this.healthEl) this.healthEl.innerText = this.health;

        // ミサイルUI
        if (this.missileAmmoEl) this.missileAmmoEl.innerText = this.missileAmmo;
        if (this.missileReloadTimer > 0) {
            if (this.reloadContainer) this.reloadContainer.classList.remove('hidden');
            if (this.reloadProgressEl) {
                const progress = ((this.missileReloadTime - this.missileReloadTimer) / this.missileReloadTime) * 100;
                this.reloadProgressEl.style.width = `${progress}%`;
            }
        } else {
            if (this.reloadContainer) this.reloadContainer.classList.add('hidden');
        }

        if (this.lockonCountEl) {
            this.lockonCountEl.innerText = `${this.lockedTargets.length} LOCKED`;
            this.lockonCountEl.style.color = this.lockedTargets.length > 0 ? 'red' : 'yellow';
        }

        // レーザーUI
        const laserInfoEl = document.getElementById('laser-info');
        const laserHeatEl = document.getElementById('laser-overheat-progress');
        const laserCooldownEl = document.getElementById('laser-cooldown-msg');

        if (laserInfoEl) {
            if (this.weaponType === 'laser') {
                laserInfoEl.style.display = 'block';
            } else {
                laserInfoEl.style.display = 'none';
            }
        }

        if (laserHeatEl) {
            const heatPercent = (this.laserHeat / this.maxLaserHeat) * 100;
            laserHeatEl.style.width = `${heatPercent}%`;
            laserHeatEl.style.background = this.laserOverheated ? '#ff0000' : '#0ff';
        }
        if (laserCooldownEl) {
            if (this.laserOverheated) {
                laserCooldownEl.classList.remove('hidden');
                laserCooldownEl.innerText = `COOLING: ${Math.ceil(this.laserCooldownTimer)}s`;
            } else {
                laserCooldownEl.classList.add('hidden');
            }
        }
    }
}
