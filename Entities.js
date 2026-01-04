import * as THREE from 'three';

/**
 * 基本エンティティクラス
 */
export class Entity {
    constructor(scene, position, color, radius) {
        this.scene = scene;
        this.radius = radius;
        this.isDead = false;

        const geometry = new THREE.SphereGeometry(radius, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: color });
        this.mesh = new THREE.Mesh(geometry, material);

        if (position) {
            this.mesh.position.copy(position);
        }
        this.scene.add(this.mesh);
    }

    update(dt) {
        // 各エンティティでオーバーライド
    }

    remove() {
        this.isDead = true;
        if (this.mesh) {
            this.scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
        }
    }
}

/**
 * 弾（プロジェクトイル）クラス
 */
export class Projectile extends Entity {
    constructor(scene, position, direction, speed, type, target = null) {
        super(scene, position, 0xffff00, 0.5);
        this.velocity = direction.clone().normalize().multiplyScalar(speed);
        this.speed = speed;
        this.lifeTime = 3.0; // 生存時間（秒）
        this.type = type; // 'vulcan', 'missile', 'laser'
        this.target = target;

        if (type === 'laser') {
            this.mesh.material.color.setHex(0x00ffff);
            this.mesh.scale.set(0.5, 0.5, 4); // 細長い形状
            this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
            this.radius = 1.0;
            this.lifeTime = 1.0;
        } else if (type === 'missile') {
            this.mesh.material.color.setHex(0xffaa00);
            this.radius = 1.0;
            this.lifeTime = 5.0;
        }
    }

    update(dt) {
        if (this.type === 'missile' && this.target && !this.target.isDead) {
            // ホーミングロジック
            const desiredDir = this.target.mesh.position.clone().sub(this.mesh.position).normalize();
            // 現在の速度ベクトルから目標ベクトルへ徐々に回転させる (旋回性能)
            const turnFactor = 5.0 * dt;
            const currentDir = this.velocity.clone().normalize();
            currentDir.lerp(desiredDir, turnFactor).normalize();
            this.velocity.copy(currentDir.multiplyScalar(this.speed));

            // 進行方向を向かせる
            const lookTarget = this.mesh.position.clone().add(this.velocity);
            this.mesh.lookAt(lookTarget);
        }

        this.mesh.position.addScaledVector(this.velocity, dt);
        this.lifeTime -= dt;
        if (this.lifeTime <= 0) {
            this.remove();
        }
    }
}

/**
 * 敵クラス（ミサイル・ドローン・航空機）
 */
export class Enemy extends Entity {
    constructor(scene, position, targetPos, type, movementMode = 'direct', patternParams = {}) {
        let radius = 1.5;
        let color = 0xff0000;
        let speed = 25;
        let health = 1;

        if (type === 'drone') {
            color = 0xff00ff;
            radius = 1.0;
            speed = 10;
        } else if (type === 'fighter') {
            color = 0xcccccc; // 明るいグレーに変更
            radius = 1.2;
            speed = 40; // 高速
        } else if (type === 'bomber') {
            color = 0x00ff44; // より明るいグリーンに変更
            radius = 3.0; // 巨大
            speed = 12; // 低速
            health = 5; // 高耐久
        } else if (type === 'helicopter') {
            color = 0xffff00; // 鮮やかなイエローに変更
            radius = 1.8;
            speed = 18;
        }

        super(scene, position, color, radius);
        this.color = color;

        // 共通マテリアル（コントラストを上げるため emissive を追加し StandardMaterial に）
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: color,
            flatShading: true,
            emissive: color,
            emissiveIntensity: 0.2
        });
        const accentMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            flatShading: true,
            emissive: 0x333333,
            emissiveIntensity: 0.1
        });

        // 形状の変更
        this.scene.remove(this.mesh);
        this.mesh = new THREE.Group();
        this.model = new THREE.Group(); // アニメーション・バンク用の子グループ
        this.mesh.add(this.model);

        if (type === 'fighter') {
            // --- 戦闘機 (改良版デルタ翼) ---
            const fuselageGeom = new THREE.ConeGeometry(radius * 0.4, radius * 3.5, 8);
            const fuselage = new THREE.Mesh(fuselageGeom, bodyMaterial);
            // 頂点を +Z (前方)に向ける
            fuselage.rotation.x = Math.PI / 2;
            this.model.add(fuselage);

            // 翼のデザイン: 前方が狭く後方に行くに従って広くなる
            const wingShape = new THREE.Shape();
            wingShape.moveTo(-radius * 0.4, 0); // 前方の付け根
            wingShape.lineTo(-radius * 4.5, -radius * 2.4); // 後方の翼端
            wingShape.lineTo(radius * 4.5, -radius * 2.4);  // 右後ろ
            wingShape.lineTo(radius * 0.4, 0);
            wingShape.lineTo(-radius * 0.4, 0);

            const wingGeom = new THREE.ShapeGeometry(wingShape);
            const wings = new THREE.Mesh(wingGeom, bodyMaterial);
            // y方向がそのままz方向になるように回転 (y:-2.4 -> z:-2.4 で後方へ)
            wings.rotation.x = Math.PI / 2;
            wings.position.set(0, 0, radius * 0.4); // 翼の開始位置を微調整
            this.model.add(wings);

            const hTailGeom = new THREE.BoxGeometry(radius * 1.8, radius * 0.05, radius * 0.7);
            const hTail = new THREE.Mesh(hTailGeom, bodyMaterial);
            hTail.position.z = -radius * 1.6; // 尾部
            this.model.add(hTail);

            const vTailGeom = new THREE.BoxGeometry(radius * 0.05, radius * 1.2, radius * 0.8);
            const vTail = new THREE.Mesh(vTailGeom, accentMaterial);
            vTail.position.y = radius * 0.6;
            vTail.position.z = -radius * 1.6;
            this.model.add(vTail);

            const canopyGeom = new THREE.SphereGeometry(radius * 0.2, 8, 8);
            const canopy = new THREE.Mesh(canopyGeom, new THREE.MeshPhongMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6 }));
            canopy.scale.set(1, 1, 2.5);
            canopy.position.y = radius * 0.25;
            canopy.position.z = radius * 0.8; // コックピットは前寄りに
            this.model.add(canopy);

        } else if (type === 'bomber') {
            // --- 爆撃機 ---
            const fuselageGeom = new THREE.BoxGeometry(radius * 0.8, radius * 0.8, radius * 4.5);
            const fuselage = new THREE.Mesh(fuselageGeom, bodyMaterial);
            this.model.add(fuselage);

            const topDecalGeom = new THREE.BoxGeometry(radius * 0.6, 0.1, radius * 3);
            const topDecal = new THREE.Mesh(topDecalGeom, accentMaterial);
            topDecal.position.y = radius * 0.4;
            topDecal.position.z = radius * 1.0; // 前方の模様
            this.model.add(topDecal);

            const wingGeom = new THREE.BoxGeometry(radius * 7, radius * 0.15, radius * 1.2);
            const wings = new THREE.Mesh(wingGeom, bodyMaterial);
            wings.position.z = radius * 0.5; // 前方の巨大な主翼
            this.model.add(wings);

            const wTopGeom = new THREE.BoxGeometry(radius * 6.8, 0.05, radius * 1.0);
            const wTop = new THREE.Mesh(wTopGeom, accentMaterial);
            wTop.position.y = 0.1;
            wings.add(wTop);

            const engineGeom = new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, radius * 0.6, 8);
            const enginePos = [-radius * 2.5, -radius * 1.2, radius * 1.2, radius * 2.5];
            enginePos.forEach(x => {
                const engine = new THREE.Mesh(engineGeom, accentMaterial);
                engine.rotation.x = Math.PI / 2;
                engine.position.set(x, -radius * 0.2, radius * 0.8); // エンジンも前方
                this.model.add(engine);
            });

            const tailGeom = new THREE.BoxGeometry(radius * 2.5, radius * 0.1, radius * 0.8);
            const tail = new THREE.Mesh(tailGeom, bodyMaterial);
            tail.position.z = -radius * 2.0; // 尾部
            this.model.add(tail);

            const vTailGeom = new THREE.BoxGeometry(radius * 0.1, radius * 1.2, radius * 0.8);
            const vTail = new THREE.Mesh(vTailGeom, bodyMaterial);
            vTail.position.y = radius * 0.6;
            vTail.position.z = -radius * 2.0; // 尾部
            this.model.add(vTail);

        } else if (type === 'helicopter') {
            // --- ヘリコプター ---
            const bodyGeom = new THREE.SphereGeometry(radius, 12, 12);
            const body = new THREE.Mesh(bodyGeom, bodyMaterial);
            body.scale.set(0.8, 1, 1.4);
            this.model.add(body);

            const mastGeom = new THREE.CylinderGeometry(radius * 0.05, radius * 0.05, radius * 0.4, 8);
            const mast = new THREE.Mesh(mastGeom, accentMaterial);
            mast.position.y = radius * 0.8;
            this.model.add(mast);

            const boomGeom = new THREE.CylinderGeometry(radius * 0.15, radius * 0.05, radius * 2.5, 8);
            const boom = new THREE.Mesh(boomGeom, bodyMaterial);
            boom.rotation.x = -Math.PI / 2; // 後方へ(-Z)
            boom.position.z = -radius * 1.5;
            this.model.add(boom);

            const rotorGroup = new THREE.Group();
            const bladeGeom = new THREE.BoxGeometry(radius * 4, radius * 0.02, radius * 0.2);
            const blade1 = new THREE.Mesh(bladeGeom, accentMaterial);
            const blade2 = new THREE.Mesh(bladeGeom, accentMaterial);
            blade2.rotation.y = Math.PI / 2;
            rotorGroup.add(blade1, blade2);
            rotorGroup.position.y = radius * 1.0 + 0.1;
            this.model.add(rotorGroup);
            this.mainRotor = rotorGroup;

            const tRotorGeom = new THREE.BoxGeometry(radius * 0.8, radius * 0.02, radius * 0.1);
            const tRotor = new THREE.Mesh(tRotorGeom, accentMaterial);
            tRotor.position.set(radius * 0.1, 0, -radius * 2.7); // 後方へ(-Z)
            tRotor.rotation.z = Math.PI / 2;
            this.model.add(tRotor);
            this.tailRotor = tRotor;

            const skidGeom = new THREE.BoxGeometry(radius * 0.1, radius * 0.1, radius * 2);
            const skid1 = new THREE.Mesh(skidGeom, accentMaterial);
            skid1.position.set(-radius * 0.5, -radius * 1, 0);
            const skid2 = new THREE.Mesh(skidGeom, accentMaterial);
            skid2.position.set(radius * 0.5, -radius * 1, 0);
            this.model.add(skid1, skid2);

        } else if (type === 'missile') {
            const geometry = new THREE.ConeGeometry(radius * 0.3, radius * 2, 8);
            const mBody = new THREE.Mesh(geometry, bodyMaterial);
            // Tip is at +Z (forward)
            mBody.rotation.x = Math.PI / 2;
            this.model.add(mBody);
            const finGeom = new THREE.BoxGeometry(radius * 0.8, radius * 0.05, radius * 0.4);
            const fin1 = new THREE.Mesh(finGeom, bodyMaterial);
            const fin2 = new THREE.Mesh(finGeom, bodyMaterial);
            fin2.rotation.z = Math.PI / 2;
            fin1.position.z = -radius * 0.5; // 尾部
            fin2.position.z = -radius * 0.5;
            this.model.add(fin1, fin2);
        } else {
            const geometry = new THREE.SphereGeometry(radius, 8, 8);
            this.model.add(new THREE.Mesh(geometry, bodyMaterial));
        }

        this.mesh.position.copy(position);
        this.scene.add(this.mesh);

        this.targetPos = targetPos; // 目標地点
        this.speed = speed;
        this.maxHealth = health;
        this.health = health;
        this.type = type;
        this.movementMode = movementMode;
        this.patternParams = patternParams;
        this.time = 0;
        this.impact = false;

        // 初期方向の設定
        if (this.movementMode === 'direct' || this.movementMode === 'flyby' || this.movementMode === 'crossing') {
            this.mesh.lookAt(targetPos);
            this.velocity = new THREE.Vector3().subVectors(targetPos, position).normalize().multiplyScalar(this.speed);
        } else if (this.movementMode === 'orbit') {
            // 旋回の初期設定
            this.orbitRadius = patternParams.radius || 50;
            this.orbitDirection = patternParams.direction || 1; // 1: CCW, -1: CW
            this.orbitSpeed = (speed / this.orbitRadius) * this.orbitDirection; // 角速度
            this.orbitCenter = targetPos.clone();
            this.angle = Math.atan2(position.z - this.orbitCenter.z, position.x - this.orbitCenter.x);

            // 初期の向き
            const nextX = this.orbitCenter.x + Math.cos(this.angle + 0.01) * this.orbitRadius;
            const nextZ = this.orbitCenter.z + Math.sin(this.angle + 0.01) * this.orbitRadius;
            this.mesh.lookAt(new THREE.Vector3(nextX, this.mesh.position.y, nextZ));
        }

        // ロックオンマーカー
        this.lockonMarker = this.createLockonMarker();
        this.lockonMarker.visible = false;
        this.mesh.add(this.lockonMarker);
    }

    createLockonMarker() {
        const size = this.radius * 2.5;
        const pts = [
            new THREE.Vector3(-size, -size, 0), new THREE.Vector3(size, -size, 0),
            new THREE.Vector3(size, size, 0), new THREE.Vector3(-size, size, 0),
            new THREE.Vector3(-size, -size, 0)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(pts);
        const material = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
        return new THREE.Line(geometry, material);
    }

    setLocked(isLocked) {
        this.lockonMarker.visible = isLocked;
    }

    update(dt, camera) {
        this.time += dt;

        if (this.movementMode === 'direct' || this.movementMode === 'flyby' || this.movementMode === 'crossing') {
            this.mesh.position.addScaledVector(this.velocity, dt);

            // 目的地に到達したか（Directのみ拠点を攻撃）
            if (this.mesh.position.distanceTo(this.targetPos) < 2.0) {
                if (this.movementMode === 'direct') {
                    this.impact = true;
                }
                this.remove(); // 画面外へ消える設定
            }
        } else if (this.movementMode === 'orbit') {
            this.angle += this.orbitSpeed * dt;
            const newX = this.orbitCenter.x + Math.cos(this.angle) * this.orbitRadius;
            const newZ = this.orbitCenter.z + Math.sin(this.angle) * this.orbitRadius;

            // 前のフレームの位置から向きを計算
            const nextPos = new THREE.Vector3(newX, this.mesh.position.y, newZ);
            this.mesh.lookAt(nextPos);
            this.mesh.position.copy(nextPos);

            // 旋回は時間経過で消える（一旦30秒）
            if (this.time > 30) this.remove();
        }

        // ヘリコのローター回転
        if (this.type === 'helicopter') {
            if (this.mainRotor) this.mainRotor.rotation.y += 15.0 * dt;
            if (this.tailRotor) this.tailRotor.rotation.x += 20.0 * dt;
        }

        // 地面衝突回避ロジック (航空機タイプのみ、かつ生存中)
        if (this.type !== 'missile' && this.type !== 'drone' && !this.isDead) {
            const minHeight = 10.0;
            if (this.mesh.position.y < minHeight) {
                // 上昇方向に速度を補正
                const pullUpForce = (minHeight - this.mesh.position.y) * 0.5;
                this.velocity.y += pullUpForce * dt * 20.0;

                // 進行方向も上に向け直す
                const lookTarget = this.mesh.position.clone().add(this.velocity);
                this.mesh.lookAt(lookTarget);
            }
        }

        // デフォルトのターゲットバンク
        let targetBank = 0;

        // 旋回モードでのバンク計算
        if (this.movementMode === 'orbit') {
            // orbitSpeed が正(CCW/Left)なら左に傾く(バンク正)
            targetBank = this.orbitSpeed * 1.5;
        }

        // 旋回検知
        if (this.lastRotationY !== undefined) {
            let yawDiff = this.mesh.rotation.y - this.lastRotationY;
            if (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
            if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

            if (Math.abs(yawDiff) > 0.001) {
                // 左旋回 (yawDiff > 0) で左バンク (roll > 0)
                targetBank += yawDiff * 10.0;
            }
        }
        this.lastRotationY = this.mesh.rotation.y;

        // バンク角の平滑化
        this.currentBank = (this.currentBank || 0);
        this.currentBank = THREE.MathUtils.lerp(this.currentBank, targetBank, 5.0 * dt);
        this.currentBank = THREE.MathUtils.clamp(this.currentBank, -Math.PI / 3, Math.PI / 3);

        // ロール・ピッチ回転の適用 (model グループに対して行うことで累積を防ぐ)
        if (this.model) {
            this.model.rotation.set(0, 0, 0); // 一旦リセット
            this.model.rotation.z = this.currentBank;

            // ヘリ特有の前傾姿勢
            if (this.type === 'helicopter') {
                this.model.rotation.x = 0.2;
            }
        }

        // マーカーをカメラの方向に向ける
        if (this.lockonMarker.visible && camera) {
            this.lockonMarker.quaternion.copy(camera.quaternion);
        }
    }
}

/**
 * 爆発エフェクトクラス
 */
export class Explosion extends Entity {
    constructor(scene, position) {
        super(scene, position, 0xffaa00, 0.1);
        this.growthRate = 10.0;
        this.maxRadius = 5.0;
        this.currentRadius = 0.5;
        this.mesh.material = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 1.0 });
    }

    update(dt) {
        this.currentRadius += this.growthRate * dt;
        this.mesh.scale.setScalar(this.currentRadius);
        this.mesh.material.opacity -= 1.5 * dt;

        if (this.mesh.material.opacity <= 0) {
            this.remove();
        }
    }
}

/**
 * 飛散するデブリ（部品）クラス
 */
export class Debris extends Entity {
    constructor(scene, position, color) {
        const radius = 0.2 + Math.random() * 0.4;
        super(scene, position, color, radius);

        // よりメカニックな形状にする（ランダムな多面体や箱）
        const types = ['box', 'tetra', 'sphere'];
        const type = types[Math.floor(Math.random() * types.length)];
        this.scene.remove(this.mesh);

        let geometry;
        if (type === 'box') geometry = new THREE.BoxGeometry(radius, radius, radius);
        else if (type === 'tetra') geometry = new THREE.TetrahedronGeometry(radius);
        else geometry = new THREE.SphereGeometry(radius, 4, 4);

        this.mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: color }));
        this.mesh.position.copy(position);
        this.scene.add(this.mesh);

        // ランダムな初速と回転
        const speed = 20 + Math.random() * 30;
        this.velocity = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).normalize().multiplyScalar(speed);

        this.rotationVel = new THREE.Vector3(
            Math.random() * 10,
            Math.random() * 10,
            Math.random() * 10
        );

        this.lifeTime = 1.0 + Math.random() * 1.5;
        this.gravity = new THREE.Vector3(0, -9.8, 0);
    }

    update(dt) {
        this.velocity.addScaledVector(this.gravity, dt); // 重力
        this.mesh.position.addScaledVector(this.velocity, dt);
        this.mesh.rotation.x += this.rotationVel.x * dt;
        this.mesh.rotation.y += this.rotationVel.y * dt;
        this.mesh.rotation.z += this.rotationVel.z * dt;

        this.lifeTime -= dt;
        if (this.lifeTime < 0.5) {
            this.mesh.material.transparent = true;
            this.mesh.material.opacity = this.lifeTime / 0.5;
        }

        if (this.lifeTime <= 0) {
            this.remove();
        }
    }
}
/**
 * 地対空射撃（演出用）- 独立した光弾
 */
export class AmbientAAFire extends Entity {
    constructor(scene, position, direction) {
        // プレイヤーと同じように黄色い光弾（発光感を出すために明るい黄色）
        super(scene, position, 0xffff44, 0.4);

        this.speed = 400; // 超高速で飛んでいく
        this.velocity = direction.normalize().multiplyScalar(this.speed);
        this.lifeTime = 3.5;

        this.mesh.material.transparent = true;
        this.mesh.material.opacity = 1.0;

        // 球体ベースの形状を少しだけ進行方向に伸ばして弾丸らしくする
        this.mesh.scale.set(0.6, 0.6, 1.2);
        this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
    }

    update(dt) {
        this.mesh.position.addScaledVector(this.velocity, dt);
        this.lifeTime -= dt;

        // 飛翔距離に応じて徐々に小さくする (遠近感)
        // 1.0 -> 0.1 まで縮小
        const scaleFactor = Math.max(0.1, this.lifeTime / 3.5);
        this.mesh.scale.set(0.6 * scaleFactor, 0.6 * scaleFactor, 1.2 * scaleFactor);

        // 最後の0.3秒で急速にフェードアウト
        if (this.lifeTime < 0.3) {
            this.mesh.material.opacity = this.lifeTime / 0.3;
        }

        if (this.lifeTime <= 0) {
            this.remove();
        }
    }
}
