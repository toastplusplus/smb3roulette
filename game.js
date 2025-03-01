'use strict';

// Data for the roulette itself
// The IDs must match HTML image IDs in game.html
const matchData = [{
  imageId: 'star',
  prizeId: '5up',
  soundCount: 5
}, {
  imageId: 'mushroom',
  prizeId: '2up',
  soundCount: 2
}, {
  imageId: 'flower',
  prizeId: '3up',
  soundCount: 3
}, {
  imageId: 'mushroom',
  prizeId: '2up',
  soundCount: 2
}];

// Loading data
const imageMap = new Map();
const audioMap = new Map();

let pageVisible = document.visibilityState === 'visible';
let loadedFiles = false;
let audioStart = (!musicEnabled && ! soundEnabled); // Consider the audio started if everything is disabled
let started = false;

// Canvas data
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext("2d");
const box = canvas.getBoundingClientRect();
let canvasWidth = box.width;
let canvasHeight = box.height;

// Game logic constants
const PIXEL_WIDTH = 234;
const PIXEL_HEIGHT = 162;

const MATCH_PIXEL_WIDTH = 96;
const MATCH_PIXEL_HEIGHT = 112;

const PRIZE_PIXEL_WIDTH = 24;
const PRIZE_PIXEL_HEIGHT = 16;

const RESET_POSITION = -576; // -1 * (512 + 64)
const ROW_START_SPEEDS = [-.16, .16, -.24];
const ROW_START_OFFSETS = [0, 0, 0];

const RENDER_OFFSET = -64;
const IMAGE_OFFSET = 128;
const REPEAT_SIZE = IMAGE_OFFSET * 4;

const SLOWING_SPEED_MULT = .5;
const SHAKE_TIME_MS = 500;
const SHAKE_AMPLITUDE = 3;

const PRIZE_SPEED = -.1;
const PRIZE_SOUND_DELAY = 1000;
const PRIZE_TIME_PER_COUNT_MS = 1000;

const END_GAME_PAUSE_MS = 3000;

// The actual game state
let lastTimestamp = null;

let rowSpeeds = ROW_START_SPEEDS.slice();
let rowOffsets = ROW_START_OFFSETS.slice();
let rowMatches = [null, null, null];
let currentRowIndex = 0;
let isSlowing = false;
let slowDestination = null;
let isShaking = false;
let shakeTime = 0;
let shakeOffset = 0;
let isAwardingPrize = false;
let prizeId = null;
let prizeLocation = null;
let prizeTime = 0;
let isPlayingPrizeSounds = false;
let prizeSoundCount = 0;
let prizeSoundsPlayed = 0;
let prizeSoundTime = 0;
let endGamePause = false;
let lossPauseTime = 0;

// Music and image loading process
let loadingPromises = [];
for (const imageElem of document.images) {
  let promise = new Promise((resolve, reject) => {
    if (imageElem.complete) {
      console.log(`Loaded image ${imageElem.id} (loaded immediately)`);
      resolve();
    } else {
      imageElem.addEventListener('load', () => {
        console.log(`Loaded image ${imageElem.id}`);
        resolve();
      });
      imageElem.addEventListener('error', (err) => {
        console.error(`Error loading image ${imageElem.id}: ${err}`);
        reject();
      });
    }
    imageMap.set(imageElem.id, imageElem);
  });
  loadingPromises.push(promise);
}

const audioElems = document.querySelectorAll('audio');
for (const audioElem of audioElems) {
  let promise = new Promise((resolve, reject) => {
    audioElem.addEventListener('loadeddata', () => {
      console.log(`Loaded audio ${audioElem.id}`);
      resolve()
    });
    audioElem.addEventListener('error', (err) => {
      console.error(`Error audio ${audioElem.id}: ${err}`);
      reject();
    });
    audioMap.set(audioElem.id, audioElem);
  });
  loadingPromises.push(promise);
}

// Try to handle the case where the browser allows sound to be played without interaction
document.getElementById('empty').play().then(() => {
  audioStart = true;
  console.log('Allowed to play sound by default');
}).catch(() => {
  console.log('Not allowed to play sound by default');
});

Promise.all(loadingPromises).then(() => {
  loadedFiles = true;
  
  if (audioStart && !started) {
    startup();
  }
});

function playSfx(soundId) {
  if (soundEnabled) {
    audioMap.get(soundId).play();
  }
}

function playMusic(soundId) {
  if (musicEnabled) {
    audioMap.get(soundId).play();
  }
}

function stopSound(soundId) {
  const audioElem = audioMap.get(soundId);
  audioElem.pause();
  audioElem.currentTime = 0;
}

function startup() {
  console.log('Starting');
  started = true;

  for (let match of matchData) {
    match.image = imageMap.get(match.imageId);
    match.prize = imageMap.get(match.prizeId);
  }

  playMusic('music_loop');
  playMusic('pmeter_loop');
  document.getElementById('pressSpace').style.display = 'none';
  resizeCanvas();
  window.requestAnimationFrame(gameRender);
}

function resetGame() {
  rowSpeeds = ROW_START_SPEEDS.slice();
  rowOffsets = ROW_START_OFFSETS.slice();
  rowMatches = [null, null, null];
  currentRowIndex = 0;
  isSlowing = false;
  slowDestination = null;
  isShaking = false;
  shakeTime = 0;
  shakeOffset = 0;
  isAwardingPrize = false;
  prizeId = null;
  prizeLocation = null;
  prizeTime = 0;
  isPlayingPrizeSounds = false;
  prizeSoundCount = 0;
  prizeSoundsPlayed = 0;
  prizeSoundTime = 0;
  endGamePause = false;
  lossPauseTime = 0;

  playMusic('pmeter_loop');
}

function handleInteraction() {
  // If the user interacted, we should be able to play sounds
  if (!audioStart) {
    audioStart = true;
  }

  if (loadedFiles && !started) {
    startup();
  } else if (started) {
    interact();
  }
}

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
  if (audioStart) {
    resizeCanvas();
  }
});

// RowIndex is the prize gmae row
// Offset is in logical game pixels, (234 pixels across)
function paintImageSegment(image, rowIndex, rowOffset) {
  const segmentSize = image.height / 7;
  const canvasSegmentWidth = canvasWidth / 14;
  const canvasSegmentHeight = canvasHeight / 9;
  const canvasOffset = (canvasWidth / PIXEL_WIDTH) * rowOffset;

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

function paintPrize(image, heightOffset) {
  const minY = (canvasHeight / 2) - (((canvasHeight / PIXEL_HEIGHT) * PRIZE_PIXEL_HEIGHT) / 2);

  const xCord = (canvasWidth / 2) - ((PRIZE_PIXEL_WIDTH * (canvasWidth / PIXEL_WIDTH)) / 2);
  const yCord = Math.max((canvasHeight / PIXEL_HEIGHT) * heightOffset, minY);
  const destWidth = (canvasWidth / PIXEL_WIDTH) * PRIZE_PIXEL_WIDTH;
  const destHeight = (canvasHeight / PIXEL_HEIGHT) * PRIZE_PIXEL_HEIGHT;

  ctx.drawImage(image, xCord, yCord, destWidth, destHeight);
}

function render() {
  ctx.fillStyle = '000';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const stage = imageMap.get('background');
  ctx.drawImage(stage, 0, 0, canvasWidth, canvasHeight);

  for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
    let rowOffset = rowOffsets[rowIndex];
    if (rowIndex === currentRowIndex) {
      rowOffset += shakeOffset;
    }
    const rowModOffset = rowOffset % REPEAT_SIZE;

    // The idea here is to repeat the rendering to ensure there is always something on screen.
    // We could be slightly more efficient with the different directions to cut one loop.
    for (let renderRep = -1; renderRep <= 1; renderRep++) {
      for (let matchIndex = 0; matchIndex < matchData.length; matchIndex++) {
        const beforeOffset = rowModOffset + (renderRep * REPEAT_SIZE) + RENDER_OFFSET;
        let imageOffset = IMAGE_OFFSET * matchIndex;
        paintImageSegment(matchData[matchIndex].image, rowIndex, beforeOffset + imageOffset);
      }
    }
  }

  const border = imageMap.get('border');
  ctx.drawImage(border, 0, 0, canvasWidth, canvasHeight);

  if (prizeId) {
    paintPrize(imageMap.get(prizeId), prizeLocation);
  }
}

function updateState(timePassed) {
  // Handle rotation
  for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
    let newOffset = rowOffsets[rowIndex];
    newOffset += (rowSpeeds[rowIndex] * timePassed);
    rowOffsets[rowIndex] = newOffset;
  }

  // Handle slowing and stopping
  if (isSlowing) {
    let shouldStop = false;
    if (rowSpeeds[currentRowIndex] < 0 && rowOffsets[currentRowIndex] < slowDestination) {
      shouldStop = true;
    } else if (rowSpeeds[currentRowIndex] > 0 && rowOffsets[currentRowIndex] > slowDestination) {
      shouldStop = true;
    }

    if (shouldStop) {
      playSfx('stop');
      isSlowing = false;
      isShaking = true;
      rowOffsets[currentRowIndex] = slowDestination; // Put it at the exact right spot
      rowSpeeds[currentRowIndex] = 0;
    }
  } else if (isShaking) {
    // Handle row shaking
    shakeTime += timePassed;

    // We want a specific number of osselations in the total shake time
    // Math.sin((shakeTime / Math.PI) * 10) would get 1 osselations in 1ms
    // Math.sin((shakeTime / Math.PI) * 20) would get 2 osselations in 1ms
    shakeOffset = Math.sin(((shakeTime / Math.PI) * 20) / SHAKE_TIME_MS) * SHAKE_AMPLITUDE;
    if (currentRowIndex % 2 == 0) {
      shakeOffset *= -1;
    }

    if (shakeTime > SHAKE_TIME_MS) {
      isShaking = false;
      shakeTime = 0;
      shakeOffset = 0;

      if (currentRowIndex < 2) {
        currentRowIndex++;
      } else {
        handleEndGame();
      }
    }
  } else if (isAwardingPrize) {
    // Handle the prize display
    prizeLocation += timePassed * PRIZE_SPEED;
    prizeTime += timePassed;

    if (prizeTime > PRIZE_SOUND_DELAY) {
      isAwardingPrize = false;
      isPlayingPrizeSounds = true;
    }
  } else if (isPlayingPrizeSounds) {
    prizeSoundTime += timePassed;

    const soundIter = Math.floor(prizeSoundTime / PRIZE_TIME_PER_COUNT_MS);
    if (soundIter < prizeSoundCount) {
      if (soundIter >= prizeSoundsPlayed) {
        prizeSoundsPlayed++;
        playSfx('one_up');
      }
    } else {
      isPlayingPrizeSounds = false;
      endGamePause = true;
    }
  } else if (endGamePause) {
    // Handle loss pause
    lossPauseTime += timePassed

    if (lossPauseTime > END_GAME_PAUSE_MS) {
      resetGame();
    }
  }
}

function handleEndGame() {
  let matches = true;
  let currentImageId = null;
  let currentPrizeId = null;
  let currentPrizeSoundCount = null;
  for (let match of rowMatches) {
    if (!currentImageId) {
      currentImageId = match.imageId;
      currentPrizeId = match.prizeId;
      currentPrizeSoundCount = match.soundCount;
    } else {
      if (match.imageId !== currentImageId) {
        matches = false;
        break;
      }
    }
  }

  if (matches) {
    console.log(`Match with prize ${currentPrizeId}`);
    isAwardingPrize = true;
    prizeId = currentPrizeId;
    prizeSoundCount = currentPrizeSoundCount;
    prizeLocation = PIXEL_HEIGHT;
  } else {
    playSfx('no_match');
    endGamePause = true;
  }
}

function interact() {
  if (isSlowing || isShaking || isAwardingPrize || endGamePause) {
    return;
  }

  isSlowing = true;
  rowSpeeds[currentRowIndex] *= SLOWING_SPEED_MULT;

  // determine the midpoint where we want to stop, and store the match data

  const offsetWithoutRenderOffset = (rowOffsets[currentRowIndex] + RENDER_OFFSET)
  const rowOffset = (offsetWithoutRenderOffset) % REPEAT_SIZE;
  const rowBase = offsetWithoutRenderOffset - (offsetWithoutRenderOffset % REPEAT_SIZE);
  let nextIndex;

  if (rowSpeeds[currentRowIndex] < 0) { // If moving left
    nextIndex = Math.floor(rowOffset / IMAGE_OFFSET); // negative index
    slowDestination = nextIndex * IMAGE_OFFSET + rowBase;
    nextIndex += matchData.length;
  } else {
    nextIndex = (Math.ceil(rowOffset / IMAGE_OFFSET) + 1) % matchData.length;
    slowDestination = nextIndex * IMAGE_OFFSET + rowBase;
    if (slowDestination < offsetWithoutRenderOffset) {
      slowDestination += REPEAT_SIZE;
    }
  }

  nextIndex--;
  if (nextIndex == -1) {
    nextIndex = matchData.length - 1;
  }
  nextIndex %= matchData.length;
  rowMatches[currentRowIndex] = matchData[nextIndex];

  // Stop the pmeter sond if stopping the last row
  if (currentRowIndex === 2) {
    stopSound('pmeter_loop');
  }
}

function gameRender(newTimestamp) {
  // Calculate time passed
  let timePassed = lastTimestamp ? (newTimestamp - lastTimestamp) : 0;
  lastTimestamp = newTimestamp;

  // Update the game state
  updateState(timePassed);

  // Render
  render();

  // Request next frame
  if (pageVisible) {
    window.requestAnimationFrame(gameRender);
  }
}

// Twitch events
const refreshTokenExpireTime = (30 * 24 * 60 * 60 * 1000); // 30 days

function setError(errMsg) {
  console.error(errMsg);
  document.getElementById('errorDiv').textContent = errMsg;
}

function clearError() {
  document.getElementById('errorDiv').textContent = '';
}

class EventIdCache {
  constructor(maxItems = 100) {
    this.maxItems = maxItems;
    this.cache = new Set();
  }

  test(key) {
    let existed = this.cache.delete(key);
    this.cache.add(key);
    if (existed) {
      return true;
    }

    if (this.cache.size > this.maxItems) {
      this.cache.delete(this.cache.values().next().value);
    }
    return false;
  }
}

const eventIdCache = new EventIdCache();

let deviceCode = null;
let refreshToken = null;
let accessToken = null;
let accessTokenRefreshTimeout = null;
let twitchUserId = null;
let websocket = null;
let websocketTimeoutSeconds = null
let websocketTimeout = null;
let websocketSessionId = null;

function twitchTimeoutHandler() {
  console.log(`Reached Twitch's defined timeout of ${websocketTimeoutSeconds}, attempting reconnect`);
  websocket.close();
  websocketTimeoutSeconds = null;
  websocketTimeout = null;
  websocketSessionId = null;
  websocket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
}

function connectWebsocket() {
  websocket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

  websocket.addEventListener('open', (_event) => {
    console.log('Connected to Twitch events');
  });
  
  websocket.addEventListener('close', (event) => {
    clearTimeout(websocketTimeout);
    websocketTimeoutSeconds = null;
    websocketTimeout = null;
    websocketSessionId = null;

    if (event.code === 1006 || event.code === 1000) {
      console.log('Received websocket close with code 1006. Trying reconnect.');
      connectWebsocket();
    } else {
      setError(`Received websocket close from Twitch with code ${event.code} and reason ${event.reason} (try refreshing the page)`);
    }
  });
  
  websocket.addEventListener('message', (event) => {
    const eventData = JSON.parse(event.data);

    console.log(`Twitch event: ${JSON.stringify(eventData)}`);
    if (websocketTimeout) {
      clearTimeout(websocketTimeout);
      websocketTimeout = setTimeout(twitchTimeoutHandler, websocketTimeoutSeconds * 1000);
    }
  
    if (eventIdCache.test(eventData.metadata.message_id)) {
      console.log(`Ignoring message with ID "${eventData.metadata.message_id}", as it has been seen before`);
      return;
    }
  
    if (eventData.metadata.message_type === 'session_keepalive') {
      return;
    }

    if (eventData.metadata.message_type === 'session_welcome') {
      websocketTimeoutSeconds = eventData.payload.session.keepalive_timeout_seconds;
      websocketSessionId = eventData.payload.session.id;

      console.log(`Received session_welcome. Starting keepalive timeout for ${websocketTimeoutSeconds} seconds.`);

      clearTimeout(websocketTimeout);
      websocketTimeout = setTimeout(twitchTimeoutHandler, websocketTimeoutSeconds * 1000);

      subscribeToRedeems();

    } else if (eventData.metadata.message_type === 'session_reconnect') {
      clearTimeout(websocketTimeout);
      websocketTimeoutSeconds = null;
      websocketTimeout = null;
      websocketSessionId = null;

      websocket = new WebSocket(eventData.payload.session.reconnect_url);
    } else if (eventData.metadata.message_type === 'notification') {
      if (eventData.payload.event.reward.title === twitchRewardTitle) {
        handleInteraction();
      }
    }
  });
}

function subscribeToRedeems() {
  const postData = {
    type: 'channel.channel_points_custom_reward_redemption.add',
    version: '1',
    condition: {
      broadcaster_user_id: twitchUserId
    },
    transport: {
      method: 'websocket',
      session_id: websocketSessionId
    }
  }
  fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Client-Id': twitchAppClientId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postData)
  }).then((resp) => {
    return resp.json();
  }).then((respJson) => {
    if (respJson.status) {
      setError(`Request to subscribe to channel points redeems failed with: ${respJson.message}`);
    } else {
      console.log('Successfully subscribed for channel points redeems');
    }
  }).catch((e) => {
    setError(`Request to subscribe to channel points redeems failed with: ${e.message}`);
  });
}

function requestAccessToken() {
  const formData = new FormData();
  formData.set('client_id', twitchAppClientId);
  formData.set('scopes', 'channel:read:redemptions');
  formData.set('device_code', deviceCode);
  formData.set('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');

  fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: formData,
    headers: {
      'Accept': 'application/json'
    }
  }).then((resp) => {
    return resp.json();
  }).then((respJson) => {
    if (respJson.status && respJson.message === 'authorization_pending') {
      setError(`You need to accept the Twitch auth using auth.html. Requesting an access token failing with 'authorization_pending'`);
    } else if (respJson.status) {
      setError(`Request to get Twitch auth token failed with: ${respJson.message}`);
    } else {
      clearError();

      accessToken = respJson.access_token;
      refreshToken = respJson.refresh_token;

      const timeNow = new Date().getTime();
      localStorage.setItem('smb3AccessToken', accessToken);
      localStorage.setItem('smb3AccessTokenExpireTime', timeNow + (respJson.expires_in * 1000));
      localStorage.setItem('smb3RefreshToken', refreshToken);
      localStorage.setItem('smb3RefreshTokenExpireTime', timeNow + refreshTokenExpireTime); // Not in response

      accessTokenRefreshTimeout = setTimeout(refreshAccessToken, (respJson.expires_in * 1000));

      getTwitchUserId();
    }
  }).catch((e) => {
    setError(`Request to get Twitch auth failed with: ${e.message}`);
  });
}

function getTwitchUserId() {
  fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(twitchUserName)}`, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Client-Id': twitchAppClientId,
      'Content-Type': 'application/json',
    },
  }).then((resp) => {
    return resp.json();
  }).then((respJson) => {
    if (respJson.status) {
      setError(`Request to get user information from Twitch failed with: ${respJson.message}`);
    } else {
      clearError();

      twitchUserId = respJson.data[0].id;
      console.log('Retrieved Twitch user ID');
      connectWebsocket();
    }
  }).catch((e) => {
    setError(`Request to get user information from Twitch failed with: ${e.message}`);
  });
}

function refreshAccessToken() {
  console.log('Refreshing access token');

  const formData = new FormData();
  formData.set('grant_type', 'refresh_token');
  formData.set('refresh_token', refreshToken);
  formData.set('client_id', twitchAppClientId);

  fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: formData,
    headers: {
      'Accept': 'application/json'
    }
  }).then((resp) => {
    return resp.json();
  }).then((respJson) => {
    if (respJson.status) {
      setError(`Request to refresh Twitch auth token failed with: ${respJson.message}`);
    } else {
      clearError();

      accessToken = respJson.access_token;
      refreshToken = respJson.refresh_token;

      const timeNow = new Date().getTime();
      localStorage.setItem('smb3AccessToken', accessToken);
      localStorage.setItem('smb3AccessTokenExpireTime', timeNow + (respJson.expires_in * 1000));
      localStorage.setItem('smb3RefreshToken', refreshToken);
      localStorage.setItem('smb3RefreshTokenExpireTime', timeNow + refreshTokenExpireTime); // Not in response
    }
  }).catch((e) => {
    setError(`Request to refresh Twitch auth token failed with: ${e.message}`);
  });
}

if (twitchEnabled) {
  // Try to load existing tokens up
  const deviceCodeStorage = localStorage.getItem('smb3DeviceCode');
  const deviceCodeExpireTimeStorage = localStorage.getItem('smb3DeviceCodeExpireTime');
  const refreshTokenStorage = localStorage.getItem('smb3RefreshToken');
  const refreshTokenTimeStorage = localStorage.getItem('smb3RefreshTokenExpireTime');
  const accessTokenStorage = localStorage.getItem('smb3AccessToken');
  const accessTokenExpireTimeStorage = localStorage.getItem('smb3AccessTokenExpireTime');

  // Only assign the values if they are not expired
  const currentTime = new Date().getTime();
  if (deviceCodeStorage && deviceCodeExpireTimeStorage && currentTime < Number(deviceCodeExpireTimeStorage)) {
    deviceCode = deviceCodeStorage;
  }
  if (refreshTokenStorage && refreshTokenTimeStorage && currentTime < Number(refreshTokenTimeStorage)) {
    refreshToken = refreshTokenStorage;
  }
  if (accessTokenStorage && accessTokenExpireTimeStorage && currentTime < Number(accessTokenExpireTimeStorage)) {
    accessToken = accessTokenStorage;
  }

  if (accessToken && refreshToken) {
    accessTokenRefreshTimeout = setTimeout(refreshAccessToken, Number(refreshTokenTimeStorage) - currentTime);
    getTwitchUserId();
  } else if (refreshToken) {
    refreshAccessToken();
  } else if (deviceCode) {
    requestAccessToken();
  } else {
    if (!deviceCodeStorage) {
      setError('There is no device code in local storage, so you need to open auth.html');
    } else {
      setError('Your device code authorization expired, so you need to open auth.html');
    }
  }
}