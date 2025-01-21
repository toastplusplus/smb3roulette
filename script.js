'use strict';

// Resource and loading data
const imageIds = [
  'background',
  'border',
  'mushroom',
  'flower',
  'star'
];
const audioIds = [
  'music_loop',
  'one_up',
  'match',
  'no_match'
];

const imageMap = new Map();
const audioMap = new Map();

let pageVisible = document.visibilityState === 'visible';
let loadedFiles = false;
let started = false;

// Canvas data
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext("2d");
const box = canvas.getBoundingClientRect();
let canvasWidth = box.width;
let canvasHeight = box.height;

const matchData = [{
  imageId: 'star',
  prizeId: '5up'
}, {
  imageId: 'mushroom',
  prizeId: '2up'
}, {
  imageId: 'flower',
  prizeId: '3up'
}, {
  imageId: 'mushroom',
  prizeId: '2up'
}];

const RESET_POSITION = -576; // -1 * (512 + 64)
const ROW_START_SPEEDS = [-.16, .16, -.24];
const ROW_START_OFFSETS = [0, 0, 0];

const RENDER_OFFSET = -64;
const IMAGE_OFFSET = 128;
const REPEAT_SIZE = IMAGE_OFFSET * 4;

const SLOWING_SPEED_MULT = .5;
const SHAKE_TIME_MS = 500;

let lastTimestamp = null;
let currentGameHandler = null;

let rowSpeeds = ROW_START_SPEEDS.slice();
let rowOffsets = ROW_START_OFFSETS.slice();
let rowMatches = [null, null, null];
let currentRowIndex = 0;
let isSlowing = false;
let slowDestination = null;

let isShaking = false;
let shakeTime = 0;

// Music and image loading process
let loadingPromises = [];
for (const imageId of imageIds) {
  let promise = new Promise((resolve, reject) => {
    const imageElem = document.getElementById(imageId);
    if (imageElem.complete) {
      console.log(`Loaded image ${imageId} (loaded immediately)`);
      resolve();
    } else {
      imageElem.addEventListener('load', () => {
        console.log(`Loaded image ${imageId}`);
        resolve();
      });
      imageElem.addEventListener('error', (err) => {
        console.error(`Error loading image ${imageId}`);
        reject();
      });
    }
    imageMap.set(imageId, imageElem);
  });
  loadingPromises.push(promise);
}

for (const audioId of audioIds) {
  let promise = new Promise((resolve, reject) => {
    const audioElem = document.getElementById(audioId);
    audioElem.addEventListener('loadeddata', () => {
      console.log(`Loaded audio ${audioId}`);
      resolve()
    });
    audioElem.addEventListener('error', (err) => {
      console.error(`Error audio ${audioId}`);
      reject();
    });
    audioMap.set(audioId, audioElem);
  });
  loadingPromises.push(promise);
}

Promise.all(loadingPromises).then(() => {
  loadedFiles = true;
  if (started) {
    startup();
  }
});

function startup() {
  console.log('Starting');

  for (let match of matchData) {
    match.image = imageMap.get(match.imageId);
    match.prize = imageMap.get(match.prizeId);
  }
  
  currentGameHandler = new InteractiveGameHandler();

  document.getElementById('pressSpace').style.display = 'none';
  resizeCanvas();
  window.requestAnimationFrame(gameRender);
}

function handleInteraction() {
  if (!started) {
    started = true;
    if (loadedFiles) {
      startup();
    }
  } else {
    currentGameHandler.interact();
  }
}

document.addEventListener('visibilitychange', function() {
  pageVisible = document.visibilityState === 'visible';
  if (pageVisible) {
    console.log('Page visible');
    if (started) {
      window.requestAnimationFrame(gameRender);
    }
  } else {
    console.log('Page not visible');
    lastTimestamp = null;
  }
});

document.addEventListener('click', function(event) {
  handleInteraction();
});

document.addEventListener('keypress', function(event) {
  if (event.code === 'Space') {
    handleInteraction();
  }
});

function resizeCanvas() {
  const desiredAspectRatio = (13.0 / 9.0);
  const actualAspectRatio = window.innerWidth / window.innerHeight;

  if (actualAspectRatio > desiredAspectRatio) {
    canvasWidth = window.innerHeight * (13.0 / 9.0);
    canvasHeight = window.innerHeight;
  } else if (actualAspectRatio < desiredAspectRatio) {
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerWidth * (9.0 / 13.0);
  } else {
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;
  }

  canvasWidth = Math.floor(canvasWidth);
  canvasHeight = Math.floor(canvasHeight);
  canvas.setAttribute('width', `${canvasWidth}px`);
  canvas.setAttribute('height', `${canvasHeight}px`);

  // This seems to be need to reset whenever you resize in firefox
  ctx.webkitImageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.imageSmoothingEnabled = false;
}

window.addEventListener('resize', function() {
  if (started) {
    resizeCanvas();
  }
});

// RowIndex is the prize gmae row
// Offset is in logical game pixels, (234 pixels across)
function paintImageSegment(image, rowIndex, rowOffset) {
  const segmentSize = image.height / 7;
  const canvasSegmentWidth = canvasWidth / 14;
  const canvasSegmentHeight = canvasHeight / 9;
  const canvasOffset = (canvasWidth / 234) * rowOffset;

  // Note that when rendering the sprites in pieces we need to be careful about pixel rounding, as
  // otherwise the browser will do it for us, and sometimes leave gaps.

  // Top part is tiles 1-2 out of 7 in game
  // Middle part is tiles 3-5 out of 7 in game
  // Bottom part is tiles 6-7 out of 7 in game
  if (rowIndex === 0) {
    ctx.drawImage(image,
      0, 0,
      image.width, segmentSize * 2,
      canvasOffset, Math.floor(canvasSegmentHeight),
      canvasSegmentWidth * 6, Math.ceil(canvasSegmentHeight * 2));
  } else if (rowIndex === 1) {
    ctx.drawImage(image,
      0, segmentSize * 2,
      image.width, segmentSize * 3,
      canvasOffset, Math.floor(canvasSegmentHeight * 3),
      canvasSegmentWidth * 6, Math.ceil(canvasSegmentHeight * 3));
  } else {
    ctx.drawImage(image,
      0, segmentSize * 5,
      image.width, segmentSize * 2,
      canvasOffset, Math.floor(canvasSegmentHeight * 6),
      canvasSegmentWidth * 6, Math.ceil(canvasSegmentHeight * 2));
  }
}

class InteractiveGameHandler {
  render() {
    ctx.fillStyle = '000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
    const stage = imageMap.get('background');
    ctx.drawImage(stage, 0, 0, canvasWidth, canvasHeight);

    for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
      const rowOffset = rowOffsets[rowIndex];
      const rowModOffset = rowOffset % REPEAT_SIZE;

      // The idea here is to repeat the rendering to ensure there is always something on screen.
      // We could be slightly more efficient with the different directions to cut one loop.
      for (let renderRep = -1; renderRep <= 1; renderRep++) {
        for (let matchIndex = 0; matchIndex < matchData.length; matchIndex++) {
          const beforeOffset = rowModOffset + (renderRep * REPEAT_SIZE) + RENDER_OFFSET;
          const imageOffset = IMAGE_OFFSET * matchIndex;
          paintImageSegment(matchData[matchIndex].image, rowIndex, beforeOffset + imageOffset);
        }
      }
    }

    const border = imageMap.get('border');
    ctx.drawImage(border, 0, 0, canvasWidth, canvasHeight);
  }

  updateState(timePassed) {
    for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
      let newOffset = rowOffsets[rowIndex];
      newOffset += (rowSpeeds[rowIndex] * timePassed);
      rowOffsets[rowIndex] = newOffset;
    }

    if (isSlowing) {
      let shouldStop = false;
      if (rowSpeeds[currentRowIndex] < 0 && rowOffsets[currentRowIndex] < slowDestination) {
        shouldStop = true;
      } else if (rowSpeeds[currentRowIndex] > 0 && rowOffsets[currentRowIndex] > slowDestination) {
        shouldStop = true;
      }

      if (shouldStop) {
        isSlowing = false;
        rowOffsets[currentRowIndex] = slowDestination; // Put it at the exact right spot
        rowSpeeds[currentRowIndex] = 0;

        if (currentRowIndex < 2) {
          currentRowIndex++;
        } else {
          // Check for win
        }
      }
    }
  }

  interact() {
    if (isSlowing) {
      return;
    }

    isSlowing = true;
    rowSpeeds[currentRowIndex] *= SLOWING_SPEED_MULT;

    // determine the midpoint where we want to stop, and store the match data

    const rowOffset = (rowOffsets[currentRowIndex] + RENDER_OFFSET) % REPEAT_SIZE;

    if (rowSpeeds[currentRowIndex] < 0) { // If moving left
      const nextIndex = Math.floor(rowOffset / IMAGE_OFFSET); // negative index
      const rowBase = rowOffsets[currentRowIndex] - (rowOffsets[currentRowIndex] % REPEAT_SIZE);

      slowDestination = nextIndex * IMAGE_OFFSET + rowBase;
      rowMatches[currentRowIndex] = matchData[nextIndex];
    } else {
      const nextIndex = Math.ceil(rowOffset / IMAGE_OFFSET);
      const rowBase = rowOffsets[currentRowIndex] - (rowOffsets[currentRowIndex] % REPEAT_SIZE);

      slowDestination = nextIndex * IMAGE_OFFSET + rowBase;
      rowMatches[currentRowIndex] = matchData[nextIndex];
    }
  }
}

function gameRender(newTimestamp) {
  // Calculate time passed
  let timePassed = lastTimestamp ? (newTimestamp - lastTimestamp) : 0;
  lastTimestamp = newTimestamp;

  // Update the game state
  currentGameHandler.updateState(timePassed);

  // Render
  currentGameHandler.render();

  // Request next frame
  if (pageVisible) {
    window.requestAnimationFrame(gameRender);
  }
}
