export class GameState {
  constructor() {
    this.player1 = {
      x: 100,
      y: 300,
      width: 30,
      height: 30,
      speed: 5,
      score: 0
    };
    
    this.player2 = {
      x: 670,
      y: 300,
      width: 30,
      height: 30,
      speed: 5,
      score: 0
    };
    
    this.coins = [];
    this.maxCoins = 3;
    this.coinRadius = 10;
    
    this.arenaWidth = 800;
    this.arenaHeight = 600;
    
    this.startTime = Date.now();
    this.gameDuration = 3 * 60 * 1000; // 3 minuti
    
    this.scoreToWin = 10;
    
    // Genera monete iniziali
    this.spawnCoin();
  }
  
  update(input1, input2) {
    // Muovi player 1
    if (input1.up && this.player1.y > 0) this.player1.y -= this.player1.speed;
    if (input1.down && this.player1.y < this.arenaHeight - this.player1.height) {
      this.player1.y += this.player1.speed;
    }
    if (input1.left && this.player1.x > 0) this.player1.x -= this.player1.speed;
    if (input1.right && this.player1.x < this.arenaWidth - this.player1.width) {
      this.player1.x += this.player1.speed;
    }
    
    // Muovi player 2
    if (input2.up && this.player2.y > 0) this.player2.y -= this.player2.speed;
    if (input2.down && this.player2.y < this.arenaHeight - this.player2.height) {
      this.player2.y += this.player2.speed;
    }
    if (input2.left && this.player2.x > 0) this.player2.x -= this.player2.speed;
    if (input2.right && this.player2.x < this.arenaWidth - this.player2.width) {
      this.player2.x += this.player2.speed;
    }
    
    // Controlla collisioni con monete
    this.checkCoinCollisions();
    
    // Genera nuove monete se necessario
    if (this.coins.length < this.maxCoins) {
      this.spawnCoin();
    }
  }
  
  checkCoinCollisions() {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      
      // Collisione player 1
      if (this.isColliding(this.player1, coin)) {
        this.player1.score++;
        this.coins.splice(i, 1);
        continue;
      }
      
      // Collisione player 2
      if (this.isColliding(this.player2, coin)) {
        this.player2.score++;
        this.coins.splice(i, 1);
      }
    }
  }
  
  isColliding(player, coin) {
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    
    const distance = Math.sqrt(
      Math.pow(playerCenterX - coin.x, 2) +
      Math.pow(playerCenterY - coin.y, 2)
    );
    
    return distance < (player.width / 2 + this.coinRadius);
  }
  
  spawnCoin() {
    const margin = 50;
    this.coins.push({
      id: Date.now() + Math.random(),
      x: margin + Math.random() * (this.arenaWidth - margin * 2),
      y: margin + Math.random() * (this.arenaHeight - margin * 2)
    });
  }
  
  checkWinner() {
    if (this.player1.score >= this.scoreToWin) return 1;
    if (this.player2.score >= this.scoreToWin) return 2;
    return null;
  }
  
  getWinnerByScore() {
    if (this.player1.score > this.player2.score) return 1;
    if (this.player2.score > this.player1.score) return 2;
    return 1; // Pareggio: vince player 1 per semplicità
  }
  
  get timeRemaining() {
    return this.gameDuration - (Date.now() - this.startTime);
  }
  
  toJSON() {
    return {
      player1: this.player1,
      player2: this.player2,
      coins: this.coins,
      timer: Math.ceil(this.timeRemaining / 1000)
    };
  }
}
