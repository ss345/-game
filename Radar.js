export class Radar {
    constructor(containerId, gameLoop) {
        this.gameLoop = gameLoop;
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'radar-canvas';
        this.ctx = this.canvas.getContext('2d');

        this.size = 200;
        this.canvas.width = this.size;
        this.canvas.height = this.size;

        this.container = document.getElementById(containerId);
        this.container.appendChild(this.canvas);

        this.range = 150; // Radar range in world units
    }

    update() {
        this.ctx.clearRect(0, 0, this.size, this.size);

        // 背景（円）
        this.ctx.beginPath();
        this.ctx.arc(this.size / 2, this.size / 2, this.size / 2 - 2, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0, 40, 0, 0.5)';
        this.ctx.fill();
        this.ctx.strokeStyle = '#0f0';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        // グリッド線
        this.ctx.beginPath();
        this.ctx.moveTo(this.size / 2, 0);
        this.ctx.lineTo(this.size / 2, this.size);
        this.ctx.moveTo(0, this.size / 2);
        this.ctx.lineTo(this.size, this.size / 2);
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
        this.ctx.stroke();

        // プレイヤーの向き（視覚的なFOVコーン）
        const rotationY = this.gameLoop.camera.rotation.y;
        const fov = this.gameLoop.camera.fov * (Math.PI / 180); // Radian conversion

        this.ctx.save();
        this.ctx.translate(this.size / 2, this.size / 2);

        // 視界範囲（扇形）
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        // カメラの正面は -Z 方向（2Dでは上方向が -Z または +X depending on mapping）
        // 現在のEnemyマッピングでは dx (X) と dz (Z) をそのままプロットしているので
        // 回転角 rotationY は Y軸周り（XZ平面上）
        // 扇形の開始角と終了角を計算
        const startAngle = -rotationY - Math.PI / 2 - fov / 2;
        const endAngle = -rotationY - Math.PI / 2 + fov / 2;

        this.ctx.arc(0, 0, this.size / 2 - 2, startAngle, endAngle);
        this.ctx.closePath();
        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
        this.ctx.fill();

        // 視界の境界線
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        this.ctx.restore();

        // 敵の表示（回転コンテキスト内ではなく、絶対座標から回転させてプロット）
        this.ctx.save();
        this.ctx.translate(this.size / 2, this.size / 2);
        // 敵のプロット自体は rotationY に影響されない絶対座標系（XZ）で行う
        // ただし、もしレーダー自体を回転させるならここで rotate(-rotationY) するが、
        // 現状の実装は固定方位（北が上）と思われるので、視界コーンだけ回す。

        // 敵の表示
        this.gameLoop.enemies.forEach(enemy => {
            const pos = enemy.mesh.position;
            const dx = pos.x;
            const dz = pos.z;
            const dy = pos.y; // 高度

            // 自分（0,0,0）からの相対距離
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < this.range) {
                const scale = (this.size / 2) / this.range;
                const rx = dx * scale;
                const rz = dz * scale;

                // 高度に応じて色を変える (赤: 高い, 青: 低い)
                const heightFactor = Math.min(1, dy / 50);
                this.ctx.fillStyle = `rgb(${Math.floor(255 * heightFactor)}, ${Math.floor(255 * (1 - heightFactor))}, 255)`;

                this.ctx.beginPath();
                this.ctx.arc(rx, rz, 3, 0, Math.PI * 2);
                this.ctx.fill();

                // 敵がミサイルなら枠をつける
                if (enemy.type === 'missile') {
                    this.ctx.strokeStyle = '#fff';
                    this.ctx.stroke();
                }
            }
        });

        this.ctx.restore();

        // 中央（自分）
        this.ctx.fillStyle = '#ff0';
        this.ctx.beginPath();
        this.ctx.arc(this.size / 2, this.size / 2, 4, 0, Math.PI * 2);
        this.ctx.fill();
    }
}
