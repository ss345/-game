import * as THREE from 'three';

/**
 * 上空の半球上のランダムな座標を取得
 * @param {number} radius 半球の半径
 * @returns {THREE.Vector3}
 */
export function getRandomHemispherePosition(radius) {
    // 上空のみ（Y > ground）に配置するための角度制限
    const polar = Math.random() * (Math.PI / 2 - 0.2);
    const azimuth = Math.random() * Math.PI * 2;

    const x = radius * Math.sin(polar) * Math.cos(azimuth);
    const y = radius * Math.cos(polar);
    const z = radius * Math.sin(polar) * Math.sin(azimuth);

    return new THREE.Vector3(x, y, z);
}

/**
 * 球体同士の衝突判定
 * @param {object} obj1 
 * @param {object} obj2 
 * @returns {boolean}
 */
export function checkCollision(obj1, obj2) {
    const dist = obj1.mesh.position.distanceTo(obj2.mesh.position);
    return dist < (obj1.radius + obj2.radius);
}
