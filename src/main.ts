import './style.css';
import { Game } from './runtime/Game.ts';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing #app root element.');
}

const game = new Game(root);
game.start();
