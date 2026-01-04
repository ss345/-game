/**
 * Web Audio APIを使用したプロセッショナル・オーディオ・マネージャー
 */
export class AudioManager {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * 爆発音を生成・再生
     */
    playExplosion() {
        if (!this.ctx) return;
        this.resume();

        const duration = 1.5;
        const oscillator = this.ctx.createOscillator();
        const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);

        // ホワイトノイズの生成
        for (let i = 0; i < noiseBuffer.length; i++) {
            noiseData[i] = Math.random() * 2 - 1;
        }

        const noiseSource = this.ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noiseSource.start();
        noiseSource.stop(this.ctx.currentTime + duration);

        // 低音の「ドーン」というインパクトを追加
        const punch = this.ctx.createOscillator();
        const punchGain = this.ctx.createGain();
        punch.type = 'triangle';
        punch.frequency.setValueAtTime(150, this.ctx.currentTime);
        punch.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.3);

        punchGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
        punchGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        punch.connect(punchGain);
        punchGain.connect(this.ctx.destination);

        punch.start();
        punch.stop(this.ctx.currentTime + 0.3);
    }

    /**
     * 発射音を生成・再生
     */
    playFire(type = 'vulcan') {
        if (!this.ctx) return;
        this.resume();

        const duration = 0.1;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(type === 'vulcan' ? 200 : 100, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + duration);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }
}

export const audioManager = new AudioManager();
