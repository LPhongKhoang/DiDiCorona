import GameBase from "../interfaces/GameBase";

import MainView from "../views/MainView";
import PlayView from "../views/PlayView";

import Background from "../models/Background";
import Doctor from "../models/Doctor";
import Bullet from "../models/Bullet";
import Enemy from "../models/Enemy";
import EnemyPool from "../pool/EnemyPool";
import EnemyBulletPool from "../pool/EnemyBulletPool";
import QuadTree from "../utils/QuadTree";
import SoundPool from "../pool/SoundPool";
import User from "../models/User";
import LocalStorage from "../utils/LocalStorage";

export default class GameController extends GameBase {
  constructor() {
    super();

    // Init Views
    this.mainView = new MainView(this.startGame.bind(this));

    this.playView = new PlayView(
      this.restart.bind(this),
      this.pause.bind(this),
      this.resume.bind(this),
      this.exitGame.bind(this)
    );

    // Init status of game

    this.isGameExit = false;
    this.isGameOver = false;
    this.pauseStatus = false;

    // Init context for drawing from play view
    this.bgContext = this.playView.bgContext;
    this.shipContext = this.playView.shipContext;
    this.mainContext = this.playView.mainContext;

    // Initialize objects to contain their context and canvas information
    Background.prototype.context = this.bgContext;
    Background.prototype.canvasWidth = this.playView.bgCanvas.width;
    Background.prototype.canvasHeight = this.playView.bgCanvas.height;

    Doctor.prototype.context = this.shipContext;
    Doctor.prototype.playView = this.playView;
    Doctor.prototype.canvasWidth = this.playView.shipCanvas.width;
    Doctor.prototype.canvasHeight = this.playView.shipCanvas.height;

    Bullet.prototype.context = this.mainContext;
    Bullet.prototype.canvasWidth = this.playView.mainCanvas.width;
    Bullet.prototype.canvasHeight = this.playView.mainCanvas.height;

    Enemy.prototype.context = this.mainContext;
    Enemy.prototype.canvasWidth = this.playView.mainCanvas.width;
    Enemy.prototype.canvasHeight = this.playView.mainCanvas.height;
  }

  init() {
    return new Promise(async (resolve, reject) => {
      this.background = new Background(
        0,
        0,
        1,
        this.playView.bgCanvas.width,
        this.playView.bgCanvas.height,
        this.bgContext
      );

      // Audio files
      this.laser = new SoundPool(10);
      this.laser.init("laser");
      this.explosion = new SoundPool(20);
      this.explosion.init("explosion");

      this.backgroundAudio = new Audio("sounds/kick_shock.wav");
      this.backgroundAudio.loop = true;
      this.backgroundAudio.volume = 0.25;
      this.backgroundAudio.load();

      this.gameOverAudio = new Audio("sounds/game_over.wav");
      this.gameOverAudio.loop = true;
      this.gameOverAudio.volume = 0.25;
      this.gameOverAudio.load();

      // Get Ship
      this.doctor = Doctor.createDoctor();

      // Initialize the enemy pool object
      this.enemyBulletPool = new EnemyBulletPool(40);
      this.enemyBulletPool.init();

      Enemy.prototype.enemyBulletPool = this.enemyBulletPool;

      this.enemyPool = new EnemyPool(30);
      this.enemyPool.init();

      this.user = new User("", "", 0);
      Enemy.prototype.user = this.user;

      // Start QuadTree for detecting collision
      this.quadTree = new QuadTree({
        x: 0,
        y: 0,
        width: this.playView.mainCanvas.width,
        height: this.playView.mainCanvas.height
      });

      this.checkAudio = window.setInterval(() => {
        this.checkReadyState(resolve);
      }, 1000);
    });
  }

  /**
   * Ensure the game sound has loaded before starting the game
   */
  checkReadyState(resolve) {
    if (
      this.gameOverAudio.readyState === 4 &&
      this.backgroundAudio.readyState === 4
    ) {
      window.clearInterval(this.checkAudio);

      this.mainView.hideLoading();

      resolve(true);
    }
  }

  detectCollision() {
    let objects = [];
    this.quadTree.getAllObjects(objects);

    for (let x = 0; x < objects.length; x++) {
      let obj = [];
      this.quadTree.findObjects(obj, objects[x]);

      for (let y = 0; y < obj.length; y++) {
        // DETECT COLLISION ALGORITHM
        if (
          objects[x].x < obj[y].x + obj[y].width &&
          objects[x].x + objects[x].width > obj[y].x &&
          objects[x].y < obj[y].y + obj[y].height &&
          objects[x].y + objects[x].height > obj[y].y
        ) {
          if (objects[x].isCollidableWith(obj[y])) {
            objects[x].isColliding = true;
            obj[y].isColliding = true;
          } else if (["virus", "bacterias"].includes(objects[x].type)) {
            if (objects[x].isSlowdownWith(obj[y])) {
              objects[x].slowdown();
              obj[y].isColliding = true;
            }

            if (
              objects[x].type === "virus" &&
              objects[x].isDuplicatedWith(obj[y])
            ) {
              obj[y].isColliding = true;
              if (!objects[x].isDuplicate && !objects[x].isSlowdown) {
                objects[x].isDuplicate = true;
                this.enemyPool.addMoreEnemy();
              }
            }
          }
        }
      }
    }
  }

  beforeStartGame() {
    this.mainView.showMenuOption();
  }

  beforePlaying(arg) {
    // check if user exit game or not
    if (this.isGameExit) {
      this.clearStatusGame();
      this.isGameExit = false;
      this.isGameOver = false;
      this.pauseStatus = false;
    }
    this.user.id = arg;
    this.user.name = arg;

    if (!LocalStorage.containsUser(this.user.id)) {
      LocalStorage.addUser(this.user);
    }
  }

  doAfterInit() {
    this.playView.showMeta();
    this.doctor.draw();
    this.backgroundAudio.play();
    this.enemyPool.spawnWave();
  }

  beforeRender() {
    // Insert objects into quadtree
    this.quadTree.clear();
    this.quadTree.insert(this.doctor);
    this.quadTree.insert(this.doctor.bulletPool.getPool());
    this.quadTree.insert(this.enemyPool.getPool());
    this.quadTree.insert(this.enemyBulletPool.getPool());
    this.detectCollision();
    this.playView.updateScoreCounter(this.user.score);
  }

  renderCondition() {
    return this.doctor.alive && !this.isGameExit;
  }

  isPause() {
    return this.pauseStatus;
  }

  render() {
    this.background.draw();
    this.isGameOver = !this.doctor.move();
    if (this.isGameOver) {
      this.gameOver();
    }
    this.doctor.animateBulletBool();
    this.enemyPool.animate();
    this.enemyBulletPool.animate();

    // No more enemies
    if (this.enemyPool.getPool().length === 0) {
      this.enemyPool.spawnWave();
    }
  }

  pause() {
    if (this.doctor.alive) {
      this.pauseStatus = true;
    }
  }

  resume() {
    if (this.doctor.alive) {
      this.pauseStatus = false;
    }
  }

  // Game over
  gameOver() {
    this.backgroundAudio.pause();
    this.gameOverAudio.currentTime = 0;
    this.gameOverAudio.play();

    // save highScore of user
    this._saveHighScoreOfUser();

    this.playView.showGameOver();
  }

  exitGame() {
    // set renderCondition to false
    this.isGameExit = true;

    this.backgroundAudio.pause();
    this.backgroundAudio.currentTime = 0;
    this.gameOverAudio.pause();
    this.gameOverAudio.currentTime = 0;
    // save highScore of user
    this._saveHighScoreOfUser();
    this.mainView.showMenuOption();
  }

  // Restart the game
  restart() {
    this.gameOverAudio.pause();
    this.playView.hideGameOver();

    this.clearStatusGame();

    this.backgroundAudio.currentTime = 0;

    this.playingGame();
  }

  clearStatusGame() {
    this.bgContext.clearRect(
      0,
      0,
      this.playView.bgCanvas.width,
      this.playView.bgCanvas.height
    );
    this.shipContext.clearRect(
      0,
      0,
      this.playView.shipCanvas.width,
      this.playView.shipCanvas.height
    );
    this.mainContext.clearRect(
      0,
      0,
      this.playView.mainCanvas.width,
      this.playView.mainCanvas.height
    );

    this.quadTree.clear();

    this.background.reset();

    // Set the ship to start near the bottom middle of the canvas
    this.doctor.reset();

    this.enemyPool.reset();

    this.enemyBulletPool.reset();
    this.user.resetScore();
  }

  _saveHighScoreOfUser() {
    LocalStorage.updateScore(this.user);
  }
}
