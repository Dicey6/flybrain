// brain.js — circuit-motif neural controller for one agent.
// This is a hand-authored procedural network built from the same class of motifs
// described in the male Drosophila CNS connectome. It is not literal connectome data.
(function (global) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const N_SENS = 8;
  const LEFT_GROUP = [5, 6, 7];
  const RIGHT_GROUP = [1, 2, 3];
  const FRONT_IDX = 0;
  function sensorAngle(i) { return i * (Math.PI * 2 / N_SENS); }

  class Brain {
    constructor(seed, label) {
      this.label = label || 'BIO';
      this.rand = mulberry32(seed >>> 0);
      this.obstacleSensors = new Float32Array(N_SENS);
      this.foodSensors = new Float32Array(N_SENS);
      this.otherSensors = new Float32Array(N_SENS);
      this.obstacleRelay = new Float32Array(N_SENS);
      this.obstacleLateral = new Float32Array(N_SENS);
      this.foodRelay = new Float32Array(N_SENS);
      this.otherRelay = new Float32Array(N_SENS);
      this.hunger = 0.35 + this.rand() * 0.2;
      this.socialValence = (this.rand() * 2 - 1) * 0.4;
      this.socialTarget = this.socialValence;
      this.socialRetimer = 4 + this.rand() * 8;
      this.turnRate = 0;
      this.speedFactor = 1;
      this.frontDanger = 0;
      this.frontOther = 0;
      this.foodDrive = 0;
      this.otherDistNorm = 1;
      this.escapeEvents = 0;
      this.justEscaped = false;
      this.mode = 'wander';
      this.lastMode = 'wander';
      this.modeTimer = 0;
      this.otherFoodDrive = 0;
      this.orbitBias = this.rand() > 0.5 ? 1 : -1;
      this._escapeWindup = 0;
      this._pauseTimer = 0;
      this._pauseCooldown = 2.5 + this.rand() * 3.5;
      this._pauseTurn = 0;
      this._noisePhase = this.rand() * 100;
      this._t = 0;
    }

    eat() { this.hunger = Math.max(0, this.hunger - 0.55); }

    step(dt) {
      this._t += dt;
      this._pauseTimer = Math.max(0, this._pauseTimer - dt);
      this._pauseCooldown -= dt;
      if (this._pauseTimer <= 0 && this._pauseCooldown <= 0 && this.rand() < dt * 0.28) {
        this._pauseTimer = 0.45 + this.rand() * 1.15;
        this._pauseCooldown = 3.5 + this.rand() * 6;
        this._pauseTurn = (this.rand() * 2 - 1) * 1.8;
      }
      for (let i = 0; i < N_SENS; i++) {
        this.obstacleRelay[i] = Math.tanh(this.obstacleSensors[i] * 1.6 + this.obstacleRelay[i] * 0.35);
      }
      for (let i = 0; i < N_SENS; i++) {
        const l = this.obstacleRelay[(i - 1 + N_SENS) % N_SENS];
        const r = this.obstacleRelay[(i + 1) % N_SENS];
        this.obstacleLateral[i] = Math.tanh(this.obstacleRelay[i] * 1.3 - (l + r) * 0.4);
      }
      const leftDanger = LEFT_GROUP.reduce((s, i) => s + this.obstacleLateral[i], 0) / LEFT_GROUP.length;
      const rightDanger = RIGHT_GROUP.reduce((s, i) => s + this.obstacleLateral[i], 0) / RIGHT_GROUP.length;
      this.frontDanger = Math.max(0, this.obstacleLateral[FRONT_IDX]);

      for (let i = 0; i < N_SENS; i++) {
        this.foodRelay[i] = Math.tanh(this.foodSensors[i] * 1.4 + this.foodRelay[i] * 0.4);
      }
      const leftFood = LEFT_GROUP.reduce((s, i) => s + this.foodRelay[i], 0) / LEFT_GROUP.length;
      const rightFood = RIGHT_GROUP.reduce((s, i) => s + this.foodRelay[i], 0) / RIGHT_GROUP.length;
      this.foodDrive = Math.max(this.foodRelay[FRONT_IDX], (leftFood + rightFood) / 2);
      this.hunger = Math.min(1, this.hunger + dt * 0.012);
      const hungerGain = 0.4 + this.hunger * 1.1;

      for (let i = 0; i < N_SENS; i++) {
        this.otherRelay[i] = Math.tanh(this.otherSensors[i] * 1.5 + this.otherRelay[i] * 0.3);
      }
      const leftOther = LEFT_GROUP.reduce((s, i) => s + this.otherRelay[i], 0) / LEFT_GROUP.length;
      const rightOther = RIGHT_GROUP.reduce((s, i) => s + this.otherRelay[i], 0) / RIGHT_GROUP.length;
      this.frontOther = Math.max(0, this.otherRelay[FRONT_IDX]);
      this.otherDistNorm = 1 - Math.max(this.frontOther, (leftOther + rightOther) / 2);

      this.socialRetimer -= dt;
      if (this.socialRetimer <= 0) {
        this.socialTarget = this.rand() * 2 - 1;
        this.socialRetimer = 4 + this.rand() * 10;
      }
      this.socialValence += (this.socialTarget - this.socialValence) * Math.min(1, dt * 0.6);

      this._noisePhase += dt;
      const wander = Math.sin(this._noisePhase * 0.37) + Math.sin(this._noisePhase * 0.71) * 0.5;
      const obstacleTurn = (leftDanger - rightDanger) * 2.4;
      const foodTurn = (rightFood - leftFood) * 1.3 * hungerGain;
      const socialTurn = (rightOther - leftOther) * 1.6 * this.socialValence;
      let targetTurn = obstacleTurn + foodTurn * 0.65 + socialTurn + wander * 0.22;
      let targetSpeed = Math.max(0.12, 1 - this.frontDanger * 1.35);

      const inContest = this.otherDistNorm < 0.55 && this.socialValence > 0.35 && this.foodDrive > 0.2;
      let candidate;
      if (this._pauseTimer > 0) candidate = 'pause';
      else if (this.frontDanger > 0.3) candidate = 'avoid-obstacle';
      else if (inContest) candidate = 'contest-resource';
      else if (this.otherDistNorm < 0.55 && this.socialValence > 0.12) candidate = 'investigate';
      else if (this.otherDistNorm < 0.55 && this.socialValence < -0.12) candidate = 'avoid-agent';
      else if (this.foodDrive > 0.22) candidate = 'forage';
      else candidate = 'wander';

      this.modeTimer += dt;
      if (candidate !== this.lastMode && (candidate === 'pause' || this.modeTimer >= 0.35)) {
        this.lastMode = candidate;
        this.modeTimer = 0;
      }
      this.mode = this.lastMode;

      if (this.mode === 'contest-resource') {
        if (this.foodDrive + 0.05 < this.otherFoodDrive) {
          this.socialTarget = Math.min(this.socialTarget, -0.3);
          targetSpeed *= 0.55;
        } else targetSpeed = Math.min(1.4, targetSpeed + 0.35);
      }
      if (this.mode === 'investigate' && this.otherDistNorm < 0.28) {
        targetTurn += this.orbitBias * 1.8;
        targetSpeed = Math.min(targetSpeed, 0.7);
      }
      if (this.socialValence > 0.15 && this.otherDistNorm < 0.6 && this.mode !== 'contest-resource') {
        targetSpeed = Math.min(1.3, targetSpeed + 0.25 * this.socialValence);
      }
      if (this.foodDrive > 0.25) targetSpeed = Math.min(1.35, targetSpeed + this.foodDrive * 0.4);
      if (this.mode === 'pause') {
        targetTurn = this._pauseTurn;
        targetSpeed = 0;
      }

      this.justEscaped = false;
      const dangerTriggered = this.frontDanger > 0.62;
      const loomTriggered = this.frontOther > 0.72 && this.socialValence < -0.35;
      if ((dangerTriggered || loomTriggered) && this._escapeWindup <= 0 && this.mode !== 'escape') {
        this._escapeWindup = 0.09;
        this.mode = 'escape';
        this.lastMode = 'escape';
        this.modeTimer = 0;
      }
      if (this._escapeWindup > 0) {
        this._escapeWindup -= dt;
        targetTurn = this.turnRate;
        targetSpeed = 0.05;
        if (this._escapeWindup <= 0) {
          this.escapeEvents++;
          this.justEscaped = true;
          targetTurn = this.turnRate + (this.rand() > 0.5 ? 1 : -1) * (dangerTriggered ? 3.2 : 2.6);
          targetSpeed = 1.4;
        }
      }
      this.turnRate += (targetTurn - this.turnRate) * Math.min(1, dt * 4);
      this.speedFactor += (targetSpeed - this.speedFactor) * Math.min(1, dt * 3);
      return {
        turnRate: this.turnRate, speedFactor: this.speedFactor, frontDanger: this.frontDanger,
        hunger: this.hunger, socialValence: this.socialValence, mode: this.mode, escape: this.justEscaped
      };
    }
  }

  global.FlyBrain = { Brain, mulberry32, N_SENS, sensorAngle, LEFT_GROUP, RIGHT_GROUP, FRONT_IDX };
})(window);